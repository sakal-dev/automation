#!/usr/bin/env node
// =============================================================================
// sakal-verify — the linter over `.sakal/` (SKA-017, Rev 2.1 tree).
//
// Nothing reaches SakalMaster until this is green. That is the point of the
// directory: once data is live it is expensive to correct, so the draft is
// FILES you can read, edit, diff and re-check while mistakes are still free.
//
// ZERO DEPENDENCIES, on purpose. It runs in a customer's repo where the only
// thing we can assume is the Node that Claude Code already brought. A linter
// that needs `npm install` first is a linter people skip.
//
// THE THREE RULES, enforced on the data and obeyed by this script:
//   1. No status field anywhere in .sakal/ — files carry inputs; status is
//      derived server-side. A `status:` key is an ERROR, not a warning.
//   2. No sync-state file. Drift is computed LIVE from a server read-back the
//      caller passes with --server; nothing on disk can go stale.
//   3. Templates live in the plugin. This script never writes to .sakal/.
//
// `context.md` is the desktop app's pre-existing artifact. It is IGNORED and
// never touched — we are guests in a namespace the product already owns.
//
// Exit: 0 = green (submit allowed) · 1 = errors · 2 = bad invocation
//
//   node sakal-verify.mjs [--dir .sakal] [--repo-root .] [--server state.json] [--json]
// =============================================================================
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const DIR = opt('--dir', '.sakal')
const ROOT = opt('--repo-root', '.')
const SERVER = opt('--server', null)
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
    const m = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/)
    if (!m) return err(file, line, 'PARSE', `not "key: value" and not a "- item": "${raw.trim()}"`, 'every line is `key: value` or an indented `- item`')
    const [, k, v] = m
    if (STATUS_KEYS.has(k.toLowerCase())) err(file, line, 'STATUSFIELD', `"${k}" is a status field and must not exist in .sakal/`, 'status is derived server-side from citations and bugs — files carry inputs only')
    if (k in out) err(file, line, 'DUPKEY', `"${k}" is set twice`, `first was line ${out[k].line}`)
    if (v === '') { listKey = k; out[k] = { value: [], line, list: true } }
    else { listKey = null; out[k] = { value: v.trim(), line } }
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
      current = { key, label, line, fields: {} }; entries.set(key, current); return
    }
    const sub = raw.match(/^\s+([A-Za-z_]+)\s*:\s*(.*)$/)
    if (sub) {
      if (!current) return err(f, line, 'PARSE', `"${sub[1]}:" does not belong to any entry`, 'indented fields follow a "- key — label" line')
      if (STATUS_KEYS.has(sub[1].toLowerCase())) return err(f, line, 'STATUSFIELD', `"${sub[1]}" is a status field and must not exist in .sakal/`, 'status is derived server-side')
      current.fields[sub[1]] = { value: sub[2].trim(), line }; return
    }
    err(f, line, 'PARSE', `unrecognised line: "${raw.trim()}"`, 'expected "- key — label" or an indented "field: value"')
  })
  return entries
}

