#!/usr/bin/env node
// =============================================================================
// sakal-prepare — the deterministic re-extract emitter (SKA-025, ruling R3:
// "the plugin performs the re-extract — if you do it by hand, who does
// repo #2?").
//
// The MODEL part of prepare is citation discovery and the app profile — those
// arrive here as input files. Everything else is code, so that two runs on the
// same checkout are BYTE-IDENTICAL: spec order for ACs, epic-number order for
// files, stable field order, one wrap width, no timestamps.
//
// What it emits, per Addendum A1 (docs/harness/addendum_A1.md, SakalMaster):
//   .sakal/epics/<KEY>.md      frontmatter + VERBATIM non-Stories sections.
//                              The `Status:` header and 🔴/🟢 markers are never
//                              imported — the status header was the proven liar.
//   .sakal/stories/<E>/<K>.md  preserved frontmatter keys + tags + explicit
//                              out_of_scope: [] + sha-pinned source; the story
//                              sentence (authored, conventions apply); ACs as
//                              fenced yaml with VERBATIM text (fidelity wins —
//                              imports are exempt from the house voice rules)
//                              and grep-confirmed cite blocks (Q6 shape).
//   config.yaml app_profile:   app-level declaration data describing this
//                              repo's own build/verify/lint tooling.
//
// CITE HONESTY, mechanical: every cite in --cites (and every cite carried
// forward from an existing story file) is re-confirmed against the PINNED
// checkout (`git show <pin>:<path>`) in this same run — a declaration for
// `enforced`, the exact innermost test label for `verified`. No confirmation →
// the cite is DROPPED with a report line, never silently kept. No honest cite →
// `cite: []`, with the reason in the report. An honest gap beats a false claim.
//
// The pin is HEAD-at-prepare-time, ONE pin per run — auditable by a reader,
// unlike per-file last-touched shas. Fidelity survives later source deletion
// because verify reads the spec back through the same pin (R1).
//
// ZERO DEPENDENCIES, like every script here. Exit: 0 = emitted · 2 = refused.
//
//   node sakal-prepare.mjs [--repo-root .] [--dir .sakal] [--specs docs/specs]
//                          [--cites cites.json] [--profile profile.json]
//                          [--pin <sha>] [--out <dir>]
//
// --out redirects emission (acceptance/determinism runs); default writes in
// place. --cites/--profile are OPTIONAL: without them, existing cites are
// carried forward (re-confirmed) and the existing app_profile is left alone.
// =============================================================================
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname, isAbsolute } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  slug, parseSpec, acLetter, yamlUnquote, detectAcLines,
  renderEpicDoc, renderStoryDoc, FAMILIES, detectFamilySignals,
  CONSUMES_SLOT, expandConventionIncludes, denylistFromRules,
  sectionByAnchor, readCollection, renderJourneyDoc,
  findDeclaration, findTestLabel, readScalars,
} from './sakal-shared.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const ROOT = opt('--repo-root', '.')
const DIR = opt('--dir', '.sakal')
const SPECS = opt('--specs', 'docs/specs')
const OUT = opt('--out', null)              // default: write into ROOT/DIR
const citesPath = opt('--cites', null)
const profilePath = opt('--profile', null)

const seedPath = opt('--seed', null)
const familyFlag = opt('--family', null)
const dirAbs = isAbsolute(DIR) ? DIR : join(ROOT, DIR)
const outAbs = OUT ?? dirAbs
const specsAbs = isAbsolute(SPECS) ? SPECS : join(ROOT, SPECS)
const report = { emitted: [], uncited: [], dropped: [], carried: [], unresolvableImported: [], orphans: [], newStories: [], refusals: [], notes: [] }
const die = m => { console.error(`REFUSED — ${m}`); process.exit(2) }
const write = (relPath, content) => {
  const abs = join(outAbs, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
  report.emitted.push(relPath)
}

// ── the pin and the repo identity ───────────────────────────────────────────
// Nullable here: the PROJECT-scope journeys mode runs unpinned when the tree
// has no git home (stated, never invented). The APP-scope path asserts both
// below — there the pin is load-bearing.
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim()
let pin = opt('--pin', null)
try { if (!pin) pin = git('rev-parse', '--short', 'HEAD') } catch { pin = null }
let repoId = null
try {
  const url = git('remote', 'get-url', 'origin')
  const m = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)
  if (m) repoId = m[1]
} catch { /* no origin */ }

