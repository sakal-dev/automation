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
import { parseSpec, detectAcLines, renderEpicDoc, renderStoryDoc } from '../../lib/sakal-shared.mjs'

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

// ── owner family: end-to-end render == the Addendum A1 fixtures ─────────────
console.log('\n── owner family (fixtures byte-for-byte)')
{
  const ctx = { epicKey: 'OA-01', app: 'owner-flutter', specRel: 'docs/specs/OA-01-platform-auth-shell.md', repoId: 'sakal-dev/sakalpos-owner', pin: '1e272bc' }
  const spec = parseSpec(read('inputs/owner/OA-01-platform-auth-shell.md'))

  eq(renderEpicDoc(spec, ctx), read('expected/owner/epics/OA-01.md'), 'epics/OA-01.md == fixture 1')

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
    read('expected/owner/stories/OA-01/OA-01-01.md'), 'stories/OA-01/OA-01-01.md == fixture 2')

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
  ].join('\n'))
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

console.log(`\n${fail ? 'FAILED' : 'OK'} — ${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
