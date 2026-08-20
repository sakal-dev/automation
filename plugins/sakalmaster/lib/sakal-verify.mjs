#!/usr/bin/env node
// =============================================================================
// sakal-verify — the linter over `.sakal/` (SKA-017, Rev 2.1 tree).
//
// The point of the directory: `.sakal/` is the canon record, kept as FILES
// you can read, edit, diff and re-check while mistakes are still free.
//
// ZERO DEPENDENCIES, on purpose. It runs in a customer's repo where the only
// thing we can assume is the Node that Claude Code already brought. A linter
// that needs `npm install` first is a linter people skip.
//
// THE RULES, enforced on the data and obeyed by this script:
//   1. No status field anywhere in .sakal/ — files carry inputs; status is
//      derived from citations and bugs, never imported. A `status:` key is
//      an ERROR, not a warning.
//   2. No sync-state file, and NO SERVER MODE (SakalMaster is discontinued,
//      SPOS-267). This script is strictly LOCAL — it lints files and nothing
//      else. Prepare and verify work on a plane.
//   3. Templates live in the plugin. This script never writes to .sakal/.
//
// `context.md` is the desktop app's pre-existing artifact. It is IGNORED and
// never touched — we are guests in a namespace the product already owns.
//
// Exit: 0 = green · 1 = errors · 2 = bad invocation
//
//   node sakal-verify.mjs [--dir .sakal] [--repo-root .] [--scope sel] [--json]
// =============================================================================
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { execFileSync } from 'node:child_process'
// ONE reader, ONE slugger, ONE spec parser, ONE cite matcher — shared with the
// writer. SKA-024's whole point, and what makes the P4 fidelity gate honest:
// the checker parses the spec with the same function the emitter emitted from.
import {
  stripInlineComment, unquote, slug, anchorMatches, anchorMatchesText,
  parseSourceURI, parseSpec, FAMILIES, consumesOf, sectionByAnchor, normWS,
  yamlUnquote, findDeclaration, findTestLabel,
} from './sakal-shared.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const DIR = opt('--dir', '.sakal')
const ROOT = opt('--repo-root', '.')
const SCOPE = opt('--scope', null)   // limit reporting to a subtree or file
const JSON_OUT = args.includes('--json')

const problems = []
const err = (file, line, code, msg, fix) => problems.push({ sev: 'error', file, line, code, msg, fix })
const warn = (file, line, code, msg, fix) => problems.push({ sev: 'warn', file, line, code, msg, fix })
const rel = p => relative(ROOT, p) || p

// Rule 1, everywhere a field can appear.
const STATUS_KEYS = new Set(['status', 'state', '_st', '_derived', 'verified', 'enforced', 'done', 'complete'])

// ── the restricted grammar ───────────────────────────────────────────────────
// Smaller than YAML on purpose: scalars, `- key — label` entries, and indented
// `field: value` beneath an entry. A grammar you can hold in your head is one
// whose error messages can be specific, and specific is the only kind worth
// printing.
function parseKV(text, file, startLine = 1) {
  const out = {}; let listKey = null
  text.split('\n').forEach((raw, i) => {
    const line = startLine + i
    if (!raw.trim() || raw.trim().startsWith('#')) return
    const item = raw.match(/^\s+-\s+(.*)$/)
    if (item) {
      if (!listKey) return err(file, line, 'PARSE', `list item with no key above it: "${raw.trim()}"`, 'a "- item" line must follow a "key:" line')
      out[listKey].value.push({ text: item[1].trim(), line }); return
    }
    // An indented `field: value` under an open `key:` is a one-level block —
    // the shape `app_profile:` uses (SKA-025). Deeper nesting stays a refusal.
    const nested = raw.match(/^\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/)
    if (nested) {
      if (!listKey) return err(file, line, 'PARSE', `"${nested[1]}:" is indented under nothing: "${raw.trim()}"`, 'an indented field needs an open "key:" line above it')
      if (STATUS_KEYS.has(nested[1].toLowerCase())) return err(file, line, 'STATUSFIELD', `"${nested[1]}" is a status field and must not exist in .sakal/`, 'status is derived from citations and bugs, never imported')
      out[listKey].fields ??= {}
      out[listKey].fields[nested[1]] = { value: unquote(stripInlineComment(nested[2])), line }
      return
    }
    const m = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/)
    if (!m) return err(file, line, 'PARSE', `not "key: value" and not a "- item": "${raw.trim()}"`, 'every line is `key: value` or an indented `- item`')
    const [, k, v] = m
    if (STATUS_KEYS.has(k.toLowerCase())) err(file, line, 'STATUSFIELD', `"${k}" is a status field and must not exist in .sakal/`, 'status is derived from citations and bugs — files carry inputs only')
    if (k in out) err(file, line, 'DUPKEY', `"${k}" is set twice`, `first was line ${out[k].line}`)
    const clean = stripInlineComment(v)
    if (clean === '') { listKey = k; out[k] = { value: [], line, list: true } }
    else { listKey = null; out[k] = { value: unquote(clean), line } }
  })
  return out
}

// A collection file: `<collection>:` then `- key — label` entries, each
// optionally followed by indented `field: value` lines.
function parseCollection(path, collection) {
  const f = rel(path), entries = new Map()
  if (!existsSync(path)) { err(f, 1, 'MISSING', `${f} is missing`, `prepare writes it; it holds the ${collection}`); return entries }
  let seenHeader = false, current = null
  readFileSync(path, 'utf8').split('\n').forEach((raw, i) => {
    const line = i + 1
    if (!raw.trim() || raw.trim().startsWith('#')) return
    const head = raw.match(/^([A-Za-z_]+)\s*:\s*$/)
    if (head) {
      if (head[1] !== collection) err(f, line, 'COLLECTION', `expected "${collection}:" but found "${head[1]}:"`, `this file holds ${collection}`)
      seenHeader = true; current = null; return
    }
    const item = raw.match(/^\s*-\s+(\S+)\s+—\s+(.*)$/)
    if (item) {
      const [, key, label] = item
      if (!seenHeader) err(f, line, 'COLLECTION', `entry before the "${collection}:" header`, `start the file with "${collection}:"`)
      if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(key)) err(f, line, 'KEYFMT', `key "${key}" has characters that will not survive as a key`, 'letters, digits, dot, dash, slash, underscore')
      if (entries.has(key)) err(f, line, 'DUPKEY', `"${key}" is declared twice`, 'keys are identity — one declaration each')
      current = { key, label: stripInlineComment(label), line, fields: {} }; entries.set(key, current); return
    }
    const sub = raw.match(/^\s+([A-Za-z_]+)\s*:\s*(.*)$/)
    if (sub) {
      if (!current) return err(f, line, 'PARSE', `"${sub[1]}:" does not belong to any entry`, 'indented fields follow a "- key — label" line')
      if (STATUS_KEYS.has(sub[1].toLowerCase())) return err(f, line, 'STATUSFIELD', `"${sub[1]}" is a status field and must not exist in .sakal/`, 'status is derived from citations and bugs, never imported')
      current.fields[sub[1]] = { value: unquote(stripInlineComment(sub[2])), line }; return
    }
    err(f, line, 'PARSE', `unrecognised line: "${raw.trim()}"`, 'expected "- key — label" or an indented "field: value"')
  })
  return entries
}