const showCache = new Map()
function gitShow(sha, path) {
  const k = `${sha}:${path}`
  if (showCache.has(k)) return showCache.get(k)
  let out = null
  // `sha:./path` resolves relative to the working directory, which is what a
  // repo-root run AND a subdirectory spec-home (Business/ inside a parent
  // repo) both need; bare `sha:path` is repo-root-relative and breaks the
  // latter.
  try { out = execFileSync('git', ['-C', ROOT, 'show', `${sha}:./${path}`], { encoding: 'utf8' }) } catch { out = null }
  showCache.set(k, out); return out
}

// ── inputs ──────────────────────────────────────────────────────────────────
const cites = citesPath ? JSON.parse(readFileSync(citesPath, 'utf8')) : {}
const profile = profilePath ? JSON.parse(readFileSync(profilePath, 'utf8')) : null
// --seed: model-authored frontmatter for a FRESH tree (journey/persona/module
// per story key) — the judgment inputs a first extraction cannot derive.
// An existing story file always wins over the seed.
const seed = seedPath ? JSON.parse(readFileSync(seedPath, 'utf8')) : {}

const cfgPath = join(dirAbs, 'config.yaml')
const cfgText = existsSync(cfgPath) ? readFileSync(cfgPath, 'utf8') : ''
const cfg = readScalars(cfgText)

// ── PROJECT scope: the journeys tree (SKA-028, A5 ruling B) ─────────────────
// One file per journey — frontmatter + VERBATIM narrative body — emitted from
// journeys.yaml (the index) and each entry's source document. Same fidelity
// doctrine as epic docs; pinned when the tree is git-versioned,
// resolvable-but-unpinnable otherwise, stated either way.
if ((cfg.scope?.value ?? '') === 'project') {
  const jyPath = join(dirAbs, 'journeys.yaml')
  if (!existsSync(jyPath)) die(`${DIR}/journeys.yaml does not exist — the index is what names the journeys to emit`)
  const entries = readCollection(readFileSync(jyPath, 'utf8'), 'journeys')
  if (!entries.length) die(`${DIR}/journeys.yaml has no journey entries`)

  const pinned = pin != null && repoId != null
  if (!pinned) report.notes.push('spec-home is not git-versioned (or has no origin): journey sources are RESOLVABLE BUT UNPINNABLE — the fidelity gate falls back to the working tree with its stated note. A weaker guarantee; give the tree a git home to end it.')

  for (const e of [...entries].sort((a, b) => a.key.localeCompare(b.key, 'en'))) {
    const src = e.fields.source
    if (!src) { report.refusals.push(`${e.key}: no source in journeys.yaml — the record needs the document that justifies it`); continue }
    const [srcPath, anchor] = src.split('#')
    const abs = join(ROOT, srcPath.trim())
    if (!existsSync(abs)) { report.refusals.push(`${e.key}: source ${srcPath.trim()} does not exist — nothing to import`); continue }
    const wt = readFileSync(abs, 'utf8')
    if (pinned) {
      const atPin = gitShow(pin, srcPath.trim())
      if (atPin == null) die(`${srcPath.trim()} is not in git at ${pin} — commit it; the pin must be truthful`)
      if (atPin !== wt) die(`${srcPath.trim()} differs from ${pin} in the working tree — commit the edits first`)
    }
    const section = anchor ? sectionByAnchor(wt, anchor) : null
    if (!section) { report.refusals.push(`${e.key}: no section matching "#${anchor ?? '(none)'}" in ${srcPath.trim()} — refused rather than emit an empty record`); continue }
    if (!e.fields.goal || !e.fields.persona) report.notes.push(`${e.key}: journeys.yaml carries no ${!e.fields.goal ? 'goal' : 'persona'} — emitted as-is; verify will name it`)
    write(`journeys/${e.key}.md`, renderJourneyDoc({
      key: e.key, title: e.label, goal: e.fields.goal ?? '', persona: e.fields.persona ?? '',
      sourcePath: srcPath.trim(), anchor: anchor?.trim() || null,
      repoId: pinned ? repoId : null, pin: pinned ? pin : null,
      body: section.raw,
    }))
  }

  console.log(`\n  prepare journeys tree — ${pinned ? `pin ${pin} · repo ${repoId}` : 'UNPINNED (no git home)'} · scope: project`)
  console.log(`  ${report.emitted.length} journey record(s) emitted from ${entries.length} index entries\n`)
  if (report.refusals.length) { console.log('  REFUSED (loudly, per entry):'); for (const x of report.refusals) console.log(`    ${x}`) }
  for (const n of report.notes) console.log(`  ${n}`)
  console.log('\n  journeys.yaml stays the index; the files are the records. Next: /sakal-verify.\n')
  process.exit(0)
}

