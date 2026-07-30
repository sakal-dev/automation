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

console.log(`\n${fail ? 'FAILED' : 'OK'} — ${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