// ── provenance ───────────────────────────────────────────────────────────────
// A source pointing at a doc that was renamed is worse than no source: it looks
// like evidence. Checked against the real repo, every run.
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const anchorCache = new Map()
function anchorsOf(file) {
  if (anchorCache.has(file)) return anchorCache.get(file)
  const set = new Set()
  try { for (const l of readFileSync(file, 'utf8').split('\n')) { const m = l.match(/^#{1,6}\s+(.*)$/); if (m) set.add(slug(m[1])) } } catch {}
  anchorCache.set(file, set); return set
}
function checkSource(src, file, line, what) {
  if (!src) return err(file, line, 'NOSRC', `${what} has no \`source:\``, 'add `source: docs/<file>#<anchor>`, or `source: none (drafted)` to say so out loud')
  if (/^none\b/i.test(src)) return warn(file, line, 'DRAFTED', `${what} is drafted with no document behind it`, 'fine if deliberate — listed so nobody mistakes it for something the repo said')
  const [path, anchor] = src.split('#')
  const abs = join(ROOT, path.trim())
  if (!existsSync(abs)) return err(file, line, 'SRCGONE', `source file does not exist: ${path.trim()}`, 'the doc moved or was deleted — repoint it, or mark it `none (drafted)`')
  if (anchor) {
    // Prefix match: real headings are long ("BK-01-01 · Save a link from the
    // share sheet"), and an exact-slug rule would break every source the first
    // time someone improves a title. A section that has genuinely gone still fails.
    const want = slug(anchor)
    if (![...anchorsOf(abs)].some(a => a === want || a.startsWith(want)))
      return err(file, line, 'SRCANCHOR', `source file exists but has no section starting "#${anchor}"`, `headings found: ${[...anchorsOf(abs)].slice(0, 4).join(', ') || '(none)'}…`)
  }
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
const dirAbs = join(ROOT, DIR)
if (!existsSync(dirAbs)) { console.error(`${DIR}/ does not exist. Run the prepare phase first.`); process.exit(2) }

const cfgPath = join(dirAbs, 'config.yaml')
let cfg = {}, scope = 'project'
if (!existsSync(cfgPath)) err(`${DIR}/config.yaml`, 1, 'MISSING', 'config.yaml is missing', 'it names the target and the scope; submit refuses to guess either')
else {
  cfg = parseKV(readFileSync(cfgPath, 'utf8'), `${DIR}/config.yaml`, 1)
  scope = cfg.scope?.value ?? ''
  if (!['project', 'app'].includes(scope)) err(`${DIR}/config.yaml`, cfg.scope?.line ?? 1, 'SCOPE', `scope must be "project" or "app" (found "${scope || 'nothing'}")`, 'project = this repo owns the project layer; app = it references a project layer already on the server')
  for (const k of ['project', 'target_host']) if (!cfg[k]) err(`${DIR}/config.yaml`, 1, 'REQUIRED', `\`${k}\` is required`, 'submit refuses to guess where to write')
  if (scope === 'app' && !cfg.app) err(`${DIR}/config.yaml`, cfg.scope?.line ?? 1, 'REQUIRED', '`app` is required when scope is app', 'it names which codebase these stories belong to')
}

// Project layer: local when scope=project, on the SERVER when scope=app.
const projectLayerLocal = scope !== 'app'
const personas = projectLayerLocal ? parseCollection(join(dirAbs, 'registry/personas.yaml'), 'personas') : new Map()
const goals = projectLayerLocal ? parseCollection(join(dirAbs, 'registry/goals.yaml'), 'goals') : new Map()
const modules = projectLayerLocal ? parseCollection(join(dirAbs, 'registry/modules.yaml'), 'modules') : new Map()
const codebases = parseCollection(join(dirAbs, 'registry/codebases.yaml'), 'codebases')
const journeys = projectLayerLocal ? parseCollection(join(dirAbs, 'journeys.yaml'), 'journeys') : new Map()
const epics = projectLayerLocal ? parseCollection(join(dirAbs, 'epics.yaml'), 'epics') : new Map()

// Rule 2: no sync-state file. Live state arrives from the caller.
let server = null
if (SERVER) {
  try { server = JSON.parse(readFileSync(SERVER, 'utf8')) }
  catch (e) { warn(SERVER, 1, 'SERVERREAD', `could not read the server state: ${e.message}`, 'drift cannot be reported without it') }
}
// REFERENCE, NEVER RE-DRAFT: under scope=app the project layer is the server's.
if (scope === 'app') {
  if (!server) warn(`${DIR}/config.yaml`, 1, 'NOSERVER', 'scope is app, so the project layer lives on the server — pass --server to resolve its keys', 'without it, references to personas/journeys/epics cannot be checked')
  else {
    for (const k of server.personas ?? []) personas.set(k, { key: k, line: 0, fields: {} })
    for (const k of server.goals ?? []) goals.set(k, { key: k, line: 0, fields: {} })
    for (const k of server.modules ?? []) modules.set(k, { key: k, line: 0, fields: {} })
    for (const k of server.journeys ?? []) journeys.set(k, { key: k, line: 0, fields: {} })
    for (const k of server.epics ?? []) epics.set(k, { key: k, line: 0, fields: {} })
  }
  for (const local of ['registry/personas.yaml', 'registry/goals.yaml', 'registry/modules.yaml', 'journeys.yaml', 'epics.yaml'])
    if (existsSync(join(dirAbs, local)))
      warn(`${DIR}/${local}`, 1, 'REDRAFT', 'scope is app, but this file re-drafts a project-layer entity', 'an app-scoped directory REFERENCES the project layer by key; it does not restate it. Genuinely-new project entities go in findings.md for review.')
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
  if (!key) { err(f, 1, 'REQUIRED', '`key` is required', 'the key is the identity SakalMaster converges on'); continue }
  if (stories.has(key)) err(f, fm.key.line, 'DUPKEY', `story key "${key}" is used by another file`, `also in ${stories.get(key).file}`)
  stories.set(key, { file: f, line: fm.key.line })

  for (const k of ['title', 'epic', 'persona', 'app', 'module'])
    if (!fm[k]?.value) err(f, fm.key.line, 'REQUIRED', `\`${k}\` is required on a story`, 'ENTITIES.md marks it required — the write is refused without it')
  const refCheck = (k, map, where) => { const v = fm[k]?.value; if (v && !map.has(v)) err(f, fm[k].line, 'REF', `${k} "${v}" is not declared`, `add it to ${where}`) }
  const elsewhere = projectLayerLocal ? null : 'the project layer on the server (scope=app references, never re-drafts)'
  refCheck('epic', epics, elsewhere ?? 'epics.yaml')
  refCheck('journey', journeys, elsewhere ?? 'journeys.yaml')
  refCheck('persona', personas, elsewhere ?? 'registry/personas.yaml')
  refCheck('module', modules, elsewhere ?? 'registry/modules.yaml')
  refCheck('app', codebases, 'registry/codebases.yaml')
  if (scope === 'app' && cfg.app?.value && fm.app?.value && fm.app.value !== cfg.app.value)
    err(f, fm.app.line, 'SCOPEAPP', `app "${fm.app.value}" is not this directory's app ("${cfg.app.value}")`, "an app-scoped .sakal/ carries only its own codebase's stories")
  checkSource(fm.source?.value, f, fm.source?.line ?? fm.key.line, `story ${key}`)

  const hIdx = body.findIndex(l => l.startsWith('## '))
  const sentence = body.slice(0, hIdx < 0 ? body.length : hIdx).join(' ').trim()
  if (!sentence) err(f, bodyStart, 'NOSENTENCE', `story ${key} has no story sentence`, 'one line of "As a … I want … so that …" between the front-matter and the ACs')
  else if (!/as a .+i want .+so that/i.test(sentence))
    warn(f, bodyStart, 'STORYSHAPE', 'story sentence is not "As a … I want … so that …"', 'the shape is what makes the persona and the motive explicit')

  let acs = 0; const seen = new Set(); let current = null
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
      if (text.split(/[.;]/).filter(s => s.trim()).length > 2) warn(f, line, 'ACLONG', `${id} looks like more than one claim`, 'one AC = one testable claim; split it')
      if (WELDED.test(text)) warn(f, line, 'WELDED', `${id} welds its evidence into the text`, 'imported AS-IS by ruling and recorded in findings.md — a citation is the right home for evidence')
      return
    }
    const s = raw.match(/^\s+source:\s*(.*)$/)
    if (s && current) { checkSource(s[1].trim(), f, line, current.id); current.src = true; return }
    if (!raw.trim()) flush()
  })
  flush()
  if (acs === 0) err(f, fm.key.line, 'NOACS', `story ${key} has no acceptance criteria`, 'a story with no testable claim promises nothing')
}

// The guest we do not touch. Said out loud so nobody wonders if it was missed.
if (existsSync(join(dirAbs, 'context.md')))
  problems.push({ sev: 'info', file: `${DIR}/context.md`, line: 1, code: 'IGNORED', msg: 'desktop artifact — ignored and untouched by design', fix: '' })

// ── drift, live from the read-back (rule 2) ──────────────────────────────────
let drift = null
if (server) {
  const ns = cfg.app?.value ?? cfg.project?.value
  const want = new Set([...stories.keys()].map(k => `spec:${ns}:${k}`))
  const have = new Set(server.stories ?? [])
  drift = { onlyLocal: [...want].filter(k => !have.has(k)), onlyServer: [...have].filter(k => !want.has(k)), both: [...want].filter(k => have.has(k)) }
}

// ── report ───────────────────────────────────────────────────────────────────
const errors = problems.filter(p => p.sev === 'error')
const warns = problems.filter(p => p.sev === 'warn')
const infos = problems.filter(p => p.sev === 'info')

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: !errors.length, scope, counts: { journeys: journeys.size, epics: epics.size, stories: stories.size }, problems, drift }, null, 2))
  process.exit(errors.length ? 1 : 0)
}