// ── APP scope from here down: the pin is load-bearing ───────────────────────
if (!pin) die('not a git repository — the sha pin is load-bearing for an app-scope re-extract and there is nothing to pin against')
if (!repoId) die('no `origin` remote — source URIs are `<owner>/<repo>:<path>@<sha>` and the owner/repo half must come from the repo, not a guess')
if (!existsSync(specsAbs)) die(`${SPECS}/ does not exist — prepare re-extracts from the spec set and there is none to read`)
const APP = cfg.app?.value ?? null
if (!APP) die(`${DIR}/config.yaml has no \`app\` — the epic and story frontmatter carry it, and it is a declaration, not a guess`)

// ── the spec-format family (SKA-026) ────────────────────────────────────────
// Resolution: --family flag > config `spec_family:` > unanimous strong signal
// from the files > `reference`. The resolved family is DECLARED back into
// config.yaml so verify parses fidelity with the exact same parameters.
// Per-file signals may only VETO (a contradiction is a refusal, never a guess).
const famName = familyFlag ?? cfg.spec_family?.value ?? null
if (famName && !FAMILIES[famName]) die(`unknown spec family "${famName}" — one of: ${Object.keys(FAMILIES).join(', ')}`)
let FAM = famName ? FAMILIES[famName] : null
if (!FAM) {
  const seen = new Set()
  for (const f of readdirSync(specsAbs).filter(n => n.endsWith('.md') && !/^00-/.test(n) && !/^README/i.test(n)))
    for (const s of detectFamilySignals(readFileSync(join(specsAbs, f), 'utf8'))) seen.add(s.family)
  if (seen.size > 1) die(`spec family is ambiguous — signals for {${[...seen].join(', ')}} across ${SPECS}/. Declare one: --family <name> or \`spec_family:\` in config.yaml`)
  FAM = FAMILIES[[...seen][0] ?? 'reference']
}

// Spec files by the family's naming convention, sorted. Deterministic.
const specFiles = readdirSync(specsAbs)
  .filter(f => FAM.filePattern.test(f) && !/^00-/.test(f) && !/^README/i.test(f))
  .sort((a, b) => a.localeCompare(b, 'en'))
if (!specFiles.length) die(`${SPECS}/ has no spec files matching the ${FAM.name} family's naming (${FAM.filePattern})`)

// Existing story files, keyed by story key — the convergence baseline.
// journey/persona/module are PRESERVED from them (addendum item 2); cites are
// carried forward from them when --cites has no entry.
function walkMd(d) {
  if (!existsSync(d)) return []
  return readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walkMd(join(d, e.name)) : (e.name.endsWith('.md') ? [join(d, e.name)] : []))
}
const existing = new Map()
for (const p of walkMd(join(dirAbs, 'stories'))) {
  const lines = readFileSync(p, 'utf8').split('\n')
  if (lines[0]?.trim() !== '---') continue
  const end = lines.indexOf('---', 1)
  if (end < 0) continue
  const fm = readScalars(lines.slice(1, end).join('\n'))
  if (!fm.key?.value) continue
  existing.set(fm.key.value, { path: p, fm, body: lines.slice(end + 1).join('\n') })
}

// Cites already sitting in an existing NEW-format story file (fenced yaml).
function existingCites(body) {
  const out = new Map()  // letter suffix of ac id → [{kind, path, symbol, note}]
  let ac = null, cite = null, inYaml = false
  for (const raw of body.split('\n')) {
    if (/^```yaml\s*$/.test(raw)) { inYaml = true; continue }
    if (/^```\s*$/.test(raw)) { inYaml = false; ac = null; cite = null; continue }
    if (!inYaml) continue
    let m
    if ((m = raw.match(/^-\s+ac:\s*(\S+)\s*$/))) { ac = m[1]; cite = null; out.set(ac, []); continue }
    if (!ac) continue
    if ((m = raw.match(/^\s+-\s+kind:\s*(\S+)\s*$/))) { cite = { kind: m[1] }; out.get(ac).push(cite); continue }
    if (cite && (m = raw.match(/^\s+(path|symbol|note):\s*(.*)$/))) cite[m[1]] = yamlUnquote(m[2])
  }
  return out
}