// ── provenance ───────────────────────────────────────────────────────────────
// A source pointing at a doc that was renamed is worse than no source: it looks
// like evidence. Checked against the real repo, every run.
function checkSource(src, file, line, what) {
  if (!src) return err(file, line, 'NOSRC', `${what} has no \`source:\``, 'add `source: docs/<file>#<anchor>`, or `source: none (drafted)` to say so out loud')
  if (/^none\b/i.test(src)) return warn(file, line, 'DRAFTED', `${what} is drafted with no document behind it`, 'fine if deliberate — listed so nobody mistakes it for something the repo said')
  const [path, anchor] = src.split('#')
  const abs = join(ROOT, path.trim())
  if (!existsSync(abs)) return err(file, line, 'SRCGONE', `source file does not exist: ${path.trim()}`, 'the doc moved or was deleted — repoint it, or mark it `none (drafted)`')
  if (anchor) {
    // Both sides go through the SAME slugger, which is what lets anchors written
    // by an older prepare still match. Prefix match, because real headings are
    // long and improving a title should not break its source.
    const { hit, duplicate, known } = anchorMatches(abs, anchor)
    if (!hit) return err(file, line, 'SRCANCHOR', `source file exists but has no section starting "#${anchor}"`, `headings found: ${known.slice(0, 4).join(', ') || '(none)'}…`)
    if (duplicate) warn(file, line, 'SRCDUP', `"#${anchor}" matches more than one heading in ${path.trim()}`, 'the matcher will not silently pick one — disambiguate the heading or the anchor')
  }
}

// ── pinned sources and the P4 fidelity gate (SKA-025) ────────────────────────
// A prepare-emitted source is `<owner>/<repo>:<path>#<anchor>@<short-sha>`.
// Fidelity compares AC text and epic sections against the spec AT THE PIN,
// through `git show <sha>:<path>` — NOT the working tree — so the gate is
// identical before and after docs/specs/ is deleted (R1), and the pin is
// load-bearing rather than decorative. Still strictly LOCAL: git objects live
// in the repo; nothing here contacts a server.
const showCache = new Map()
function gitShow(sha, path) {
  const k = `${sha}:${path}`
  if (showCache.has(k)) return showCache.get(k)
  let out = null
  // `sha:./path` is cwd-relative — correct at a repo root AND in a
  // subdirectory spec-home (Business/ inside a parent repo).
  try { out = execFileSync('git', ['-C', ROOT, 'show', `${sha}:./${path}`], { encoding: 'utf8' }) } catch { out = null }
  showCache.set(k, out); return out
}
let originRepo = null
try {
  const m = execFileSync('git', ['-C', ROOT, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim().match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)
  if (m) originRepo = m[1]
} catch { /* not a git repo, or no origin — fallbacks below say so */ }

// Resolve a pinned source to spec CONTENT, stating which plane it came from.
function resolvePinned(uri, file, line, what) {
  if (uri.sha) {
    const c = gitShow(uri.sha, uri.path)
    if (c != null) return { content: c, how: `@${uri.sha}` }
    const wt = join(ROOT, uri.path)
    if (existsSync(wt)) {
      warn(file, line, 'PINMISS', `${what}: pin ${uri.sha} does not resolve in this repo's git — compared against the working tree instead`, 'a shallow clone or a rewritten history; re-run prepare to re-pin')
      return { content: readFileSync(wt, 'utf8'), how: 'working tree (pin unresolvable)' }
    }
  } else {
    const wt = join(ROOT, uri.path)
    if (existsSync(wt)) {
      problems.push({ sev: 'info', file, line, code: 'WTFALLBACK', msg: `${what}: source carries no pin — checked against the working tree`, fix: 'fine on a fresh tree; prepare adds the pin' })
      return { content: readFileSync(wt, 'utf8'), how: 'working tree (no pin)' }
    }
  }
  if (uri.repo && originRepo && uri.repo !== originRepo) {
    problems.push({ sev: 'info', file, line, code: 'CROSSREPO', msg: `${what}: source lives in ${uri.repo}, not this repo — not resolvable here`, fix: 'cross-repo claims are not verifiable from this tree; check them in that repo directly' })
    return { content: null }
  }
  err(file, line, 'SRCGONE', `${what}: source ${uri.path}${uri.sha ? `@${uri.sha}` : ''} resolves neither through git nor on disk`, 'the doc moved or the pin is wrong — re-run prepare, or repoint it')
  return { content: null }
}

// The fenced-yaml AC block (Q6 shape): `- ac:` / `text:` / `cite:` entries.
function parseFencedACs(body, bodyStart, file) {
  const acs = []; let inYaml = false, sawFence = false, ac = null, cite = null
  body.forEach((raw, i) => {
    const line = bodyStart + i
    if (/^```yaml\s*$/.test(raw)) { inYaml = true; sawFence = true; return }
    if (/^```\s*$/.test(raw)) { inYaml = false; ac = null; cite = null; return }
    if (!inYaml) return
    if (!raw.trim() || raw.trim().startsWith('#')) return
    let m
    if ((m = raw.match(/^-\s+ac:\s*(\S+)\s*$/))) { ac = { id: m[1], line, text: null, cites: [], citeOpen: false }; acs.push(ac); cite = null; return }
    if (!ac) return err(file, line, 'PARSE', `line belongs to no \`- ac:\` entry: "${raw.trim()}"`, 'the yaml block is a list of `- ac:` entries')
    if ((m = raw.match(/^\s+marker:\s*(.*)$/))) { ac.marker = yamlUnquote(m[1]); ac.markerLine = line; return }
    if ((m = raw.match(/^\s+range:\s*(.*)$/))) { ac.range = yamlUnquote(m[1]); ac.rangeLine = line; return }
    if ((m = raw.match(/^\s+tag:\s*(.*)$/))) { ac.tag = yamlUnquote(m[1]); ac.tagLine = line; return }
    if ((m = raw.match(/^\s+text:\s*(.*)$/))) { ac.text = yamlUnquote(m[1]); ac.textLine = line; return }
    if ((m = raw.match(/^\s+cite:\s*\[\s*\]\s*$/))) { ac.citeOpen = false; return }
    if ((m = raw.match(/^\s+cite:\s*$/))) { ac.citeOpen = true; return }
    if ((m = raw.match(/^\s+-\s+kind:\s*(\S+)\s*$/))) {
      if (!ac.citeOpen) err(file, line, 'PARSE', 'a cite entry outside an open `cite:` list', 'write `cite:` on its own line, then `- kind: …`')
      cite = { kind: m[1], line }; ac.cites.push(cite); return
    }
    if (cite && (m = raw.match(/^\s+(path|symbol|sha|note):\s*(.*)$/))) { cite[m[1]] = yamlUnquote(m[2]); return }
    err(file, line, 'PARSE', `unrecognised line in the AC block: "${raw.trim()}"`, 'expected `- ac:` · `marker:` · `text:` · `cite:` (or `cite: []`) · `- kind:` · path/symbol/sha/note')
  })
  return { acs, sawFence }
}

// ── content rules that are genuinely checkable ───────────────────────────────
// LINTABLE (below): vagueness, one-claim-per-AC, story sentence shape, key
// format, reference resolution, provenance, welded evidence, status fields.
// JUDGMENT (not lintable, and no linter should pretend otherwise): whether an
// AC is the RIGHT AC, whether an epic is worth shipping, whether a journey is
// one a real person walks.
const VAGUE = ['appropriate', 'properly', 'correctly', 'as needed', 'etc', 'and so on', 'fast', 'slow',
  'quickly', 'user-friendly', 'intuitive', 'robust', 'seamless', 'various', 'some', 'reasonable']
const WELDED = /(\.(dart|ts|tsx|js|py|go|rb|kt|swift|sql)\b|::|`[^`]+\.[a-z]{2,4}`|\bsee\s+\S+\.[a-z]{2,4})/i
// ENTITIES.md defines no AC `kind`; the Rev 2.1 tree asks for one. This set is
// PROPOSED and flagged as needing a ruling — see the SKA-017 report.
const AC_KINDS = new Set(['behaviour', 'constraint', 'data', 'ux', 'security', 'performance'])

// ── load ─────────────────────────────────────────────────────────────────────
const dirAbs = isAbsolute(DIR) ? DIR : join(ROOT, DIR)
if (!existsSync(dirAbs)) { console.error(`${DIR}/ does not exist. Run the prepare phase first.`); process.exit(2) }

const cfgPath = join(dirAbs, 'config.yaml')
let cfg = {}, scope = 'project'
if (!existsSync(cfgPath)) err(`${DIR}/config.yaml`, 1, 'MISSING', 'config.yaml is missing', 'it names the target and the scope')
else {
  cfg = parseKV(readFileSync(cfgPath, 'utf8'), `${DIR}/config.yaml`, 1)
  scope = cfg.scope?.value ?? ''
  if (!['project', 'app'].includes(scope)) err(`${DIR}/config.yaml`, cfg.scope?.line ?? 1, 'SCOPE', `scope must be "project" or "app" (found "${scope || 'nothing'}")`, 'project = this repo owns the project layer; app = it references the project layer that lives in the spec-home repo\'s own .sakal/ tree')
  for (const k of ['project']) if (!cfg[k]) err(`${DIR}/config.yaml`, 1, 'REQUIRED', `\`${k}\` is required`, 'every .sakal/ tree names its project')
  if (scope === 'app' && !cfg.app) err(`${DIR}/config.yaml`, cfg.scope?.line ?? 1, 'REQUIRED', '`app` is required when scope is app', 'it names which codebase these stories belong to')
}

