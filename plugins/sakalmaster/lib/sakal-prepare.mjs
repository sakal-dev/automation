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
//   config.yaml app_profile:   app-level declaration data; submit maps it onto
//                              the SKM-034 apps columns, degrading gracefully
//                              when the server predates them.
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
  renderEpicDoc, renderStoryDoc,
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

const dirAbs = isAbsolute(DIR) ? DIR : join(ROOT, DIR)
const outAbs = OUT ?? dirAbs
const specsAbs = isAbsolute(SPECS) ? SPECS : join(ROOT, SPECS)
const report = { emitted: [], uncited: [], dropped: [], carried: [], unresolvableImported: [], orphans: [], newStories: [], refusals: [], notes: [] }
const die = m => { console.error(`REFUSED — ${m}`); process.exit(2) }

// ── the pin and the repo identity ───────────────────────────────────────────
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim()
let pin = opt('--pin', null)
try { if (!pin) pin = git('rev-parse', '--short', 'HEAD') } catch { die('not a git repository — the sha pin is load-bearing and there is nothing to pin against') }
let repoId = null
try {
  const url = git('remote', 'get-url', 'origin')
  const m = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)
  if (m) repoId = m[1]
} catch { /* no origin */ }
if (!repoId) die('no `origin` remote — source URIs are `<owner>/<repo>:<path>@<sha>` and the owner/repo half must come from the repo, not a guess')

const showCache = new Map()
function gitShow(sha, path) {
  const k = `${sha}:${path}`
  if (showCache.has(k)) return showCache.get(k)
  let out = null
  try { out = execFileSync('git', ['-C', ROOT, 'show', `${sha}:${path}`], { encoding: 'utf8' }) } catch { out = null }
  showCache.set(k, out); return out
}

// ── inputs ──────────────────────────────────────────────────────────────────
if (!existsSync(specsAbs)) die(`${SPECS}/ does not exist — prepare re-extracts from the spec set and there is none to read`)
const cites = citesPath ? JSON.parse(readFileSync(citesPath, 'utf8')) : {}
const profile = profilePath ? JSON.parse(readFileSync(profilePath, 'utf8')) : null

const cfgPath = join(dirAbs, 'config.yaml')
const cfg = existsSync(cfgPath) ? readScalars(readFileSync(cfgPath, 'utf8')) : {}
const APP = cfg.app?.value ?? null
if (!APP) die(`${DIR}/config.yaml has no \`app\` — the epic and story frontmatter carry it, and it is a declaration, not a guess`)

// Spec files: `<PREFIX>-<NN>-*.md`, sorted by epic number. Deterministic.
const specFiles = readdirSync(specsAbs)
  .filter(f => /^[A-Za-z]{2,}-\d{2}-.*\.md$/.test(f))
  .sort((a, b) => a.localeCompare(b, 'en'))
if (!specFiles.length) die(`${SPECS}/ has no <PREFIX>-<NN>-*.md spec files`)

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
const write = (relPath, content) => {
  const abs = join(outAbs, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
  report.emitted.push(relPath)
}

// ── parse every spec, then HOLD at the S1 gate before writing anything ──────
// S1 (A2), the core invariant of this task: prepare counts AC-LIKE lines per
// file (any checkbox variant, any AC-n label, any list item under an
// "acceptance criteria" heading) and REFUSES when it parsed fewer than it
// detected. Zero-AC extraction from an AC-bearing file — the D-01 failure
// mode — is impossible by construction. A non-owner spec family refuses
// loudly here instead of extracting wrongly.
const parsed = []
const s1Violations = []
for (const file of specFiles) {
  const specRel = `${SPECS}/${file}`
  const text = readFileSync(join(specsAbs, file), 'utf8')
  const spec = parseSpec(text)
  const detected = detectAcLines(text)
  const parsedLines = new Set(spec.stories.flatMap(st => st.acs.map(a => a.line)))
  for (const [line, raw] of detected)
    if (!parsedLines.has(line))
      s1Violations.push(`${specRel}:${line}  AC-like line not parsed: "${raw.length > 100 ? raw.slice(0, 100) + '…' : raw}"`)
  parsed.push({ file, specRel, text, spec })
}
if (s1Violations.length) {
  console.error(`REFUSED — S1 loud-fail invariant: ${s1Violations.length} AC-like line(s) detected that the extractor did not parse.`)
  console.error('Nothing was emitted. Extracting past these would silently drop acceptance criteria (the D-01 failure mode).\n')
  for (const v of s1Violations) console.error(`  ${v}`)
  console.error('\nEither the spec family is not supported yet (SKA-026 parameterizes the machinery), or the line is malformed — fix the spec or extend the family.')
  process.exit(2)
}

const specStoryKeys = new Set()
const statusVoices = []
for (const { file, specRel, text, spec } of parsed) {
  const epicKey = file.match(/^([A-Za-z]{2,}-\d{2})/)[1]
  if (!spec.title) { report.refusals.push(`${specRel}: no H1 title — epic ${epicKey} not emitted`); continue }

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
    const trailers = new Map(), markers = new Map()
    for (const st of spec.stories) {
      if (st.statusTrailerRaw) trailers.set(st.statusTrailerRaw, (trailers.get(st.statusTrailerRaw) ?? 0) + 1)
      for (const ac of st.acs) markers.set(ac.marker, (markers.get(ac.marker) ?? 0) + 1)
    }
    statusVoices.push({ epicKey, header: spec.statusHeaderRaw, trailers, markers, extras: spec.headerExtrasRaw })
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

    write(`stories/${epicKey}/${st.key}.md`, renderStoryDoc(st, {
      epicKey, app: APP, specRel, repoId, pin,
      journey: prev?.fm.journey?.value ?? null,
      persona: prev?.fm.persona?.value ?? slug(st.persona ?? '').split('-')[0],
      module: prev?.fm.module?.value ?? null,
      cites: resolved,
    }))
  }
}