// ── cite confirmation (the honesty gate, in code) ───────────────────────────
function confirmCite(c, where) {
  if (!c || !c.kind || !c.path || !c.symbol) { report.dropped.push(`${where}: malformed cite ${JSON.stringify(c)} — needs kind/path/symbol`); return null }
  if (c.kind !== 'enforced' && c.kind !== 'verified') { report.dropped.push(`${where}: kind "${c.kind}" is not enforced|verified`); return null }
  const content = gitShow(pin, c.path)
  if (content == null) { report.dropped.push(`${where}: ${c.path} does not exist at ${pin} — cite dropped`); return null }
  const line = c.kind === 'enforced' ? findDeclaration(content, c.symbol) : findTestLabel(content, c.symbol)
  if (!line) { report.dropped.push(`${where}: no ${c.kind === 'enforced' ? 'declaration' : 'test label'} "${c.symbol}" greps in ${c.path}@${pin} — cite dropped`); return null }
  return { kind: c.kind, path: c.path, symbol: c.symbol, note: c.note ?? null }
}

// ── emit ────────────────────────────────────────────────────────────────────

// ── parse every spec, then HOLD at the S1 gate before writing anything ──────
// S1 (A2), the core invariant of this task: prepare counts AC-LIKE lines per
// file (any checkbox variant, any AC-n label, any list item under an
// "acceptance criteria" heading) and REFUSES when it parsed fewer than it
// detected. Zero-AC extraction from an AC-bearing file — the D-01 failure
// mode — is impossible by construction. A non-owner spec family refuses
// loudly here instead of extracting wrongly.
const parsed = []
const s1Violations = [], vetoes = [], dirty = []
for (const file of specFiles) {
  const specRel = `${SPECS}/${file}`
  const text = readFileSync(join(specsAbs, file), 'utf8')

  // THE PIN MUST BE TRUTHFUL: emitted text claims `@<pin>`, so the working
  // tree must equal the pinned bytes. An uncommitted spec edit would make
  // every source line a lie — refuse, don't launder.
  const pinned = gitShow(pin, specRel)
  if (pinned == null) { dirty.push(`${specRel}: not in git at ${pin} (untracked or new) — commit it first`); continue }
  if (pinned !== text) { dirty.push(`${specRel}: working tree differs from ${pin} — commit the spec edits first (the pin must be truthful)`); continue }

  // Family veto: a strong header signal for a DIFFERENT family is a refusal
  // naming both candidates — never a guess, never a silent misparse.
  for (const s of detectFamilySignals(text))
    if (s.family !== FAM.name) vetoes.push(`${specRel}: declared family "${FAM.name}" but ${s.why} → "${s.family}"`)

  // Epic key: from the filename, except legacyflat (flutter-pos), where NO
  // filename carries a key — the `**Story prefix:**` header line does.
  let epicKey = null
  if (FAM.epicKeyFrom === 'filename') epicKey = file.match(/^([A-Za-z]{2,}-\d{2})/)?.[1] ?? null
  else {
    const sp = text.match(/\*\*Story prefix:\*\*\s*`?([A-Za-z]{2,}-\d{2}[A-Za-z]?)-`?/)
    epicKey = sp ? sp[1] : null
  }
  if (!epicKey) { report.refusals.push(`${specRel}: no epic key derivable (${FAM.epicKeyFrom === 'filename' ? 'filename carries none' : 'no **Story prefix:** header line'}) — file skipped LOUDLY`); continue }

  const spec = parseSpec(text, FAM, { epicKey })
  const detected = detectAcLines(text)
  const parsedLines = new Set(spec.stories.flatMap(st => st.acs.map(a => a.line)))
  for (const [line, raw] of detected)
    if (!parsedLines.has(line))
      s1Violations.push(`${specRel}:${line}  AC-like line not parsed: "${raw.length > 100 ? raw.slice(0, 100) + '…' : raw}"`)
  parsed.push({ file, specRel, text, spec, epicKey })
}
if (dirty.length) {
  console.error(`REFUSED — ${dirty.length} spec file(s) are not identical to the pin (${pin}). Nothing was emitted.`)
  for (const d of dirty) console.error(`  ${d}`)
  process.exit(2)
}
if (vetoes.length) {
  console.error(`REFUSED — family detection contradicts the declared family. Nothing was emitted; a guess here misparses silently.`)
  for (const v of vetoes) console.error(`  ${v}`)
  console.error(`\nDeclare the right one (--family / config \`spec_family:\`) or split the spec sets.`)
  process.exit(2)
}
if (s1Violations.length) {
  console.error(`REFUSED — S1 loud-fail invariant: ${s1Violations.length} AC-like line(s) detected that the "${FAM.name}" family parameters did not parse.`)
  console.error('Nothing was emitted. Extracting past these would silently drop acceptance criteria (the D-01 failure mode).\n')
  for (const v of s1Violations) console.error(`  ${v}`)
  console.error('\nEither the family declaration is wrong, the family is not supported yet, or the line is malformed — fix the declaration or the spec, or extend the family.')
  process.exit(2)
}

