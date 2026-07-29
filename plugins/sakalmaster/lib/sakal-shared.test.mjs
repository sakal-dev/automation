#!/usr/bin/env node
// Tests for the two functions the writer and checker must agree on (SKA-024).
// The fixtures are the exact characters that produced 99 self-inflicted errors.
import { slug, stripInlineComment, unquote } from './sakal-shared.mjs'
let pass = 0, fail = 0
const eq = (got, want, label) => {
  if (got === want) { pass++; console.log(`  PASS  ${label}\n          → ${JSON.stringify(got)}`) }
  else { fail++; console.log(`  FAIL  ${label}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`) }
}

console.log('\n── slug(): GitHub semantics; dropped chars VANISH, they do not separate')
// The heading that broke it, verbatim from owner-flutter's specs.
eq(slug("OA-02-01 · Today's headline numbers"), 'oa-02-01--todays-headline-numbers', "middot + apostrophe (the real one)")
eq(slug('OA-01 · Overview'), 'oa-01--overview', 'middot leaves a double hyphen')
eq(slug("Today's numbers"), 'todays-numbers', 'apostrophe vanishes, no separator')
eq(slug('A  doubled  space'), 'a--doubled--space', 'doubled spaces survive as doubled hyphens')
eq(slug('Dash – en and — em'), 'dash--en-and--em', 'unicode dashes vanish')
eq(slug('  leading and trailing  '), 'leading-and-trailing', 'trimmed')
eq(slug('Heading\r'), 'heading', 'CRLF tolerated')
eq(slug('2026 plans'), '2026-plans', 'leading numbers kept')
eq(slug('Ürün · fiyat'), 'ürün--fiyat', 'unicode letters kept')

console.log('\n── slug() is IDEMPOTENT — this is what lets old anchors still match')
const once = slug("OA-02-01 · Today's headline numbers")
eq(slug(once), once, 'slugging a slug changes nothing')

console.log('\n── stripInlineComment(): the bug that made a value never equal anything')
eq(stripInlineComment('owner-flutter               # this repo — sakal-dev/sakalpos-owner'), 'owner-flutter', 'the real config line')
eq(stripInlineComment('sakalpos                # declared from repo context'), 'sakalpos', 'trailing comment removed')
eq(stripInlineComment('"Bar # Grill"'), '"Bar # Grill"', 'a # INSIDE quotes survives')
eq(stripInlineComment("'Bar # Grill'"), "'Bar # Grill'", 'single quotes too')
eq(stripInlineComment('"Bar # Grill"   # but this one goes'), '"Bar # Grill"', 'quoted # kept, real comment stripped')
eq(stripInlineComment('a#b'), 'a#b', 'no whitespace before # → not a comment')
eq(stripInlineComment('value   \r'), 'value', 'CRLF and trailing space')
eq(unquote('"Bar # Grill"'), 'Bar # Grill', 'unquote after stripping')

console.log(`\n${fail ? 'FAILED' : 'OK'} — ${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