// The spec-format family (SKA-026): prepare declared it; the fidelity gate
// must parse the pinned spec with the SAME parameters or verbatim comparison
// is meaningless. Unknown value = error; absent = reference.
const famDecl = cfg.spec_family?.value ?? null
if (famDecl && !FAMILIES[famDecl])
  err(`${DIR}/config.yaml`, cfg.spec_family.line, 'SCOPE', `spec_family "${famDecl}" is not a known family (${Object.keys(FAMILIES).join(', ')})`, 'prepare writes this; fix the declaration')
const FAM = FAMILIES[famDecl] ?? FAMILIES.reference

// Project layer: local when scope=project; when scope=app it lives in the
// spec-home repo's own .sakal/ tree, not in this repo.
const projectLayerLocal = scope !== 'app'
const projectLayerLocalPre = projectLayerLocal
const personas = projectLayerLocal ? parseCollection(join(dirAbs, 'registry/personas.yaml'), 'personas') : new Map()
const goals = projectLayerLocal ? parseCollection(join(dirAbs, 'registry/goals.yaml'), 'goals') : new Map()
const modules = projectLayerLocal ? parseCollection(join(dirAbs, 'registry/modules.yaml'), 'modules') : new Map()
// registry/codebases.yaml is PROJECT-layer. Under scope: app the project layer
// lives in the spec-home repo and this repo's identity is config.yaml's own
// declaration (SKA-023's doctrine). Requiring the file here contradicted it
// and failed a healthy tree.
const codebases = projectLayerLocalPre
  ? parseCollection(join(dirAbs, 'registry/codebases.yaml'), 'codebases')
  : (existsSync(join(dirAbs, 'registry/codebases.yaml'))
      ? parseCollection(join(dirAbs, 'registry/codebases.yaml'), 'codebases')
      : new Map())
const journeys = projectLayerLocal ? parseCollection(join(dirAbs, 'journeys.yaml'), 'journeys') : new Map()
const epics = projectLayerLocal ? parseCollection(join(dirAbs, 'epics.yaml'), 'epics') : new Map()

// Under scope=app the project layer lives in the spec-home repo's own
// .sakal/ tree, a different checkout — so its keys CANNOT be resolved
// locally from here, and that is fine. A reference is a CLAIM this tree
// cannot check against the real thing; verify says so rather than
// pretending it verified something it could not see.
if (scope === 'app') {
  // THE SEAM, ENFORCED (SKA-018 Part 2). An app-scoped directory may not DEFINE
  // a project-layer entity anywhere except proposals/, which stays local to
  // this tree. Definitions elsewhere are an ERROR, not a warning: a warning is
  // something you can ship past, and this one silently forks the project layer
  // across eleven repos.
  for (const local of ['registry/personas.yaml', 'registry/goals.yaml', 'registry/modules.yaml', 'journeys.yaml', 'epics.yaml'])
    if (existsSync(join(dirAbs, local)))
      err(`${DIR}/${local}`, 1, 'PROJECTDEF', 'an app-scoped .sakal/ must not DEFINE project-layer entities',
        `the project layer lives in the spec-home repo. Delete this file and reference the keys instead; if you genuinely need a NEW one, put it in ${DIR}/proposals/ and carry it to the spec-home repo by hand.`)
}

