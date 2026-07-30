#!/usr/bin/env node
// =============================================================================
// sakal-record — the epic-prose fields, extracted by code (SKA-032, R-6).
//
// Production's first three epics landed THIN because no cut ever mapped the
// epic prose at submit. This CLI is the mapping's mechanical half: given an
// epic RECORD (`.sakal/epics/<KEY>.md`) or a raw SPEC DOC (`--source`), it
// returns the four fields `create_epic`/`update_epic` accept since SKM-035:
//
//   tier            frontmatter `tier:` (record) · header **Tier:** (doc)
//   consumes_raw    VERBATIM, ** markers included (A3.1)
//   narrative       the "What to build" section BODY (heading stripped — the
//                   field name already says what it is)
//   test_strategy   "Test strategy", or "How this epic proves itself"
//
// Extraction uses the ONE shared sectionByAnchor/parseSpec — no second
// extractor, per SKA-024 doctrine. Missing pieces are DATA, not errors: they
// land in `gaps` so submit sends what exists and reports the rest
// (flutter-pos has section-less variants; a catalog README source may yield
// prose gaps — named, never invented).
//
//   node sakal-record.mjs <file> [--source] [--json]
//
// Exit: 0 with the fields (some possibly null) · 2 bad invocation.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs'
import { parseSpec, sectionByAnchor, consumesOf, readScalars, FAMILIES } from './sakal-shared.mjs'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const SOURCE = args.includes('--source')
const JSON_OUT = args.includes('--json')
if (!file || !existsSync(file)) { console.error('usage: sakal-record.mjs <epic-record.md | spec-doc.md --source> [--json]'); process.exit(2) }
const text = readFileSync(file, 'utf8')

const stripHeading = s => s == null ? null : s.raw.replace(/^##[^\n]*\n+/, '').trim() || null
const out = { file, key: null, tier: null, consumes_raw: null, narrative: null, test_strategy: null, gaps: [] }

if (SOURCE) {
  // A raw spec document: header fields + sections, family-independent (the
  // section and header grammar is shared across all four families).
  const spec = parseSpec(text, FAMILIES.reference)
  out.tier = spec.tier
  out.consumes_raw = consumesOf(spec.headerExtrasRaw) || null
  // Heading VARIANTS are matched (decorated "Test strategy (current
  // coverage)", morphological "Testing strategy") — different SECTIONS are
  // not: a "Why this exists" is not a What-to-build, and mapping it would be
  // invention, not extraction. Absence stays a reported gap.
  const wtb = spec.sections.find(s => /^what to build\b/i.test(s.heading.trim()))
  out.narrative = wtb ? (wtb.body.trim() || null) : null
  const ts = spec.sections.find(s => /^(test(ing)? strategy\b|how this epic proves itself\b)/i.test(s.heading.trim()))
  out.test_strategy = ts ? (ts.body.trim() || null) : null
} else {
  // An epic record: frontmatter + verbatim imported sections.
  const lines = text.split('\n')
  if (lines[0]?.trim() !== '---') { console.error(`${file}: not a front-matter record (use --source for a raw spec doc)`); process.exit(2) }
  const end = lines.indexOf('---', 1)
  const fm = readScalars(lines.slice(1, end).join('\n'))
  const body = lines.slice(end + 1).join('\n')
  out.key = fm.key?.value ?? null
  out.tier = fm.tier?.value ?? null
  out.consumes_raw = fm.consumes_raw?.value ?? null
  out.narrative = stripHeading(sectionByAnchor(body, 'what-to-build'))
  out.test_strategy = stripHeading(sectionByAnchor(body, 'test-strategy') ?? sectionByAnchor(body, 'testing-strategy') ?? sectionByAnchor(body, 'how-this-epic-proves-itself'))
}

for (const k of ['tier', 'consumes_raw', 'narrative', 'test_strategy'])
  if (out[k] == null) out.gaps.push(`${k}: not in the ${SOURCE ? 'spec doc' : 'record'} — send what exists, report this gap; never invent`)

if (JSON_OUT) console.log(JSON.stringify(out, null, 2))
else {
  console.log(`\n  ${file}${out.key ? ` · ${out.key}` : ''}`)
  for (const k of ['tier', 'consumes_raw']) console.log(`  ${k}: ${out[k] ?? '(gap)'}`)
  for (const k of ['narrative', 'test_strategy']) console.log(`  ${k}: ${out[k] ? `${out[k].split('\n').length} line(s)` : '(gap)'}`)
  for (const g of out.gaps) console.log(`  gap — ${g}`)
}
