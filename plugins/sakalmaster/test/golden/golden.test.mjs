#!/usr/bin/env node
// =============================================================================
// Golden suite (SKA-025, Addendum A2 item S6).
//
// INPUTS are SNAPSHOTS of real spec files — never hand-written miniatures:
//   inputs/owner/OA-01-platform-auth-shell.md   sakal-dev/sakalpos-owner @1e272bc
//   inputs/garage/GR-05-submit-and-handoff.md   garage-flutter @2d77a8c (family 2)
// EXPECTED outputs are authored here in the suite — for the owner family they
// are the two Addendum A1 acceptance fixtures, byte for byte.
//
// The suite drives the SAME renderers sakal-prepare.mjs uses (they live in
// sakal-shared.mjs precisely so this is possible), with the pin and cites
// fixed — so a renderer change that would break the fixtures breaks HERE,
// without needing the owner-flutter checkout.
//
// Structure is ready for the D-01 named set: add inputs/<family>/… +
// expected/<family>/… and a case below. SKA-026 fills the other families.
// =============================================================================
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSpec, detectAcLines, renderEpicDoc, renderStoryDoc, FAMILIES, detectFamilySignals, sectionByAnchor, renderJourneyDoc, readCollection } from '../../lib/sakal-shared.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const read = p => readFileSync(join(here, p), 'utf8')
let pass = 0, fail = 0
const eq = (got, want, label) => {
  if (got === want) { pass++; console.log(`  PASS  ${label}`) }
  else {
    fail++; console.log(`  FAIL  ${label}`)
    if (typeof got === 'string' && typeof want === 'string') {
      const g = got.split('\n'), w = want.split('\n')
      for (let i = 0; i < Math.max(g.length, w.length); i++)
        if (g[i] !== w[i]) { console.log(`        first diff at line ${i + 1}:\n          got  ${JSON.stringify(g[i])}\n          want ${JSON.stringify(w[i])}`); break }
    } else console.log(`          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`)
  }
}

// ── owner family: end-to-end render == the owner expected pair ──────────────
// A3.4/SKA-027: the A1 fixtures are held FOR revision by the validator
// (consumes_raw added, AC-a post-D-03). The pair below is the INTERIM
// machinery-generated stand-in at owner @4b8f9bb — it is REPLACED by the
// validator's revised fixtures when they arrive via the operator; the
// byte-regression target moves with them, deliberately and exactly once.
console.log('\n── owner family (interim expected pair, pending validator fixture revision)')
{
  const ctx = { epicKey: 'OA-01', app: 'owner-flutter', specRel: 'docs/specs/OA-01-platform-auth-shell.md', repoId: 'sakal-dev/sakalpos-owner', pin: '4b8f9bb' }
  const spec = parseSpec(read('inputs/owner/OA-01-platform-auth-shell.md'))

  eq(renderEpicDoc(spec, ctx), read('expected/owner/epics/OA-01.md'), 'epics/OA-01.md == owner expected (interim, A3.1 consumes_raw)')

  // The fixture's cites, pre-confirmed (confirmation itself is prepare's git
  // work; the golden suite pins the render contract).
  const cites = new Map([
    ['a', []], ['b', []], ['e', []],
    ['c', [{ kind: 'enforced', path: 'lib/app/middleware/auth_middleware.dart', symbol: 'AuthMiddleware', note: 'redirect guard enforcing auth-state routing' }]],
    ['d', [{ kind: 'enforced', path: 'lib/app/theme/app_theme.dart', symbol: 'AppTheme' }, { kind: 'enforced', path: 'lib/app/core/i18n/app_translations.dart', symbol: 'AppTranslations' }]],
    ['f', [{ kind: 'enforced', path: 'lib/app/data/providers/api_provider.dart', symbol: 'OwnerApiProvider' }]],
  ])
  const st = spec.stories.find(s => s.key === 'OA-01-01')
  eq(renderStoryDoc(st, { ...ctx, journey: 'OA-J1', persona: 'developer', module: 'shell', cites }),
    read('expected/owner/stories/OA-01/OA-01-01.md'), 'stories/OA-01/OA-01-01.md == owner expected (interim, post-D-03 AC-a)')

  // S1 must be quiet on a family the parser fully covers.
  const detected = detectAcLines(read('inputs/owner/OA-01-platform-auth-shell.md'))
  const parsed = new Set(spec.stories.flatMap(s => s.acs.map(a => a.line)))
  eq([...detected.keys()].filter(l => !parsed.has(l)).length, 0, 'S1: owner file — every detected AC-like line is parsed')
  eq(spec.stories.reduce((a, s) => a + s.acs.length, 0), 27, 'owner file parses all 27 ACs')
}