if (projectLayerLocal) {
  for (const [key, j] of journeys) {
    const f = `${DIR}/journeys.yaml`
    if (!j.fields.goal) err(f, j.line, 'REQUIRED', `journey "${key}" has no goal`, 'a journey serves exactly one goal')
    else if (!goals.has(j.fields.goal.value)) err(f, j.fields.goal.line, 'REF', `goal "${j.fields.goal.value}" is not declared`, 'add it to registry/goals.yaml')
    if (!j.fields.persona) err(f, j.line, 'REQUIRED', `journey "${key}" has no persona`, 'a journey is walked by exactly one persona')
    else if (!personas.has(j.fields.persona.value)) err(f, j.fields.persona.line, 'REF', `persona "${j.fields.persona.value}" is not declared`, 'add it to registry/personas.yaml')
    checkSource(j.fields.source?.value, f, j.fields.source?.line ?? j.line, `journey ${key}`)
  }
  for (const [key, e] of epics) checkSource(e.fields.source?.value, `${DIR}/epics.yaml`, e.fields.source?.line ?? e.line, `epic ${key}`)
}

// ── epic docs: .sakal/epics/<KEY>.md (SKA-025, Addendum A1 item 1) ──────────
// The app-side epic layer: verbatim spec sections behind a pinned source.
// Distinct from project-layer `epics.yaml`, which stays forbidden under
// scope=app — these files IMPORT this repo's own spec, they define nothing.
const epicDocs = new Map()
{
  const dir = join(dirAbs, 'epics')
  if (existsSync(dir)) for (const name of readdirSync(dir).filter(n => n.endsWith('.md')).sort()) {
    const p = join(dir, name), f = rel(p)
    const lines = readFileSync(p, 'utf8').split('\n')
    if (lines[0].trim() !== '---') { err(f, 1, 'NOFM', 'file does not start with a `---` front-matter block', 'the first line must be exactly `---`'); continue }
    const end = lines.indexOf('---', 1)
    if (end < 0) { err(f, 1, 'NOFM', 'front-matter is never closed with `---`', 'add a closing `---`'); continue }
    const fm = parseKV(lines.slice(1, end).join('\n'), f, 2)
    const key = fm.key?.value
    if (!key) { err(f, 1, 'REQUIRED', '`key` is required', 'the key is this record\'s identity — how other files reference it'); continue }
    if (name !== `${key}.md`) err(f, fm.key.line, 'KEYFMT', `file is ${name} but key is "${key}"`, 'epic docs are named <KEY>.md')
    // Tier/Priority are family facts, not universals (storefront has neither,
    // flutter-pos has no Tier) — required only where the spec carries them,
    // which fidelity below checks. title/app are always prepare's to write.
    for (const k of ['title', 'app'])
      if (!fm[k]?.value) err(f, fm.key.line, 'REQUIRED', `\`${k}\` is required on an epic doc`, 'prepare writes it from the spec header')
    if (scope === 'app' && cfg.app?.value && fm.app?.value && fm.app.value !== cfg.app.value)
      err(f, fm.app.line, 'SCOPEAPP', `app "${fm.app.value}" is not this directory's app ("${cfg.app.value}")`, "an app-scoped .sakal/ carries only its own codebase's epic docs")
    epicDocs.set(key, f)

    const body = lines.slice(end + 1), bodyStart = end + 2
    // The status HEADER was the proven liar (E5) — its field lines never
    // survive the import. Emoji inside imported section PROSE is different:
    // as-built families carry it legitimately and fidelity requires it
    // verbatim, so only status FIELD lines and checkbox lines are errors here.
    body.forEach((raw, i) => {
      if (/^>?\s*\*\*Status:\*\*/.test(raw) || /^\*\*Priority:\*\*.*\*\*Status:\*\*/.test(raw) || /^\s*-\s+\[[^\]]*\]\s/.test(raw))
        err(f, bodyStart + i, 'STATUSMARK', 'a status field line survived the import', 'status is derived — prepare never copies the `Status:` header/trailer or checkbox lines into an epic doc; delete it')
    })
    const own = parseSpec(body.join('\n'), FAM, { epicKey: key })
    if (own.stories.length || body.some(l => /^##\s+Stories\s*$/.test(l)))
      err(f, bodyStart, 'PROJECTDEF', 'an epic doc must not carry a Stories section', 'stories live in stories/<EPIC>/<KEY>.md — the epic doc holds only the spec sections')

    // P4 fidelity: every section verbatim (normalised whitespace only) against
    // the spec AT THE PIN. Works identically after docs/specs/ is deleted (R1).
    const srcVal = fm.source?.value
    if (!srcVal) { err(f, fm.key.line, 'NOSRC', `epic ${key} has no \`source:\``, 'prepare pins it: <owner>/<repo>:<path>@<short-sha>'); continue }
    // Same exemption checkSource() gives stories/journeys/epics.yaml rows: a
    // deliberately drafted epic (no document behind it) is a WARNING, not the
    // SRCGONE error resolvePinned() would raise for an unresolvable path. A
    // real-but-missing path still falls through to resolvePinned() and errors.
    if (/^none\b/i.test(srcVal)) { warn(f, fm.source.line, 'DRAFTED', `epic ${key} is drafted with no document behind it`, 'fine if deliberate — listed so nobody mistakes it for something the repo said'); continue }
    const uri = parseSourceURI(srcVal)
    const r = resolvePinned(uri, f, fm.source.line, `epic ${key}`)
    if (!r.content) continue
    const spec = parseSpec(r.content, FAM, { epicKey: key })
    // Tier/Priority: present exactly where the spec carries them, verbatim.
    for (const k of ['tier', 'priority']) {
      const specVal = spec[k]
      if (specVal != null && !fm[k]?.value) err(f, fm.key.line, 'FIDELITY', `the spec ${r.how} carries \`${k}: ${specVal}\` but this epic doc drops it`, 're-run prepare')
      else if (specVal == null && fm[k]?.value) err(f, fm[k].line, 'FIDELITY', `\`${k}\` is not in the spec ${r.how} — an epic doc invents nothing`, 're-run prepare')
      else if (specVal != null && fm[k]?.value && normWS(fm[k].value) !== normWS(specVal))
        err(f, fm[k].line, 'FIDELITY', `\`${k}\` differs from the spec ${r.how} ("${specVal}")`, 'values are verbatim, qualifiers included')
    }
    // A3.1: the consumes-slot line, verbatim — after R1 deletion this
    // frontmatter is the traceability's ONLY home; dropping it silently
    // drops what D-02 called the entire epic→P-spec traceability.
    {
      const specConsumes = consumesOf(spec.headerExtrasRaw)
      const fmC = fm.consumes_raw?.value ?? ''
      if (specConsumes && !fmC) err(f, fm.key.line, 'FIDELITY', `the spec ${r.how} carries a consumes-slot line this epic doc drops`, `add \`consumes_raw: ${specConsumes.slice(0, 60)}…\` — or re-run prepare (A3.1)`)
      else if (!specConsumes && fmC) err(f, fm.consumes_raw.line, 'FIDELITY', `\`consumes_raw\` is not in the spec ${r.how} — an epic doc invents nothing`, 're-run prepare')
      else if (specConsumes && fmC && normWS(fmC) !== normWS(specConsumes))
        err(f, fm.consumes_raw.line, 'FIDELITY', `\`consumes_raw\` differs from the spec ${r.how}`, `the spec says: "${specConsumes.length > 90 ? specConsumes.slice(0, 90) + '…' : specConsumes}" — key AND value verbatim, never normalized`)
    }
    const specSections = new Map(spec.sections.map(s => [normWS(s.heading), s]))
    const ownHeadings = new Set()
    for (const s of own.sections) {
      ownHeadings.add(normWS(s.heading))
      const want = specSections.get(normWS(s.heading))
      if (!want) { err(f, bodyStart, 'FIDELITY', `section "## ${s.heading}" is not in the spec ${r.how}`, 'epic docs import spec sections verbatim — nothing may be added'); continue }
      if (normWS(s.body) !== normWS(want.body))
        err(f, bodyStart, 'FIDELITY', `section "## ${s.heading}" differs from the spec ${r.how}`, 'verbatim means verbatim — normalised whitespace is the only forgiveness; re-run prepare')
    }
    for (const [h, s] of specSections)
      if (!ownHeadings.has(h)) err(f, bodyStart, 'FIDELITY', `spec section "## ${s.heading}" ${r.how} is missing from this epic doc`, 'prepare imports every non-Stories section; re-run it')
    if (fm.title?.value && spec.title && normWS(fm.title.value) !== normWS(spec.title))
      warn(f, fm.title.line, 'FIDELITY', `title differs from the spec H1 ("${spec.title}")`, 'titles are authored from the heading; drift is worth a look')
  }
}

// ── journey records: .sakal/journeys/<KEY>.md (SKA-028, A5 ruling B) ────────
// Walked exactly as epic docs are: frontmatter checks, body fidelity both
// directions, imported-text exemption. journeys.yaml stays the index; the
// file is the record — so an index entry without a record is a WARNING
// (authoring in progress), but a record without an index entry is an ERROR:
// anything that reads journeys.yaml first would never see it.
{
  const dir = join(dirAbs, 'journeys')
  if (existsSync(dir) && scope === 'app')
    err(`${DIR}/journeys/`, 1, 'PROJECTDEF', 'an app-scoped .sakal/ must not DEFINE project-layer journey records', 'journeys live in the spec-home repo; reference keys instead')
  const seen = new Set()
  if (existsSync(dir) && scope !== 'app') for (const name of readdirSync(dir).filter(n => n.endsWith('.md')).sort()) {
    const p = join(dir, name), f = rel(p)
    const lines = readFileSync(p, 'utf8').split('\n')
    if (lines[0].trim() !== '---') { err(f, 1, 'NOFM', 'file does not start with a `---` front-matter block', 'the first line must be exactly `---`'); continue }
    const end = lines.indexOf('---', 1)
    if (end < 0) { err(f, 1, 'NOFM', 'front-matter is never closed with `---`', 'add a closing `---`'); continue }
    const fm = parseKV(lines.slice(1, end).join('\n'), f, 2)
    const key = fm.key?.value
    if (!key) { err(f, 1, 'REQUIRED', '`key` is required', 'the key is this record\'s identity — how other files reference it'); continue }
    if (name !== `${key}.md`) err(f, fm.key.line, 'KEYFMT', `file is ${name} but key is "${key}"`, 'journey records are named <KEY>.md')
    seen.add(key)
    if (!journeys.has(key)) err(f, fm.key.line, 'JORPHAN', `journey "${key}" is not in journeys.yaml`, 'the index is the canonical list — a record outside it would never surface; add it to journeys.yaml')
    for (const k of ['title', 'goal', 'persona'])
      if (!fm[k]?.value) err(f, fm.key.line, 'REQUIRED', `\`${k}\` is required on a journey record`, 'prepare writes it from journeys.yaml')
    if (fm.goal?.value && goals.size && !goals.has(fm.goal.value)) err(f, fm.goal.line, 'REF', `goal "${fm.goal.value}" is not declared`, 'add it to registry/goals.yaml')
    if (fm.persona?.value && personas.size && !personas.has(fm.persona.value)) err(f, fm.persona.line, 'REF', `persona "${fm.persona.value}" is not declared`, 'add it to registry/personas.yaml')

    const body = lines.slice(end + 1).join('\n').replace(/^\n+/, '').replace(/\n+$/, '')
    if (!body.trim()) { err(f, end + 2, 'FIDELITY', `journey ${key} has an empty narrative body`, 'the record IS the narrative; re-run prepare'); continue }
    const srcVal = fm.source?.value
    if (!srcVal) { err(f, fm.key.line, 'NOSRC', `journey ${key} has no \`source:\``, 'the narrative is imported; its document must be named'); continue }
    const uri = parseSourceURI(srcVal)
    const r = resolvePinned(uri, f, fm.source.line, `journey ${key}`)
    if (!r.content) continue
    const section = uri.anchor ? sectionByAnchor(r.content, uri.anchor) : null
    if (!section) { err(f, fm.source.line, 'SRCANCHOR', `source resolves ${r.how} but has no section matching "#${uri.anchor ?? '(none)'}"`, 'repoint the anchor, or re-run prepare'); continue }
    // P4 for journeys: the body is the section VERBATIM (normalised
    // whitespace only), both directions — imported narrative is never
    // improved, and epic pointers inside it are never rewritten to URIs.
    if (normWS(body) !== normWS(section.raw))
      err(f, end + 2, 'FIDELITY', `journey ${key} body differs from the spec section ${r.how}`, 'verbatim means verbatim — re-run prepare rather than edit an import')
  }
  if (scope !== 'app') for (const [key, j] of journeys)
    if (!seen.has(key))
      warn(`${DIR}/journeys.yaml`, j.line, 'JMISSING', `journey "${key}" has no journeys/${key}.md record`, 'legitimate mid-authoring — the index names it, the record does not exist yet; prepare emits it')
}

// ── stories ──────────────────────────────────────────────────────────────────
const stories = new Map()
function walk(d) {
  if (!existsSync(d)) return []
  return readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(d, e.name)) : (e.name.endsWith('.md') ? [join(d, e.name)] : []))
}
for (const p of walk(join(dirAbs, 'stories'))) {
  const f = rel(p)
  const lines = readFileSync(p, 'utf8').split('\n')
  if (lines[0].trim() !== '---') { err(f, 1, 'NOFM', 'file does not start with a `---` front-matter block', 'the first line must be exactly `---`'); continue }
  const end = lines.indexOf('---', 1)
  if (end < 0) { err(f, 1, 'NOFM', 'front-matter is never closed with `---`', 'add a closing `---`'); continue }
  const fm = parseKV(lines.slice(1, end).join('\n'), f, 2)
  const body = lines.slice(end + 1), bodyStart = end + 2

  const key = fm.key?.value
  if (!key) { err(f, 1, 'REQUIRED', '`key` is required', 'the key is this record\'s identity — how other files reference it'); continue }
  if (stories.has(key)) err(f, fm.key.line, 'DUPKEY', `story key "${key}" is used by another file`, `also in ${stories.get(key).file}`)
  stories.set(key, { file: f, line: fm.key.line, refs: {
    epic: fm.epic?.value, journey: fm.journey?.value, persona: fm.persona?.value,
    module: fm.module?.value, app: fm.app?.value } })

  for (const k of ['title', 'epic', 'persona', 'app', 'module'])
    if (!fm[k]?.value) err(f, fm.key.line, 'REQUIRED', `\`${k}\` is required on a story`, 'ENTITIES.md marks it required — the write is refused without it')
  const refCheck = (k, map, where) => { const v = fm[k]?.value; if (v && !map.has(v)) err(f, fm[k].line, 'REF', `${k} "${v}" is not declared`, `add it to ${where}`) }
  if (projectLayerLocal) {
    refCheck('epic', epics, 'epics.yaml')
    refCheck('journey', journeys, 'journeys.yaml')
    refCheck('persona', personas, 'registry/personas.yaml')
    refCheck('module', modules, 'registry/modules.yaml')
  }
  if (codebases.size) refCheck('app', codebases, 'registry/codebases.yaml')
  if (scope === 'app' && cfg.app?.value && fm.app?.value && fm.app.value !== cfg.app.value)
    err(f, fm.app.line, 'SCOPEAPP', `app "${fm.app.value}" is not this directory's app ("${cfg.app.value}")`, "an app-scoped .sakal/ carries only its own codebase's stories")
  if (scope === 'app' && epicDocs.size && fm.epic?.value && !epicDocs.has(fm.epic.value))
    err(f, fm.epic.line, 'REF', `epic "${fm.epic.value}" has no epic doc`, `prepare emits epics/${fm.epic.value}.md alongside the stories — structure must converge`)

  const isNewFmt = body.some(l => /^```yaml\s*$/.test(l.trim()))
  const hIdx = body.findIndex(l => l.startsWith('## '))
  const sentence = body.slice(0, hIdx < 0 ? body.length : hIdx).join(' ').trim()
  // S3 (A2): a re-extracted story whose spec family has no As/I-want/So-that
  // triple carries an EMPTY story field by design — prepare never fabricates
  // a voice. That is a WARNING naming the human work, not an error.
  if (!sentence) {
    if (isNewFmt) warn(f, bodyStart, 'NOSENTENCE', `story ${key} has no story sentence — the spec offered no triple and prepare does not fabricate one (S3)`, 'a human should voice this story; edit the file and re-verify')
    else err(f, bodyStart, 'NOSENTENCE', `story ${key} has no story sentence`, 'one line of "As a … I want … so that …" between the front-matter and the ACs')
  }
  else if (!/as an? .+i want .+so that|as the .+i want .+so that/i.test(sentence))
    warn(f, bodyStart, 'STORYSHAPE', 'story sentence is not "As a … I want … so that …"', 'the shape is what makes the persona and the motive explicit')

  // Two body formats. NEW (SKA-025 re-extract): fenced-yaml ACs, sha-pinned
  // source, VERBATIM imported text — the house voice lints do NOT run on the
  // AC text (fidelity wins for imports; conventions govern what prepare
  // authors: the sentence, the titles). LEGACY: inline `- AC-01 [kind] — …`,
  // linted exactly as before.
  const isNew = isNewFmt
  let acs = 0
  if (isNew) {
    for (const k of ['tags', 'out_of_scope'])
      if (!fm[k]) err(f, fm.key.line, 'REQUIRED', `\`${k}\` is required on a re-extracted story`, 'tags come from the spec Priority line; an empty out_of_scope is written out loud: `out_of_scope: []`')
    const srcVal = fm.source?.value
    const uri = srcVal && !/^none\b/i.test(srcVal) ? parseSourceURI(srcVal) : null
    if (!uri) checkSource(srcVal, f, fm.source?.line ?? fm.key.line, `story ${key}`)

    const { acs: list, sawFence } = parseFencedACs(body, bodyStart, f)
    acs = list.length
    const seen = new Set()
    const keyEsc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    list.forEach((ac, i) => {
      const wantId = `${key}-${String.fromCharCode(97 + i)}`
      if (!new RegExp(`^${keyEsc}-[a-z]$`).test(ac.id)) err(f, ac.line, 'KEYFMT', `AC id "${ac.id}" should be ${key}-<letter>`, 'ids are <story-key>-<letter>, letters in spec order')
      else if (ac.id !== wantId) err(f, ac.line, 'KEYFMT', `AC ids follow spec order — expected ${wantId} here, found ${ac.id}`, 'letters are positional: `a` is the spec section\'s first AC')
      if (seen.has(ac.id)) err(f, ac.line, 'DUPKEY', `${ac.id} appears twice in this story`, '')
      seen.add(ac.id)
      if (ac.text == null || ac.text === '') err(f, ac.line, 'REQUIRED', `${ac.id} has no text`, 'text is the spec AC VERBATIM, double-quoted')
      for (const c of ac.cites) {
        if (c.kind !== 'enforced' && c.kind !== 'verified') { err(f, c.line, 'CITEKIND', `${ac.id} cite kind "${c.kind}" is not enforced|verified`, 'citation_kind, exactly (Q6)'); continue }
        for (const req of ['path', 'symbol', 'sha']) if (!c[req]) err(f, c.line, 'REQUIRED', `${ac.id} cite has no \`${req}\``, 'Q6 shape: kind, path, symbol, sha, optional note')
        if (!c.path || !c.symbol) continue
        // Re-confirm the grep, through the pin — a cite is a claim, and an
        // unconfirmable claim looks exactly like evidence.
        let content = c.sha ? gitShow(c.sha, c.path) : null
        if (content == null && existsSync(join(ROOT, c.path))) {
          if (c.sha) warn(f, c.line, 'PINMISS', `${ac.id} cite pin ${c.sha} does not resolve — checked the working tree instead`, 're-run prepare to re-pin')
          content = readFileSync(join(ROOT, c.path), 'utf8')
        }
        if (content == null) { err(f, c.line, 'CITEGONE', `${ac.id} cites ${c.path}, which resolves neither at ${c.sha ?? '(no sha)'} nor on disk`, 'prepare drops what it cannot re-confirm; so does verify'); continue }
        const hit = c.kind === 'enforced' ? findDeclaration(content, c.symbol) : findTestLabel(content, c.symbol)
        if (!hit) err(f, c.line, 'CITEGONE', `${ac.id}: no ${c.kind === 'enforced' ? `declaration of "${c.symbol}"` : `test label "${c.symbol}"`} greps in ${c.path}`, 'enforced = exact-name declaration; verified = exact innermost test(…) label — never group')
      }
    })
    if (!sawFence) err(f, bodyStart, 'NOACS', `story ${key} has no fenced yaml AC block`, 'ACs live under `## Acceptance criteria` in a ```yaml fence')

    // P4 FIDELITY: AC text verbatim against the spec AT THE PIN (git show,
    // not the working tree — R1), normalised whitespace only.
    if (uri?.path) {
      const r = resolvePinned(uri, f, fm.source.line, `story ${key}`)
      if (r.content) {
        if (uri.anchor) {
          const am = anchorMatchesText(r.content, uri.anchor)
          if (!am.hit) err(f, fm.source.line, 'SRCANCHOR', `source resolves ${r.how} but has no section starting "#${uri.anchor}"`, `headings found: ${am.known.slice(0, 4).join(', ') || '(none)'}…`)
          else if (am.duplicate) warn(f, fm.source.line, 'SRCDUP', `"#${uri.anchor}" matches more than one heading in ${uri.path}`, 'disambiguate the heading or the anchor')
        }
        const st = parseSpec(r.content, FAM, { epicKey: fm.epic?.value ?? key.replace(/-\d{2}$/, '') }).stories.find(s => s.key === key)
        if (!st) err(f, fm.source.line, 'FIDELITY', `story ${key} has no section in ${uri.path} ${r.how}`, 'the spec moved on, or the key changed — re-run prepare')
        else {
          if (st.acs.length !== acs) err(f, bodyStart, 'FIDELITY', `story ${key} carries ${acs} ACs but the spec section ${r.how} has ${st.acs.length}`, 'the yaml block mirrors the spec AC-for-AC, in order — re-run prepare')
          list.forEach((ac, i) => {
            const sp = st.acs[i]
            if (!sp) return
            if (ac.text != null && normWS(ac.text) !== normWS(sp.text))
              err(f, ac.textLine ?? ac.line, 'FIDELITY', `${ac.id} text is not the spec's AC-${sp.n} verbatim ${r.how}`, `the spec says: "${sp.text.length > 90 ? sp.text.slice(0, 90) + '…' : sp.text}" — imports are never improved, not even for a lint`)
            // S2 (A2): the raw marker is recorded, never interpreted. A
            // non-default spec marker must be captured; a captured marker
            // must match the spec's — either way nothing is ever read INTO it.
            if (ac.marker != null && normWS(ac.marker) !== normWS(sp.marker ?? '[ ]'))
              err(f, ac.markerLine ?? ac.line, 'FIDELITY', `${ac.id} marker ${JSON.stringify(ac.marker)} is not the spec's raw marker ${JSON.stringify(sp.marker)} ${r.how}`, 'markers are captured verbatim and never interpreted (S2)')
            else if (ac.marker == null && sp.marker && sp.marker !== '[ ]')
              err(f, ac.line, 'FIDELITY', `${ac.id} drops the spec's raw marker ${JSON.stringify(sp.marker)} ${r.how}`, 'a non-default checkbox marker is data someone wrote — carried as `marker:`, never interpreted (S2)')
            // Collapsed ranges (flutter-pos `AC-1–AC-5`): one physical line,
            // one entry, the raw range carried — verbatim both directions.
            if (ac.range != null && normWS(ac.range) !== normWS(sp.rangeRaw ?? ''))
              err(f, ac.rangeLine ?? ac.line, 'FIDELITY', `${ac.id} range ${JSON.stringify(ac.range)} is not the spec's ${JSON.stringify(sp.rangeRaw)} ${r.how}`, 'ranges are recorded raw; splitting them is promote-time work')
            else if (ac.range == null && sp.rangeRaw)
              err(f, ac.line, 'FIDELITY', `${ac.id} drops the spec's collapsed range ${JSON.stringify(sp.rangeRaw)} ${r.how}`, 'one physical line = one entry with `range:` carried raw')
            // Italic label tags (`*(amended)*` …): recorded raw, both ways.
            if (ac.tag != null && normWS(ac.tag) !== normWS(sp.tagRaw ?? ''))
              err(f, ac.tagLine ?? ac.line, 'FIDELITY', `${ac.id} tag ${JSON.stringify(ac.tag)} is not the spec's ${JSON.stringify(sp.tagRaw)} ${r.how}`, 'label tags are recorded raw, never interpreted')
            else if (ac.tag == null && sp.tagRaw)
              err(f, ac.line, 'FIDELITY', `${ac.id} drops the spec's label tag ${JSON.stringify(sp.tagRaw)} ${r.how}`, 'carried as `tag:`, never interpreted')
          })
          if (fm.title?.value && normWS(fm.title.value) !== normWS(st.title))
            warn(f, fm.title.line, 'FIDELITY', `title differs from the spec heading ("${st.title}")`, 'titles are authored from the heading; drift is worth a look')
          // A3.1, story level: per-story consumes-slot lines, verbatim.
          const stConsumes = consumesOf(st.extrasRaw ?? [])
          const fmC = fm.consumes_raw?.value ?? ''
          if (stConsumes && !fmC) err(f, fm.key.line, 'FIDELITY', `the spec section ${r.how} carries a consumes-slot line this story drops`, 're-run prepare (A3.1)')
          else if (!stConsumes && fmC) err(f, fm.consumes_raw.line, 'FIDELITY', `\`consumes_raw\` is not in the spec section ${r.how}`, 're-run prepare')
          else if (stConsumes && fmC && normWS(fmC) !== normWS(stConsumes))
            err(f, fm.consumes_raw.line, 'FIDELITY', `\`consumes_raw\` differs from the spec section ${r.how}`, 'key AND value verbatim, never normalized')
        }
      }
    }
  } else {
    checkSource(fm.source?.value, f, fm.source?.line ?? fm.key.line, `story ${key}`)
    const seen = new Set(); let current = null
    const flush = () => { if (current && !current.src) checkSource(null, f, current.line, current.id); current = null }
    body.forEach((raw, i) => {
      const line = bodyStart + i
      const m = raw.match(/^-\s+(AC-\S+)\s*(?:\[([a-z]+)\])?\s*—\s*(.*)$/)
      if (m) {
        flush()
        const [, id, kind, text] = m
        acs++; current = { id, line }
        if (!/^AC-\d{1,2}$/.test(id)) err(f, line, 'KEYFMT', `AC id "${id}" should look like AC-01`, '')
        if (seen.has(id)) err(f, line, 'DUPKEY', `${id} appears twice in this story`, '')
        seen.add(id)
        if (!kind) err(f, line, 'ACKIND', `${id} has no kind`, `write "- ${id} [behaviour] — …"; one of: ${[...AC_KINDS].join(', ')}`)
        else if (!AC_KINDS.has(kind)) err(f, line, 'ACKIND', `${id} kind "${kind}" is not one of ${[...AC_KINDS].join(', ')}`, '')
        const v = VAGUE.find(w => new RegExp(`\\b${w}\\b`, 'i').test(text))
        if (v) warn(f, line, 'VAGUE', `${id} contains "${v}" — not independently checkable`, 'say what is observably true instead')
        if (text.trim().split(/\s+/).length > 30) warn(f, line, 'CONV-ACLONG', `${id} is ${text.trim().split(/\s+/).length} words (house schema: 4–30)`, 'a paragraph is not a claim — see CONVENTIONS.md')
        if (text.split(/[.;]/).filter(s => s.trim()).length > 2) warn(f, line, 'ACLONG', `${id} looks like more than one claim`, 'one AC = one testable claim; split it')
        if (WELDED.test(text)) warn(f, line, 'WELDED', `${id} welds its evidence into the text`, 'imported AS-IS by ruling and recorded in findings.md — a citation is the right home for evidence')
        return
      }
      const s = raw.match(/^\s+source:\s*(.*)$/)
      if (s && current) { checkSource(s[1].trim(), f, line, current.id); current.src = true; return }
      if (!raw.trim()) flush()
    })
    flush()
  }
  // CONVENTIONS.md granularity — warnings this release, by ruling: enforcing new
  // conventions on trees drafted before they existed would turn working
  // directories red overnight. Flip to errors once the fleet is normalised.
  if (acs > 8) warn(f, fm.key.line, 'CONV-ACS', `story ${key} has ${acs} ACs (house schema: 1–8)`, 'usually means the story is doing two jobs — look, then split or keep deliberately')
  if (!/^[A-Za-z]{2,}-\d{2}[A-Za-z]?-\d{2}$/.test(key)) warn(f, fm.key.line, 'CONV-KEY', `story key "${key}" is not the house shape XX-nn-mm`, 'keys are identity and effectively permanent — see CONVENTIONS.md')
  // SKA-027 ruling: in an IMPORTED (source-pinned) tree an AC-less story is
  // honest state — the spec has not defined its ACs yet. It submits as a
  // story, is never agent-ready, and its brief must say "no ACs — define
  // them first". A hand-authored tree keeps this as an error: there, no ACs
  // means nobody wrote the promise.
  if (acs === 0) {
    if (isNew) warn(f, fm.key.line, 'NOACS', `story ${key} has no acceptance criteria — imported as-is; the spec defines none yet`, 'honest state, not an error: never agent-ready until ACs exist; define them first')
    else err(f, fm.key.line, 'NOACS', `story ${key} has no acceptance criteria`, 'a story with no testable claim promises nothing')
  }
}