console.log(`\n  .sakal/ — scope: ${scope} · ${journeys.size} journeys · ${epics.size} epics · ${stories.size} stories`)
console.log(`  target: ${cfg.project?.value ?? '?'}${cfg.app ? ` / ${cfg.app.value}` : ''} @ ${cfg.target_host?.value ?? '?'}\n`)
for (const p of [...errors, ...warns, ...infos]) {
  const tag = p.sev === 'error' ? '\x1b[31merror\x1b[0m' : p.sev === 'warn' ? '\x1b[33mwarn \x1b[0m' : '\x1b[36minfo \x1b[0m'
  console.log(`  ${tag} ${p.file}:${p.line}  [${p.code}] ${p.msg}`)
  if (p.fix) console.log(`         ↳ ${p.fix}`)
}
if (drift) {
  console.log(`\n  drift vs the server, read live just now:`)
  if (!drift.onlyLocal.length && !drift.onlyServer.length) console.log('    none — files and SakalMaster agree')
  if (drift.onlyLocal.length) console.log(`    ${drift.onlyLocal.length} in files, NOT yet in SakalMaster: ${drift.onlyLocal.join(', ')}`)
  if (drift.onlyServer.length) {
    console.log(`    ${drift.onlyServer.length} in SakalMaster, NOT in files: ${drift.onlyServer.join(', ')}`)
    console.log('      ↳ someone edited in-app, or a story left the files. Submit will NOT delete these.')
  }
} else console.log('\n  drift: not checked (no --server read-back supplied)')
console.log()
if (errors.length) {
  console.log(`\x1b[31m  VERIFY FAILED — ${errors.length} error(s), ${warns.length} warning(s). Submit is blocked.\x1b[0m`)
  console.log('  Fix the files above and run verify again. Nothing has been sent anywhere.\n')
  process.exit(1)
}
console.log(`\x1b[32m  VERIFY GREEN — 0 errors, ${warns.length} warning(s). Submit is allowed.\x1b[0m`)
console.log('  Warnings are findings, not blockers — they belong in findings.md.\n')
process.exit(0)