// ── S1 loud-fail: a non-owner family REFUSES, it does not extract wrongly ───
console.log('\n── garage family snapshot (S1 refusal, not silent misextraction)')
{
  const text = read('inputs/garage/GR-05-submit-and-handoff.md')
  const spec = parseSpec(text)
  const detected = detectAcLines(text)
  const parsed = new Set(spec.stories.flatMap(s => s.acs.map(a => a.line)))
  const missed = [...detected.keys()].filter(l => !parsed.has(l))
  eq(missed.length > 0, true, `S1: garage file has AC-like lines the owner family does not parse (${missed.length} detected@lines ${missed.slice(0, 4).join(',')}…) → prepare REFUSES`)
  eq(detected.size > 0, true, 'the garage file is AC-bearing (zero-AC extraction impossible by construction)')
}

// ── S2/S3/S4: capture rules on a family-agnostic miniature ──────────────────
console.log('\n── capture rules (raw marker · empty triple · consumes_raw)')
{
  // Exotic markers are an asbuilt-family capability; under the reference
  // family the same bytes REFUSE (S1) rather than parse — asserted further up.
  const spec = parseSpec([
    '# App · 01 · Title', '',
    '> **Tier:** MVP · **Priority:** P0 · **Story prefix:** `XX-01-`',
    '> **Consumes:** Vehicle entity (net-new backend), Customer/membership (P07/P19)',
    '> **Status:** ✅ Built (client scope)', '',
    '## Stories', '',
    '### XX-01-01 · No triple here',
    'The heading and this paragraph are all the provenance context there is.', '',
    '- [x] AC-1 — Claim one',
    '- [~] AC-2 — Claim two', '',
    '**Priority:** P0 · **Status:** ✅',
  ].join('\n'), FAMILIES.asbuilt)
  const st = spec.stories[0]
  eq(st.acs.map(a => a.marker).join(' '), '[x] [~]', 'S2: markers captured RAW, any variant')
  eq(st.persona, null, 'S3: no triple → nothing fabricated')
  eq(st.context, 'The heading and this paragraph are all the provenance context there is.', 'S3: first paragraph kept as provenance context')
  eq(spec.headerExtrasRaw.join('|'), '**Consumes:** Vehicle entity (net-new backend), Customer/membership (P07/P19)', 'S4: Consumes captured verbatim, key + value')
  eq(spec.statusHeaderRaw, '**Status:** ✅ Built (client scope)', 'S5: status header quoted, never imported')
  const doc = renderStoryDoc(st, { epicKey: 'XX-01', app: 'app', specRel: 'docs/specs/x.md', repoId: 'o/r', pin: 'abc1234', journey: null, persona: '', module: null, cites: new Map() })
  eq(doc.includes('marker: "[x]"') && doc.includes('marker: "[~]"'), true, 'S2: non-default markers emitted as raw fields')
  eq(/---\n\n## Acceptance criteria/.test(doc), true, 'S3: story field EMPTY — no fabricated sentence in the emission')
}

// ═════════════════════════════════════════════════════════════════════════════
// SKA-026 — the D-01 named golden set. INPUTS are snapshots of the real spec
// files (pins recorded below); EXPECTED outputs are authored here for
// validator review (R3: no hand-written trees — machinery-generated, human-
// reviewed). kiosk and kds are family 1 with field renames only — every axis
// they carry is exercised by the stock cases, so they are COVERED BY
// CONSTRUCTION and get no snapshot of their own.
// The 5-header/4-cell defect tables (kiosk/stock/owner READMEs §4) are never
// parsed AT ALL: README files are excluded from discovery and no field is
// ever derived from a table — asserted below.
// ═════════════════════════════════════════════════════════════════════════════
const CASES = [
  { fam: 'reference', app: 'stock-flutter', repo: 'sakal-dev/sakalpos-stock', pin: '8139866', dir: 'stock', files: ['SS-01-platform-auth-shell.md', 'SS-08-serial-imei.md'] },
  { fam: 'greenfield', app: 'agent-flutter', repo: 'sakal-dev/sakalpos-agent', pin: 'bcc0fc1', dir: 'agent', files: ['AG-01-platform-auth-offline-shell.md', 'AG-13-settings-and-hardware.md'] },
  { fam: 'asbuilt', app: 'storefront-flutter', repo: 'sakal-dev/sakalpos-storefront', pin: 'b60b460', dir: 'storefront', files: ['SF-01-platform-auth-onboarding.md', 'SF-07-checkout-address-delivery-payment.md', 'SF-12-notifications.md'] },
  { fam: 'asbuilt', app: 'garage-flutter', repo: 'sakal-dev/garage-flutter', pin: '523e808', dir: 'garage', files: ['GR-07-customer-signoff-and-share-proof.md', 'GR-11-car-care-bay-operations.md', 'GR-12-checkin-resolution-and-holds.md'] },
  // flutter-pos specs live in a git-less directory (Business/) — pin is a
  // placeholder constant; real onboarding is blocked on that repo fact.
  { fam: 'legacyflat', app: 'pos-flutter', repo: 'sakal-dev/pos-flutter', pin: 'fp00000', dir: 'flutter-pos', files: ['01-auth-and-security.md', '05b-store-setup.md', '14-payments-static-qr.md', '38-mode-transition.md'] },
]
const PICKED = ['SS-01-01', 'SS-08-01', 'AG-01-01', 'AG-13-01', 'SF-01-01', 'SF-07-03', 'SF-12-02', 'GR-07-01', 'GR-11-01', 'GR-12-03', 'GR-12-06', 'FP-01-04', 'FP-01-06', 'FP-05B-01', 'FP-14-03']

const epicKeyOf = (fam, file, text) => fam.epicKeyFrom === 'filename'
  ? file.match(/^([A-Za-z]{2,}-\d{2})/)?.[1] ?? null
  : text.match(/\*\*Story prefix:\*\*\s*`?([A-Za-z]{2,}-\d{2}[A-Za-z]?)-`?/)?.[1] ?? null
const renderAll = (c, file, text) => {
  const fam = FAMILIES[c.fam]
  const epicKey = epicKeyOf(fam, file, text)
  const spec = parseSpec(text, fam, { epicKey })
  const ctx = { epicKey, app: c.app, specRel: `docs/specs/${file}`, repoId: c.repo, pin: c.pin }
  const out = new Map([[`epics/${epicKey}.md`, renderEpicDoc(spec, ctx)]])
  for (const st of spec.stories) if (PICKED.includes(st.key))
    out.set(`stories/${epicKey}/${st.key}.md`, renderStoryDoc(st, { ...ctx, journey: null, persona: st.persona != null ? st.persona.split(/\s+/)[0].toLowerCase() : 'operator', module: null, cites: new Map() }))
  return { spec, out, epicKey }
}

console.log('\n── the four families extract to the reviewed expected outputs')
for (const c of CASES) for (const file of c.files) {
  const text = read(`inputs/${c.dir}/${file}`)
  const { spec, out } = renderAll(c, file, text)
  // S1 quiet under the RIGHT family.
  const parsedL = new Set(spec.stories.flatMap(s => s.acs.map(a => a.line)))
  eq([...detectAcLines(text).keys()].filter(l => !parsedL.has(l)).length, 0, `${c.dir}/${file}: S1 quiet under ${c.fam}`)
  for (const [rel, got] of out) eq(got, read(`expected/${c.dir}/${rel}`), `${c.dir}/${rel} == expected (${c.fam})`)
  // Determinism per family: a second parse+render pass is byte-identical.
  const again = renderAll(c, file, text)
  eq([...out.values()].join('\x00') === [...again.out.values()].join('\x00'), true, `${c.dir}/${file}: two passes byte-identical`)
}

console.log('\n── wrong-family forcing REFUSES (S1, veto signal, or underivable key)')
{
  const refuses = (dir, file, famName) => {
    const text = read(`inputs/${dir}/${file}`)
    const fam = FAMILIES[famName]
    if (!fam.filePattern.test(file)) return 'file-pattern'          // not even discovered
    const epicKey = epicKeyOf(fam, file, text)
    if (!epicKey) return 'no-epic-key'
    if (detectFamilySignals(text).some(s => s.family !== famName)) return 'veto'
    const spec = parseSpec(text, fam, { epicKey })
    const parsedL = new Set(spec.stories.flatMap(s => s.acs.map(a => a.line)))
    if ([...detectAcLines(text).keys()].some(l => !parsedL.has(l))) return 'S1'
    return null
  }
  eq(refuses('garage', 'GR-12-checkin-resolution-and-holds.md', 'reference'), 'veto', 'garage GR-12 forced reference → refused (multi-codepoint [🟡] would also S1)')
  eq(refuses('garage', 'GR-07-customer-signoff-and-share-proof.md', 'greenfield'), 'veto', 'garage GR-07 forced greenfield → refused')
  eq(refuses('storefront', 'SF-07-checkout-address-delivery-payment.md', 'reference'), 'veto', 'storefront SF-07 forced reference → refused (wrapped header signal)')
  eq(refuses('agent', 'AG-01-platform-auth-offline-shell.md', 'legacyflat'), 'file-pattern', 'agent AG-01 forced legacyflat → not discoverable (Journeys veto would also fire)')
  eq(refuses('agent', 'AG-01-platform-auth-offline-shell.md', 'asbuilt'), 'veto', 'agent AG-01 forced asbuilt → refused (Journeys signal)')
  eq(refuses('flutter-pos', '01-auth-and-security.md', 'reference'), 'file-pattern', 'flutter-pos 01 forced reference → not even discoverable (no key in filename)')
  eq(refuses('stock', 'SS-08-serial-imei.md', 'legacyflat'), 'file-pattern', 'stock SS-08 forced legacyflat → not discoverable')
  // Grammar-superset directions (reference input under greenfield/asbuilt)
  // parse benignly BY DESIGN — the declared family + veto signals guard that
  // direction; asserted here so the property is a decision, not an accident.
  eq(refuses('stock', 'SS-01-platform-auth-shell.md', 'greenfield'), null, 'reference input under greenfield parses (superset) — declaration + veto guard this direction')
}

console.log('\n── A3.1: proposals/consumes-raw.yaml exists in NO family\'s output (R-5)')
{
  // The consumes slot lives in frontmatter since 0.8.0; the proposals file is
  // superseded in every family. Guard the expected tree (regen regressions)
  // and every rendered path in this suite.
  const { readdirSync: rd } = await import('node:fs')
  const anyFile = d => rd(join(here, d), { withFileTypes: true, recursive: true }).filter(e => e.isFile()).map(e => `${e.parentPath ?? e.path}/${e.name}`)
  eq(anyFile('expected').filter(p => /consumes-raw/.test(p)).length, 0, 'no consumes-raw.yaml anywhere under expected/')
  for (const c of CASES) for (const file of c.files) {
    const { out } = renderAll(c, file, read(`inputs/${c.dir}/${file}`))
    for (const rel of out.keys()) if (/proposals\//.test(rel)) { eq(rel, '(none)', `${c.dir}/${file} rendered a proposals/ path`) }
  }
  pass++; console.log('  PASS  no family render emits a proposals/ path')
}

console.log('\n── never derived from a table; README never scanned')
{
  eq(FAMILIES.reference.filePattern.test('README.md'), false, 'README excluded from discovery (reference)')
  eq(FAMILIES.legacyflat.filePattern.test('README.md'), false, 'README excluded from discovery (legacyflat)')
  const spec = parseSpec(['# X · 01 · T', '', '> **Tier:** MVP · **Priority:** P0 · **Story prefix:** `XX-01-` · **Status:** 🔴', '', '## Catalog', '', '| Epic | Pri | Status | Notes |', '|---|---|---|---|', '| XX-01 | P9 | 🟢 | wrong row |', ''].join('\n'), FAMILIES.reference, { epicKey: 'XX-01' })
  eq(spec.priority, 'P0', 'priority comes from the header, never a table cell')
  eq(spec.sections[0].body.includes('| XX-01 | P9 |'), true, 'tables pass through sections verbatim, unparsed')
}

console.log('\n── raw markers survive as the SNAPSHOT bytes (multi-codepoint emoji)')
{
  const text = read('inputs/garage/GR-12-checkin-resolution-and-holds.md')
  const spec = parseSpec(text, FAMILIES.asbuilt, { epicKey: 'GR-12' })
  const exotic = spec.stories.flatMap(s => s.acs).filter(a => !['[ ]', '[x]', '[X]'].includes(a.marker))
  eq(exotic.map(a => a.marker).join(' '), '[🟡] [🟡]', 'the two [🟡] markers captured with the snapshot\'s own bytes')
  eq(text.includes(exotic[0].marker), true, 'marker bytes are substrings of the input — no NFC/NFD drift, no retyped lookalikes')
}

// ── journeys as a walked tree (SKA-028, A5 ruling B) ────────────────────────
// Input: snapshot of the D-05 spec-home import (sakal-dev/sakalpos @9cf7c6f).
// The record = frontmatter + the VERBATIM `## Journey <X> — …` section:
// steps, per-step epic pointers, Success statement, tiering note in the
// heading — imported text, never rewritten (epic pointers stay `→ *OA-02*`,
// never URIs: P6 governs authored source: fields only).
console.log('\n── journey records (frontmatter + verbatim narrative)')
{
  const text = read('inputs/journeys/owner-app-journeys.md')
  const ctx = { key: 'OA-J1', title: 'The morning glance: know the state of the business in 15 seconds', goal: 'OA-G1', persona: 'owner', sourcePath: 'specs/journeys/owner-app-journeys.md', anchor: 'journey-a' }
  const s = sectionByAnchor(text, 'journey-a')
  eq(s.heading, 'Journey A — The morning glance (MVP)', 'anchor prefix-matches the full heading; tier note rides the heading')
  eq(s.raw.startsWith('## Journey A — The morning glance (MVP)'), true, 'section raw includes its heading')
  eq(/→ \*OA-02\*/.test(s.raw), true, 'per-step epic pointers imported verbatim, never rewritten')
  eq(/\*\*Success:\*\*/.test(s.raw), true, 'Success statement carried')
  eq(s.raw.endsWith('---') || /\n\s*$/.test(s.raw), false, 'trailing rule/blank trimmed — typography, not record')
  eq(renderJourneyDoc({ ...ctx, repoId: 'sakal-dev/sakalpos', pin: '9cf7c6f', body: s.raw }), read('expected/journeys/OA-J1.md'), 'journeys/OA-J1.md == expected (pinned)')
  // The unpinnable spec-home: same record, plain resolvable source — stated,
  // never invented.
  eq(renderJourneyDoc({ ...ctx, repoId: null, pin: null, body: s.raw }).split('\n')[5], 'source: specs/journeys/owner-app-journeys.md#journey-a', 'no git home → resolvable-but-unpinnable source, no invented pin')
  eq(sectionByAnchor(text, 'journey-zz'), null, 'unknown anchor → null, the emitter refuses rather than emit empty')
  // Determinism: two extract+render passes byte-identical.
  eq(renderJourneyDoc({ ...ctx, repoId: 'sakal-dev/sakalpos', pin: '9cf7c6f', body: sectionByAnchor(text, 'journey-a').raw }), renderJourneyDoc({ ...ctx, repoId: 'sakal-dev/sakalpos', pin: '9cf7c6f', body: s.raw }), 'two passes byte-identical')
  // readCollection reads the index grammar the emitter consumes.
  const idx = readCollection('journeys:\n  - OA-J1 — The label\n    goal: OA-G1\n    persona: owner\n    source: specs/x.md#journey-a\n', 'journeys')
  eq(idx.length === 1 && idx[0].key === 'OA-J1' && idx[0].fields.source === 'specs/x.md#journey-a', true, 'index entries parse: key, label, fields')
}

// ── SKA-029: the submit plan names the three new writes; degradation is a
// documented contract, per-field, never all-or-nothing ──────────────────────
console.log('\n── submit-plan writes summary + degradation contract')
{
  const { execFileSync } = await import('node:child_process')
  const { mkdtempSync, mkdirSync: mkd, writeFileSync: wf, rmSync } = await import('node:fs')
  const os = await import('node:os')
  const tmp = mkdtempSync(join(os.tmpdir(), 'sakal-plan-e2e-'))
  const D = join(tmp, '.sakal')
  mkd(join(D, 'stories/XX-01'), { recursive: true }); mkd(join(D, 'epics'), { recursive: true }); mkd(join(D, 'journeys'), { recursive: true })
  wf(join(D, 'config.yaml'), 'format_version: 1\nscope: app\nproject: p\napp: a\ntarget_host: h\napp_profile:\n  setup_cmd: ./tool/setup.sh\n  verify_cmd: ./tool/verify.sh\n')
  wf(join(D, 'stories/XX-01/XX-01-01.md'), '---\nkey: XX-01-01\ntitle: T\nepic: XX-01\npersona: p\napp: a\nmodule: m\nsource: o/r:docs/specs/x.md#a@abc1234\n---\n\nAs a p, I want x, so that y.\n\n## Acceptance criteria\n\n```yaml\n- ac: XX-01-01-a\n  text: "claim"\n  cite: []\n```\n')
  wf(join(D, 'epics/XX-01.md'), '---\nkey: XX-01\ntitle: T\napp: a\nconsumes_raw: **Consumes:** P07\nsource: o/r:docs/specs/x.md@abc1234\n---\n\n## What to build\n\nx\n')
  wf(join(D, 'journeys/XX-J1.md'), '---\nkey: XX-J1\ntitle: T\ngoal: g\npersona: p\nsource: specs/j.md#journey-a\n---\n\n## Journey A — T\n\n1. step\n')
  wf(join(tmp, 'server.json'), JSON.stringify({ project: 'p', apps: ['a'], epics: [], journeys: [], personas: [], modules: [], stories: [] }))
  const out = JSON.parse(execFileSync('node', [join(here, '../../lib/sakal-plan.mjs'), '--dir', D, '--server', join(tmp, 'server.json'), '--json'], { encoding: 'utf8' }))
  eq(JSON.stringify(out.writes), JSON.stringify({ journey_narratives: 1, epic_consumes_raw: 1, epic_narratives: 1, epic_test_strategies: 0, epic_sources: 1, story_sources: 1, app_profile: true }), 'plan JSON names every write family with counts (epic prose included, SKA-032)')

  // P-M1 (SKA-033): the orphan report — server has X; tree does not.
  wf(join(tmp, 'server2.json'), JSON.stringify({ project: 'p', apps: ['a'], epics: ['XX-01', 'XX-99'], journeys: ['XX-J1', 'XX-J9'], personas: [], modules: [], stories: ['spec:a:XX-01-01', 'spec:a:XX-77-01'] }))
  const out2 = JSON.parse(execFileSync('node', [join(here, '../../lib/sakal-plan.mjs'), '--dir', D, '--server', join(tmp, 'server2.json'), '--json'], { encoding: 'utf8' }))
  eq(JSON.stringify(out2.orphans), JSON.stringify({ stories: ['spec:a:XX-77-01'], epics: ['XX-99'], journeys: ['XX-J9'], appShells: [] }), 'orphans per entity kind: stories by app namespace, epics/journeys by project')

  // P-M3/M4/M5 (SKA-033): the baseline receipt and its gates.
  const { spawnSync } = await import('node:child_process')
  const base = a => spawnSync('node', [join(here, '../../lib/sakal-baseline.mjs'), '--dir', D, ...a], { encoding: 'utf8' })
  eq(base(['--check']).status, 0, 'no baseline → first submit, nothing refuses')
  eq(base(['--write']).status, 0, 'baseline written after a green submit')
  const b1 = readFileSync(join(D, '.baseline.json'), 'utf8')
  base(['--write'])
  eq(readFileSync(join(D, '.baseline.json'), 'utf8') === b1, true, 'baseline serialization is byte-deterministic')
  eq(base(['--check']).status, 0, 'unchanged tree → gates stand down')
  const storyPath = join(D, 'stories/XX-01/XX-01-01.md')
  const orig = readFileSync(storyPath, 'utf8')
  wf(storyPath, orig.replace('text: "claim"', 'text: "claim, reworded"'))
  const a1 = base(['--check'])
  eq(a1.status === 0 && /scenario A/.test(a1.stdout), true, 'text-only edit under a stable id flows freely (scenario A)')
  wf(storyPath, orig.replace('- ac: XX-01-01-a\n  text: "claim"\n  cite: []', '- ac: XX-01-01-a\n  text: "claim"\n  cite: []\n- ac: XX-01-01-b\n  text: "new claim"\n  cite: []'))
  const d1 = base(['--check'])
  eq(d1.status === 1 && /REFUSED — the AC set changed/.test(d1.stdout), true, 'AC-set change REFUSES with the renumber diff (P-M3)')
  eq(base(['--check', '--confirm-ac-changes']).status, 0, '--confirm-ac-changes proceeds (operator call, diff recorded)')
  wf(join(tmp, 'srv3.json'), JSON.stringify({ records: { stories: { 'XX-01-01': { fields: { title: 'edited in-app' } } } } }))
  const t1 = base(['--check', '--server', join(tmp, 'srv3.json'), '--confirm-ac-changes'])
  eq(t1.status === 1 && /server "edited in-app" ≠ baseline "T"/.test(t1.stdout), true, 'three-way REFUSES naming field + both values (P-M5)')
  wf(storyPath, orig.replace('  cite:\n', '  cite:\n').replace(`    - kind: enforced\n      path: lib/x.dart\n      symbol: Foo\n      sha: abc1234\n`, ''))
  // (the synthetic story has no cites — vanished-cite flagging is covered by
  // the CLI demo corpus; asserting the corrupt-receipt path instead:)
  wf(join(D, '.baseline.json'), 'not json{')
  const c1 = base(['--check'])
  eq(c1.status === 1 && /receipt is corrupt/.test(c1.stderr + c1.stdout), true, 'corrupt baseline states itself and offers --rebaseline')
  eq(base(['--rebaseline']).status, 0, '--rebaseline recovers, showing the full new receipt')

  // ── SKA-034: permanent P-M3 · P-M6(i) · acked receipts · submit-log ──
  wf(storyPath, orig.replace('text: "claim"', 'text: "the gate refuses a cashier-only login"'))
  base(['--rebaseline'])
  // exact-content letter shift converges silently under confirm
  wf(storyPath, readFileSync(storyPath, 'utf8').replace('- ac: XX-01-01-a\n  text: "the gate refuses a cashier-only login"', '- ac: XX-01-01-b\n  text: "the gate refuses a cashier-only login"'))
  const conv = base(['--check', '--confirm-ac-changes'])
  eq(conv.status === 0 && /row XX-01-01-a → address XX-01-01-b \(text unchanged\)/.test(conv.stdout), true, 'P-M3: exact content match converges — row keeps uuid, letter recomputes')
  // near-match refuses with ranked suggestions; --map proceeds; =new forces a row
  wf(storyPath, readFileSync(storyPath, 'utf8').replace('the gate refuses a cashier-only login', 'the gate refuses a cashier-only login and clears state'))
  const near = base(['--check', '--confirm-ac-changes'])
  eq(near.status === 1 && /resembles receipt row XX-01-01-a at \d+%/.test(near.stdout) && /--map XX-01-01-b=XX-01-01-a/.test(near.stdout), true, 'P-M3: near-match refuses with ranked suggestions — thresholds rank, never decide')
  eq(base(['--check', '--confirm-ac-changes', '--map', 'XX-01-01-b=XX-01-01-a']).status, 0, 'operator --map resolves the ambiguity')
  eq(base(['--check', '--confirm-ac-changes', '--map', 'XX-01-01-b=new']).status, 0, '--map =new forces a fresh row instead')
  // retext under evidence refuses bare, surfaces under confirm
  base(['--rebaseline'])
  wf(storyPath, readFileSync(storyPath, 'utf8')
    .replace('  cite: []\n```', '  cite:\n    - kind: enforced\n      path: lib/x.dart\n      symbol: Gate\n      sha: abc1234\n```'))
  base(['--rebaseline'])
  wf(storyPath, readFileSync(storyPath, 'utf8').replace('and clears state', 'and clears ALL state'))
  const rt = base(['--check'])
  eq(rt.status === 1 && /re-texting under evidence/.test(rt.stdout) && /predating SKM-040/.test(rt.stdout), true, 'P-M6(i): re-text under evidence refuses, naming the SKM-040 degradation')
  eq(base(['--check', '--confirm-ac-changes']).status, 0, 'P-M6(i): confirm surfaces and proceeds')
  // per-write acks: only acked records land; bogus acks refuse
  rmSync(join(D, '.baseline.json'))
  const ack1 = base(['--write', '--ack', 'stories/XX-01-01', '--map', 'XX-01-01-b=XX-01-01-a', '--ts', '2026-07-30T12:00:00Z'])
  eq(ack1.status, 0, 'per-write ack lands the record in the receipt')
  const receipt = JSON.parse(readFileSync(join(D, '.baseline.json'), 'utf8'))
  eq(Object.keys(receipt.stories).join(','), 'XX-01-01', 'receipt holds exactly the acked record')
  eq(JSON.stringify(receipt.mappings), JSON.stringify({ 'XX-01-01': ['XX-01-01-b<=XX-01-01-a'] }), 'the confirmed mapping is recorded in the committed receipt')
  eq(base(['--write', '--ack', 'stories/NOPE-01']).status, 1, 'an ack must name what was actually sent — bogus acks refuse')
  // submit-log: append-only, terse, deterministic given --ts
  const log1 = readFileSync(join(D, 'submit-log.md'), 'utf8')
  eq(/## 2026-07-30T12:00:00Z\n- stories 1 acked: XX-01-01\n- mappings confirmed: XX-01-01-b=XX-01-01-a/.test(log1), true, 'submit-log entry: one line per write family + mappings, timestamped')
  // ── SKA-035: identity is read or refused, never inherited ──
  const idcli = (dir, srv, extra = []) => spawnSync('node', [join(here, '../../lib/sakal-identity.mjs'), '--dir', dir, '--server', srv, '--repo-root', tmp, ...extra], { encoding: 'utf8' })
  const srvFile = (name, o) => { const p = join(tmp, name); wf(p, JSON.stringify(o)); return p }
  const APP = { key: 'my-app', github_repo: 'org/my-repo' }
  wf(join(D, 'config.yaml'), 'format_version: 1\nscope: app\nproject: p\napp: my-app\ntarget_host: https://h.example\n')
  execFileSync('git', ['-C', tmp, 'init', '-q'])
  execFileSync('git', ['-C', tmp, 'remote', 'add', 'origin', 'https://github.com/org/my-repo.git'])
  const okSrv = srvFile('id-ok.json', { host: 'https://h.example', project: 'p', apps: [APP] })
  const r1 = idcli(D, okSrv)
  eq(r1.status === 0 && /matched by key\+repo: my-app/.test(r1.stdout), true, 'F-5: both axes match → converge, naming the axis')
  const r2 = idcli(D, srvFile('id-host.json', { host: 'https://other.example', project: 'p', apps: [APP] }))
  eq(r2.status === 1 && /HOST MISMATCH/.test(r2.stdout) && /SPLIT THE BRAIN/.test(r2.stdout), true, 'F-3: host mismatch REFUSES naming both values and the risk')
  const r3 = idcli(D, srvFile('id-conflict.json', { host: 'https://h.example', project: 'p', apps: [{ key: 'my-app', github_repo: 'org/elsewhere' }, { key: 'other', github_repo: 'org/my-repo' }] }))
  eq(r3.status === 1 && /APP IDENTITY CONFLICT/.test(r3.stdout), true, 'F-5: key→A vs repo→B CONFLICT refuses with both, never picks')
  const r4 = idcli(D, srvFile('id-drift.json', { host: 'https://h.example', project: 'p', apps: [{ key: 'my-app', github_repo: 'org/moved' }] }))
  eq(r4.status === 1 && /ORIGIN DRIFT/.test(r4.stdout), true, 'F-5: origin drift refuses — origin never wins by default')
  const r5 = idcli(D, srvFile('id-none.json', { host: 'https://h.example', project: 'p', apps: [{ key: 'someone-else', github_repo: 'org/nope' }] }))
  eq(r5.status === 1 && /Creation is NEVER silent/.test(r5.stdout) && /SURFACE NAMES/.test(r5.stdout), true, 'F-5: no match → show-and-ask creation, keys are surface names')
  const r6 = idcli(D, srvFile('id-repoaxis.json', { host: 'https://h.example', project: 'p', apps: [{ key: 'org/my-repo', github_repo: 'org/my-repo' }] }))
  eq(r6.status === 1 && /REPO axis/.test(r6.stdout), true, 'F-5: repo-axis-only match converges onto that row (the garage shell case), asking first')
  wf(join(D, 'config.yaml'), 'format_version: 1\nscope: app\nproject: FILL-AT-SUBMIT\napp: my-app\ntarget_host: FILL-AT-SUBMIT\n')
  const r7 = idcli(D, okSrv)
  eq(r7.status === 1 && /NEVER inherited/.test(r7.stdout) && /cannot ask/.test(r7.stdout), true, 'F-3: FILL-AT-SUBMIT + connection = show-and-ask; non-interactive hands over the command')
  eq(idcli(D, okSrv, ['--adopt']).status, 0, '--adopt records the operator answer')
  eq(/target_host: https:\/\/h\.example/.test(readFileSync(join(D, 'config.yaml'), 'utf8')), true, 'identity persisted into config.yaml on first success (F-3a)')
  eq(idcli(D, okSrv).status, 0, 'thereafter it stands down — and a different host would now refuse')
  // F-4: an UNREAD set never blocks; an app shell shows in the orphan report.
  const p4 = JSON.parse(execFileSync('node', [join(here, '../../lib/sakal-plan.mjs'), '--dir', D, '--server', srvFile('id-f4.json', { host: 'https://h.example', project: 'p', apps: [APP, { key: 'org/legacy-shell', github_repo: 'org/legacy-shell' }], stories: [] }), '--json'], { encoding: 'utf8' }))
  eq(p4.blocked.length, 0, 'F-4: unread epics/journeys/personas/modules block nothing — an unread set is not an empty server')
  eq(p4.orphans.appShells.join(','), 'org/legacy-shell', 'F-5c: repo-name app shells surface in the orphan report')

  base(['--log', 'refusal: three-way (test)', '--ts', '2026-07-30T12:01:00Z'])
  const log2 = readFileSync(join(D, 'submit-log.md'), 'utf8')
  eq(log2.startsWith(log1), true, 'the log is append-only')
  eq(/## 2026-07-30T12:01:00Z\n- refusal: three-way \(test\)/.test(log2), true, 'refusals are recordable, deterministic given --ts')
  rmSync(tmp, { recursive: true, force: true })

  // SKA-032 (R-6): the epic-prose extractor — ONE shared sectionByAnchor
  // underneath, record mode and --source mode, gaps as data.
  const rec = p => JSON.parse(execFileSync('node', [join(here, '../../lib/sakal-record.mjs'), p, '--json'], { encoding: 'utf8' }))
  const src = p => JSON.parse(execFileSync('node', [join(here, '../../lib/sakal-record.mjs'), p, '--source', '--json'], { encoding: 'utf8' }))
  const gr11 = rec(join(here, 'expected/garage/epics/GR-11.md'))
  eq(gr11.tier, 'MVP (car care)', 'record: tier verbatim, qualifier included')
  eq(gr11.consumes_raw?.startsWith('**Consumes:**'), true, 'record: consumes_raw verbatim, ** markers included')
  eq(gr11.narrative != null && !/^## /.test(gr11.narrative), true, 'record: narrative is the What-to-build BODY, heading stripped')
  eq(gr11.test_strategy != null, true, 'record: test strategy extracted')
  eq(gr11.gaps.length, 0, 'record: full GR-11 has no gaps')
  const ss01 = src(join(here, 'inputs/stock/SS-01-platform-auth-shell.md'))
  eq(ss01.tier === 'MVP' && ss01.narrative != null && ss01.test_strategy != null && ss01.consumes_raw?.startsWith('**Consumes:**'), true, '--source: a raw spec doc yields all four fields')
  const fp38 = src(join(here, 'inputs/flutter-pos/38-mode-transition.md'))
  eq(fp38.gaps.length > 0, true, `--source: a section-less variant reports gaps as data (${fp38.gaps.length} named), sends what exists`)
  eq(rec(join(here, 'expected/flutter-pos/epics/FP-38.md')).tier, null, 'record: flutter-pos has no Tier — null, never invented')

  const submitDoc = read('../../commands/sakal-submit.md').replace(/\s+/g, ' ')
  eq(submitDoc.includes('sakal_update_app_profile'), true, 'profile writes through sakal_update_app_profile (035), not sakal_update_app')
  eq(submitDoc.includes('narrative held back; server predates SKM-035'), true, 'narrative degradation message, verbatim')
  eq(submitDoc.includes('profile held back; server predates SKM-035'), true, 'profile degradation message, verbatim')
  eq(submitDoc.includes('source held back; server predates SKM-036'), true, 'source degradation message, verbatim')
  eq(submitDoc.includes('degrades INDEPENDENTLY, never all-or-nothing'), true, 'partial landing is per-field, named, never all-or-nothing')
}

console.log(`\n${fail ? 'FAILED' : 'OK'} — ${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