const specStoryKeys = new Set()
const statusVoices = []
for (const { specRel, text, spec, epicKey } of parsed) {
  if (!spec.title) { report.refusals.push(`${specRel}: no H1 title — epic ${epicKey} not emitted`); continue }
  if (!spec.stories.length) report.notes.push(`${specRel}: ZERO stories under prefix ${epicKey}- (a declared-prefix, story-less spec) — epic doc emitted, nothing else; not an error, but a human should know`)

  // Duplicate-anchor guard: an ambiguous anchor is silently ambiguous
  // provenance, and that is never emitted (0.5.1 slugger doctrine).
  const slugCount = new Map()
  for (const raw of text.split('\n')) {
    const m = raw.match(/^#{1,6}\s+(.*?)\s*$/)
    if (m) { const s = slug(m[1]); slugCount.set(s, (slugCount.get(s) ?? 0) + 1) }
  }

  write(`epics/${epicKey}.md`, renderEpicDoc(spec, { epicKey, app: APP, specRel, repoId, pin }))

  // S5 (A2): every status voice captured verbatim — header, story trailers,
  // marker distribution. Quoted into findings.md below; NOTHING is chosen.
  {
    const trailers = new Map(), markers = new Map(), inText = new Map(), conflicts = []
    for (const st of spec.stories) {
      if (st.statusTrailerRaw) trailers.set(st.statusTrailerRaw, (trailers.get(st.statusTrailerRaw) ?? 0) + 1)
      for (const ac of st.acs) {
        markers.set(ac.marker, (markers.get(ac.marker) ?? 0) + 1)
        // The as-built families carry a FIFTH status voice: an emoji leading
        // the AC text itself (`— ✅ Built — …`). Counted, and checked against
        // the checkbox it rides on — a `[x]` over a 🔴/🟡 text (or a `[ ]`
        // over a ✅) is a contradiction to quote, not resolve.
        const t = ac.text.match(/^(✅|🔴|🟡|🟢|🟣|⚪)/)
        if (t) {
          inText.set(t[1], (inText.get(t[1]) ?? 0) + 1)
          const checked = /\[[xX]\]/.test(ac.marker)
          if ((checked && (t[1] === '🔴' || t[1] === '🟡')) || (!checked && /\[\s\]/.test(ac.marker) && t[1] === '✅'))
            conflicts.push(`${st.key} AC-${ac.n ?? '?'}: checkbox ${ac.marker} vs in-text ${t[1]}`)
        }
      }
    }
    statusVoices.push({ epicKey, header: spec.statusHeaderRaw, trailers, markers, inText, conflicts, extras: spec.headerExtrasRaw })
  }

  // Imported reference lines whose relative links escape the repo: preserved
  // verbatim (they are imports), named in the report (P6 rules apply only to
  // `source:` fields prepare authors).
  for (const s of spec.sections)
    for (const m of s.body.matchAll(/\]\((\.\.[^)]*)\)/g))
      report.unresolvableImported.push(`epics/${epicKey}.md · ${s.heading}: ${m[1]} (imported verbatim; escapes the repo)`)

  // Stories, spec order.
  for (const st of spec.stories) {
    specStoryKeys.add(st.key)
    if (slugCount.get(st.anchor) > 1) { report.refusals.push(`${specRel}: heading anchor "#${st.anchor}" is ambiguous (${slugCount.get(st.anchor)} headings slug identically) — ${st.key} not emitted rather than emit ambiguous provenance`); continue }
    if (st.acs.length > 26) { report.refusals.push(`${specRel}: ${st.key} has ${st.acs.length} ACs — the <story-key>-<letter> id space ends at z; split the story`); continue }
    const prev = existing.get(st.key)
    if (!prev) report.newStories.push(`${st.key} (${specRel}) — new: journey/module need a human; persona derived from the story sentence`)

    // S3 (A2): no triple → no sentence. Fabrication is worse than absence;
    // the heading/first paragraph is provenance context, not a fake voice.
    if (st.persona == null || st.want == null || st.soThat == null)
      report.notes.push(`${st.key}: no As-a/I-want/So-that triple in the spec — story sentence left EMPTY (S3); a human should voice it. Context: "${(st.context ?? st.title).slice(0, 80)}"`)
    // Story-body lines the emission does not carry (in-story blockquotes,
    // stray prose): named LOUDLY — they stay in the spec, and the per-repo
    // D-02 homeless-content scan gates any spec deletion.
    if (st.uncarried.length)
      report.notes.push(`${st.key}: ${st.uncarried.length} story-body line(s) not carried into the emission (first: ${specRel}:${st.uncarried[0].line} "${st.uncarried[0].text.slice(0, 60)}…") — they remain in the spec; the D-02 scan gates deletion`)
    if (st.extrasRaw.length)
      for (const x of st.extrasRaw) report.unresolvableImported.push(`${st.key}: story-level ${x.slice(0, 90)} (${CONSUMES_SLOT.test(x) ? 'carried in the story\'s consumes_raw frontmatter' : 'quoted here — its one copy'})`)

    // Cites: --cites entries are authoritative; otherwise carry forward from
    // the existing file. EVERYTHING is re-confirmed at the pin, and every
    // non-default marker is a search HINT the model already had — never
    // auto-promoted to a citation (S2).
    const carried = prev ? existingCites(prev.body) : new Map()
    const resolved = new Map()
    st.acs.forEach((ac, i) => {
      const letter = acLetter(i), id = `${st.key}-${letter}`
      const given = cites[st.key]?.[letter]
      let list
      if (given) list = (given.cite ?? []).map(c => confirmCite(c, id)).filter(Boolean)
      else {
        list = (carried.get(id) ?? []).map(c => confirmCite(c, id)).filter(Boolean)
        if (list.length) report.carried.push(`${id}: ${list.length} cite(s) carried from the existing file, re-confirmed at ${pin}`)
      }
      if (!list.length) {
        const reason = given?.reason ?? (given || carried.has(id) ? 'no cite survived confirmation' : 'no evidence offered')
        report.uncited.push({ story: st.key, letter, reason })
      }
      resolved.set(letter, list)
    })

    // Frontmatter judgment values: existing file > --seed > derived persona.
    const sd = seed[st.key] ?? {}
    write(`stories/${epicKey}/${st.key}.md`, renderStoryDoc(st, {
      epicKey, app: APP, specRel, repoId, pin,
      journey: prev?.fm.journey?.value ?? sd.journey ?? null,
      persona: prev?.fm.persona?.value ?? sd.persona ?? slug(st.persona ?? '').split('-')[0],
      module: prev?.fm.module?.value ?? sd.module ?? null,
      cites: resolved,
    }))
  }
}