// proposals/ — new project-layer entities an app repo discovered. Acknowledged
// so they are visible, and deliberately NOT loaded into the reference maps: a
// proposal must not satisfy a story's reference, or it would behave exactly
// like the definition it is not.
const proposalsDir = join(dirAbs, 'proposals')
const proposals = []
if (existsSync(proposalsDir)) {
  // Any file, not just .md — a proposal is as likely to be a .yaml registry
  // fragment as a story. (walk() filters to .md for the stories tree.)
  const anyFile = d => readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? anyFile(join(d, e.name)) : [join(d, e.name)])
  for (const p of anyFile(proposalsDir)) {
    proposals.push(rel(p))
    problems.push({ sev: 'info', file: rel(p), line: 1, code: 'PROPOSAL',
      msg: 'project-layer proposal — acknowledged, and never auto-carried out of this tree',
      fix: 'carry it to the spec-home repo by hand. Two app repos can propose the same persona and neither can tell — check the spec-home repo before carrying it over.' })
  }
}

// CONVENTIONS.md: stories per epic. Counted after the whole tree is read.
{
  const perEpic = new Map()
  for (const [, st] of stories) { const e = st.refs?.epic; if (e) perEpic.set(e, (perEpic.get(e) ?? 0) + 1) }
  for (const [e, n] of perEpic) if (n > 12)
    warn(`${DIR}/epics.yaml`, 1, 'CONV-EPIC', `epic ${e} has ${n} stories (house schema: 2–12)`, 'often means it is really a journey, or two epics — see CONVENTIONS.md')
}