// ── S4 (A2): Consumes/Implements/Journey(s) → proposals/, verbatim ──────────
// Key AND value, no normalization. Mapping to real project-layer keys is
// promote-time work, so the capture lands in proposals/ — which verify
// acknowledges and submit NEVER sends — rather than in frontmatter the
// fixtures pin down.
{
  const lines = [
    '# Header keys captured verbatim at extraction (S4, Addendum A2)',
    '#',
    '# Key AND value, no normalization — mapping "Consumes: …" to real journey/',
    '# feature keys is project-layer work at propose/promote time, by a human.',
    '# This file is never submitted.',
    'consumes_raw:',
  ]
  let any = false
  for (const v of statusVoices) for (const raw of v.extras) { any = true; lines.push(`  - ${v.epicKey} — "${raw.replace(/"/g, '\\"')}"`) }
  if (any) write('proposals/consumes-raw.yaml', lines.join('\n') + '\n')
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
    body.push(`- **${v.epicKey}** — header: ${v.header ? `\`${v.header}\`` : '(none)'} · trailers: ${trailerStr} · AC markers: ${markerStr}`)
    const checked = [...v.markers].filter(([m]) => m !== '[ ]').reduce((a, [, n]) => a + n, 0)
    if (checked && /🔴|planned/i.test(v.header ?? '')) body.push(`  - CONTRADICTION: the header claims planned while ${checked} AC marker(s) claim done — both quoted, neither believed.`)
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
if (profile) {
  const j = v => Array.isArray(v) ? v.join(', ') : (v ?? '')
  const block = [
    '',
    '# App profile (SKA-025): declaration data for the SKM-034 apps columns.',
    '# Submit maps it via sakal_update_app and holds it back gracefully when the',
    '# server predates those columns. Lists are comma-separated.',
    'app_profile:',
    `  setup_cmd: ${profile.setup_cmd ?? ''}`,
    `  verify_cmd: ${profile.verify_cmd ?? ''}`,
    `  denylist: ${j(profile.denylist)}`,
    `  evidence_format: ${profile.evidence_format ?? ''}`,
    `  conventions_files: ${j(profile.conventions_files)}`,
    '',
  ].join('\n')
  const cur = existsSync(cfgPath) ? readFileSync(cfgPath, 'utf8') : ''
  // Replace an existing block (comment lines + app_profile: + indented lines),
  // else append. Idempotent, so two runs are byte-identical.
  const stripped = cur
    .replace(/\n*(?:# App profile[^\n]*\n(?:#[^\n]*\n)*)?app_profile:\n(?:[ \t]+[^\n]*\n?)*/g, '\n')
    .replace(/\n+$/, '\n')
  const cfgOut = stripped + block
  const cfgOutPath = OUT ? join(outAbs, 'config.yaml') : cfgPath
  mkdirSync(dirname(cfgOutPath), { recursive: true })
  writeFileSync(cfgOutPath, cfgOut)
  report.notes.push(`config.yaml: app_profile written (${OUT ? 'to --out copy' : 'in place'})`)
} else report.notes.push('config.yaml: no --profile given — existing app_profile (if any) left untouched')

// ── the prepare report ──────────────────────────────────────────────────────
console.log(`\n  prepare re-extract — pin ${pin} (HEAD at prepare time, one pin per run) · repo ${repoId}`)
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