// ── S4/A3.1: the consumes slot lives in FRONTMATTER now — one copy, in the
// record that survives R1 deletion. The renderers emit it; here only the
// promote-time guidance and the superseded-file check remain.
{
  if (parsed.some(({ spec }) => spec.headerExtrasRaw.some(x => /^\*\*Journeys?:\*\*/.test(x))))
    report.notes.push('`Journey(s):` values in consumes_raw are INTEGER INDICES into this set\'s journeys doc — resolve by index at promote time and mint stable IDs there; do NOT invent letter keys')
  if (existsSync(join(dirAbs, 'proposals/consumes-raw.yaml')))
    report.notes.push('proposals/consumes-raw.yaml is SUPERSEDED (A3.1): consumes_raw now lives in epic/story frontmatter — delete the file by hand; prepare never deletes')
}

// ── S5 (A2): status voices → findings.md, managed block, nothing chosen ─────
{
  const B = '<!-- sakal-prepare:status-voices:begin -->'
  const E = '<!-- sakal-prepare:status-voices:end -->'
  const body = ['', B,
    '## Status voices, captured verbatim (S5, Addendum A2 — machine-written block)',
    '',
    'Every status assertion the specs carry, quoted; NONE imported, NONE chosen.',
    'Derived status is the only truth. Where voices disagree, the disagreement',
    'is the finding.', '']
  for (const v of statusVoices) {
    const trailerStr = [...v.trailers].map(([t, n]) => `${n}× \`${t}\``).join(' · ') || '(none)'
    const markerStr = [...v.markers].map(([m, n]) => `${n}× \`${m}\``).join(' · ') || '(none)'
    const inTextStr = [...v.inText].map(([e, n]) => `${n}× ${e}`).join(' · ')
    // Non-consumes header extras (audit metadata: Implementation synced,
    // Added, Last updated) — quoted HERE, their one copy; the consumes slot
    // itself lives in the epic frontmatter (A3.1).
    const metaStr = v.extras.filter(x => !CONSUMES_SLOT.test(x)).map(x => `\`${x}\``).join(' · ')
    body.push(`- **${v.epicKey}** — header: ${v.header ? `\`${v.header}\`` : '(none)'} · trailers: ${trailerStr} · AC markers: ${markerStr}${inTextStr ? ` · in-text AC status: ${inTextStr}` : ''}${metaStr ? ` · header metadata: ${metaStr}` : ''}`)
    const checked = [...v.markers].filter(([m]) => m !== '[ ]').reduce((a, [, n]) => a + n, 0)
    if (checked && /🔴|planned/i.test(v.header ?? '')) body.push(`  - CONTRADICTION: the header claims planned while ${checked} AC marker(s) claim done — both quoted, neither believed.`)
    for (const c of v.conflicts) body.push(`  - CONTRADICTION (checkbox vs in-text): ${c} — both quoted, neither believed.`)
  }
  body.push(E, '')
  const findingsPath = join(OUT ? outAbs : dirAbs, 'findings.md')
  const cur = existsSync(findingsPath) ? readFileSync(findingsPath, 'utf8')
    : (existsSync(join(dirAbs, 'findings.md')) ? readFileSync(join(dirAbs, 'findings.md'), 'utf8') : '# Findings carried into the import\n')
  const block = body.join('\n')
  const next = cur.includes(B)
    ? cur.replace(new RegExp(`\\n?${B}[\\s\\S]*?${E}\\n?`), block)
    : cur.replace(/\n*$/, '\n') + block
  mkdirSync(dirname(findingsPath), { recursive: true })
  writeFileSync(findingsPath, next)
  report.notes.push('findings.md: status-voices block written (managed markers; the rest of the file is untouched)')
}

// Orphans: story files whose key no longer exists in any spec. Reported, NEVER
// deleted — a spec section that disappeared may still be live work.
for (const [key, e] of existing)
  if (!specStoryKeys.has(key)) report.orphans.push(`${key} (${e.path}) — no spec section at this checkout; kept as-is, not regenerated`)

// ── app profile → config.yaml ───────────────────────────────────────────────
// App-level declaration data lives in the app-level file. Lists are comma-
// joined scalars so the config grammar stays one you can hold in your head.
{
  let cur = cfgText
  // The resolved family is DECLARED into config.yaml so verify parses
  // fidelity with the exact same parameters. Replace-or-append, idempotent.
  if (/^spec_family:/m.test(cur)) cur = cur.replace(/^spec_family:.*$/m, `spec_family: ${FAM.name}`)
  else cur = cur.replace(/\n*$/, '\n') + `\n# Spec-format family (D-01 survey) — verify's fidelity gate parses with the\n# same family parameters; the S1 loud-fail gate refuses a wrong declaration.\nspec_family: ${FAM.name}\n`
  if (profile) {
    // B2 (A4): conventions_files — `@`-includes expanded at emission (a
    // newborn does not process CLAUDE.md includes), every file confirmed to
    // exist AT THE PIN, and nothing under the directory R1 deletes.
    const readAtPin = p => gitShow(pin, p)
    const { files: conv, missing } = expandConventionIncludes(readAtPin, profile.conventions_files ?? [])
    if (missing.length) die(`conventions_files: ${missing.join(', ')} not in git at ${pin} — the profile must not name files outside the record (commit them, or fix the list)`)
    const specsPrefix = SPECS.replace(/\/+$/, '')
    const doomed = conv.filter(p => p === specsPrefix || p.startsWith(specsPrefix + '/'))
    if (doomed.length) die(`conventions_files: ${doomed.join(', ')} live under ${specsPrefix}/, which R1 deletes after extraction — the profile must never name a doomed file`)
    for (const p of conv) {
      const wt = join(ROOT, p)
      if (existsSync(wt) && readFileSync(wt, 'utf8') !== readAtPin(p))
        die(`${p} differs from ${pin} in the working tree — commit it; the profile attests pinned bytes`)
    }
    // B3 (A4): the denylist is DERIVED from the RULES denylist section,
    // verbatim; a diverging profile input is a refusal with the diff — an
    // understated denylist is the profile lying about guardrails.
    let denylist = profile.denylist ?? []
    const rulesPath = conv.find(p => /(^|\/)RULES\.md$/i.test(p))
    const derived = rulesPath ? denylistFromRules(readAtPin(rulesPath)) : []
    if (derived.length) {
      if (profile.denylist && profile.denylist.join('\n') !== derived.join('\n'))
        die(`denylist diverges from the source of truth (${rulesPath} §denylist).\n  derived (verbatim): ${derived.join(', ')}\n  profile input:      ${profile.denylist.join(', ')}\nDrop the profile's denylist (it derives), or fix ${rulesPath}.`)
      denylist = derived
      report.notes.push(`denylist derived verbatim from ${rulesPath} (${derived.length} globs)`)
    } else report.notes.push(`no denylist section found in the conventions files — denylist taken from the profile input as-is`)
    report.notes.push(`conventions_files expanded: ${conv.join(', ')}`)

    const j = v => Array.isArray(v) ? v.join(', ') : (v ?? '')
    const block = [
      '',
      '# App profile (SKA-025/027): local declaration data about this repo\'s own',
      '# build/verify/lint tooling. denylist derives from the RULES denylist',
      '# section; conventions_files are @-include-expanded (both checked locally',
      '# by prepare). Lists are comma-separated.',
      'app_profile:',
      `  setup_cmd: ${profile.setup_cmd ?? ''}`,
      `  verify_cmd: ${profile.verify_cmd ?? ''}`,
      `  denylist: ${j(denylist)}`,
      `  evidence_format: ${profile.evidence_format ?? ''}`,
      `  conventions_files: ${j(conv)}`,
      '',
    ].join('\n')
    cur = cur
      .replace(/\n*(?:# App profile[^\n]*\n(?:#[^\n]*\n)*)?app_profile:\n(?:[ \t]+[^\n]*\n?)*/g, '\n')
      .replace(/\n+$/, '\n') + block
    report.notes.push(`config.yaml: spec_family + app_profile written (${OUT ? 'to --out copy' : 'in place'})`)
  } else report.notes.push(`config.yaml: spec_family: ${FAM.name} declared; no --profile given — existing app_profile (if any) left untouched`)
  const cfgOutPath = OUT ? join(outAbs, 'config.yaml') : cfgPath
  mkdirSync(dirname(cfgOutPath), { recursive: true })
  writeFileSync(cfgOutPath, cur)
}

// ── the prepare report ──────────────────────────────────────────────────────
console.log(`\n  prepare re-extract — pin ${pin} (HEAD at prepare time, one pin per run) · repo ${repoId} · family ${FAM.name}`)
console.log(`  specs: ${specFiles.length} files → ${report.emitted.filter(f => f.startsWith('epics/')).length} epics, ${report.emitted.filter(f => f.startsWith('stories/')).length} stories emitted${OUT ? ` → ${OUT}` : ''}\n`)
if (report.newStories.length) { console.log('  NEW stories (not in the existing tree):'); for (const x of report.newStories) console.log(`    ${x}`) }
if (report.orphans.length) { console.log('  ORPHANS (in the tree, not in any spec — kept, never deleted):'); for (const x of report.orphans) console.log(`    ${x}`) }
if (report.refusals.length) { console.log('  REFUSED (nothing ambiguous is emitted):'); for (const x of report.refusals) console.log(`    ${x}`) }
if (report.dropped.length) { console.log('  DROPPED cites (failed same-run confirmation — never silently kept):'); for (const x of report.dropped) console.log(`    ${x}`) }
if (report.carried.length) { console.log('  carried cites (from existing files, re-confirmed):'); for (const x of report.carried) console.log(`    ${x}`) }
if (report.uncited.length) {
  console.log('  uncited ACs — an honest gap beats a false claim:')
  const byStory = new Map()
  for (const u of report.uncited) { if (!byStory.has(u.story)) byStory.set(u.story, []); byStory.get(u.story).push(u) }
  for (const [story, us] of byStory) console.log(`    ${story}: ${us.map(u => `\`-${u.letter}\` ${u.reason}`).join(' · ')}`)
}
if (report.unresolvableImported.length) { console.log('  unresolvable-imported reference lines (verbatim imports; P6 applies only to authored source: fields):'); for (const x of new Set(report.unresolvableImported)) console.log(`    ${x}`) }
for (const n of report.notes) console.log(`  ${n}`)
console.log('\n  Next: /sakal-verify — the fidelity gate reads the spec back through the same pin.\n')