// The guest we do not touch. Said out loud so nobody wonders if it was missed.
if (existsSync(join(dirAbs, 'context.md')))
  problems.push({ sev: 'info', file: `${DIR}/context.md`, line: 1, code: 'IGNORED', msg: 'desktop artifact — ignored and untouched by design', fix: '' })

// ── report ───────────────────────────────────────────────────────────────────
const inScope = p => !SCOPE || p.file.includes(SCOPE.replace(/^\.\//, '')) || p.file.endsWith('config.yaml')
const scoped = problems.filter(inScope)
const errors = scoped.filter(p => p.sev === 'error')
const warns = scoped.filter(p => p.sev === 'warn')
const infos = scoped.filter(p => p.sev === 'info')

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: !errors.length, scope, scopeFilter: SCOPE,
    counts: { journeys: journeys.size, epics: epics.size, epicDocs: epicDocs.size, stories: stories.size },
    problems: scoped, proposals }, null, 2))
  process.exit(errors.length ? 1 : 0)
}

console.log(`\n  .sakal/ — scope: ${scope} · ${journeys.size} journeys · ${epics.size || epicDocs.size} epics · ${stories.size} stories`)
console.log(`  target: ${cfg.project?.value ?? '?'}${cfg.app ? ` / ${cfg.app.value}` : ''}\n`)
for (const p of [...errors, ...warns, ...infos]) {
  const tag = p.sev === 'error' ? '\x1b[31merror\x1b[0m' : p.sev === 'warn' ? '\x1b[33mwarn \x1b[0m' : '\x1b[36minfo \x1b[0m'
  console.log(`  ${tag} ${p.file}:${p.line}  [${p.code}] ${p.msg}`)
  if (p.fix) console.log(`         ↳ ${p.fix}`)
}
console.log()
if (errors.length) {
  console.log(`\x1b[31m  VERIFY FAILED — ${errors.length} error(s), ${warns.length} warning(s).\x1b[0m`)
  console.log('  Fix the files above and run verify again.\n')
  process.exit(1)
}
console.log(`\x1b[32m  VERIFY GREEN — 0 errors, ${warns.length} warning(s).\x1b[0m`)
console.log('  Warnings are findings, not blockers — they belong in findings.md.\n')
process.exit(0)
