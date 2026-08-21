#!/usr/bin/env node
// Tests for the functions the writer and checker must agree on (SKA-024), plus
// the SKA-025 emission contract. The fixtures are the exact characters that
// produced 99 self-inflicted errors — and, for SKA-025, the exact bytes of the
// Addendum A1 acceptance fixtures.
import {
  slug, stripInlineComment, unquote, parseSourceURI, normWS, yamlQuote,
  yamlUnquote, wrap, acLetter, parseSpec, findDeclaration, findTestLabel,
  expandConventionIncludes, denylistFromRules, consumesOf,
  configKeyPaths, findConfigKey, findRouteName, findEnumCase, measureCount,
  parseTreePath,
} from './sakal-shared.mjs'
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

console.log('\n── parseSourceURI(): @sha binds tighter than #anchor')
{
  const u = parseSourceURI('sakal-dev/sakalpos-owner:docs/specs/OA-01-platform-auth-shell.md#oa-01-01--app-bootstrap-and-architecture-skeleton@1e272bc')
  eq(u.repo, 'sakal-dev/sakalpos-owner', 'repo half')
  eq(u.path, 'docs/specs/OA-01-platform-auth-shell.md', 'path half')
  eq(u.anchor, 'oa-01-01--app-bootstrap-and-architecture-skeleton', 'anchor half')
  eq(u.sha, '1e272bc', 'sha half')
  const p = parseSourceURI('docs/specs/GR-11.md#gr-11-01')
  eq(p.repo, null, 'plain path has no repo')
  eq(p.sha, null, 'plain path has no sha')
  eq(parseSourceURI('sakal-dev/sakalpos-owner:docs/specs/OA-01-platform-auth-shell.md@1e272bc').anchor, null, 'epic source: sha, no anchor')
}

console.log('\n── yamlQuote()/yamlUnquote() invert each other EXACTLY')
{
  const acB = 'Dependencies: `get`, `dio` (or GetConnect), `firebase_messaging` + `firebase_core`, `flutter_secure_storage`, `local_auth`, `get_storage`, `intl`, a charts lib (`fl_chart`); **no Drift**'
  eq(yamlUnquote(yamlQuote(acB)), acB, 'fixture AC-b round-trips')
  eq(yamlUnquote(yamlQuote('a "quoted" \\ backslash')), 'a "quoted" \\ backslash', 'quotes and backslashes round-trip')
  eq(yamlQuote('say "hi"'), '"say \\"hi\\""', 'inner quotes escaped')
}

console.log('\n── wrap(): the fixture sentence, byte for byte')
{
  const s = "As a developer, I want the app scaffolded online-first to the shared conventions, so that it's consistent with pos-flutter but doesn't drag in the offline engine."
  eq(wrap(s), "As a developer, I want the app scaffolded online-first to the shared\nconventions, so that it's consistent with pos-flutter but doesn't drag in the\noffline engine.", 'fixture 2 story sentence')
  eq(acLetter(0), 'a', 'letter a'); eq(acLetter(5), 'f', 'letter f')
}

console.log('\n── parseSpec(): header, sections, stories, ACs — the ONE spec parser')
{
  const spec = parseSpec([
    '# Owner App · 01 · Platform, Auth & Shell', '',
    '> **Tier:** MVP · **Priority:** P0 · **Story prefix:** `OA-01-`',
    '> **Status:** 🔴 Planned', '',
    '## What to build', '', 'The frame.', '',
    '## Stories', '',
    '### OA-01-01 · App bootstrap and architecture skeleton',
    '**As a** developer',
    '**I want** the app scaffolded',
    '**So that** it works', '',
    '**Acceptance criteria**',
    '- [ ] AC-1 — First claim',
    '- [ ] AC-2 — Second claim', '',
    '**Priority:** P0 · **Status:** 🔴', '', '---', '',
    '## Dependencies', '', '- **Backend** — things',
  ].join('\n'))
  eq(spec.title, 'Platform, Auth & Shell', 'H1 → epic title (numbered segments stripped)')
  eq(spec.tier, 'MVP', 'tier from the blockquote')
  eq(spec.priority, 'P0', 'priority from the blockquote')
  eq(spec.statusHeaderSeen, true, 'status header seen — and NEVER imported')
  eq(spec.sections.map(s => s.heading).join('|'), 'What to build|Dependencies', 'sections minus Stories, in order')
  eq(spec.sections[0].body, 'The frame.', 'section body verbatim, trimmed')
  eq(spec.stories.length, 1, 'one story')
  const st = spec.stories[0]
  eq(st.key, 'OA-01-01', 'story key')
  eq(st.anchor, 'oa-01-01--app-bootstrap-and-architecture-skeleton', 'anchor = slug of full heading')
  eq(st.article, 'a', 'article'); eq(st.persona, 'developer', 'persona noun')
  eq(st.acs.map(a => a.text).join('|'), 'First claim|Second claim', 'AC texts, spec order')
  eq(st.priority, 'P0', 'story priority (status ignored)')
}

console.log('\n── findDeclaration()/findTestLabel(): honest, never clever')
{
  const dart = "import 'x';\nclass AuthMiddleware extends GetMiddleware {\n  final int x = 1;\n}\nreturn OwnerApiProvider(x);\n"
  eq(findDeclaration(dart, 'AuthMiddleware') > 0, true, 'class declaration found')
  eq(findDeclaration(dart, 'OwnerApiProvider'), 0, 'a call site after `return` is NOT a declaration')
  eq(findDeclaration(dart, 'Missing'), 0, 'absent symbol refused')
  const test = "group('roles', () {\n  test('cashier-only account is refused', () {});\n});\n"
  eq(findTestLabel(test, 'cashier-only account is refused') > 0, true, 'exact innermost test label found')
  eq(findTestLabel(test, 'roles'), 0, 'a group label can never match')
  eq(findTestLabel(test, 'cashier-only account'), 0, 'prefix of a label is not the label')
}

console.log('\n── normWS(): the ONLY forgiveness fidelity grants')
eq(normWS('  a\n b\tc  '), 'a b c', 'runs collapse, edges trim')

console.log('\n── B2: @-include expansion — explicit, deterministic, cycle-safe')
{
  const fs = {
    'CLAUDE.md': 'intro\n@docs/RULES.md\nmore\n@docs/CHANGELOG-RECENT.md\n',
    'docs/RULES.md': '# rules\n@CLAUDE.md\n',   // cycle
    'docs/CHANGELOG-RECENT.md': 'log',
    'docs/ARCHITECTURE.md': 'arch',
  }
  const r = expandConventionIncludes(p => fs[p] ?? null, ['CLAUDE.md', 'docs/ARCHITECTURE.md'])
  eq(r.files.join(', '), 'CLAUDE.md, docs/RULES.md, docs/CHANGELOG-RECENT.md, docs/ARCHITECTURE.md', 'each file before its includes; cycle does not loop; first-seen wins')
  eq(r.missing.length, 0, 'nothing missing')
  eq(expandConventionIncludes(p => fs[p] ?? null, ['nope.md']).missing.join(','), 'nope.md', 'a file absent from the record is reported, not silently kept')
}

console.log('\n── B3: denylist derived from the RULES denylist section, verbatim')
{
  const rules = [
    '## 4. Scope & safety', 'stuff with `not-this`', '',
    '## 5. Hard path denylist (structural, not a judgment call)', '',
    'Never create, modify, or delete: `.github/**`, `tool/**`, any Gradle file',
    '(`**/*.gradle`, `**/*.gradle.kts`, `gradle/**`, `**/gradle-wrapper.*`), any',
    'keystore/signing material (`**/*.keystore`, `**/*.jks`, `**/key.properties`),',
    'or `.env*`. If an issue needs any of these, escalate per §2.', '',
    '## 6. Issue process rules', '`also-not-this`',
  ].join('\n')
  eq(denylistFromRules(rules).join(' '), '.github/** tool/** **/*.gradle **/*.gradle.kts gradle/** **/gradle-wrapper.* **/*.keystore **/*.jks **/key.properties .env*', 'the owner §5 shape: every backticked glob, in order, section-bounded')
  eq(denylistFromRules('# no denylist section\n`x`').length, 0, 'no denylist heading → nothing derived')
}

console.log('\n── A3.1: the consumes slot, filtered and joined verbatim')
{
  const extras = ['**Consumes:** GR-02 (vehicle), P07', '**Implementation synced:** 2026-07-21 · Legend: ✅', '**Journeys:** 1, 14']
  eq(consumesOf(extras), '**Consumes:** GR-02 (vehicle), P07 · **Journeys:** 1, 14', 'slot keys carried, audit metadata excluded')
  eq(consumesOf(['**Last updated:** 2026-06-11']), '', 'non-slot extras yield nothing')
}

// ── 0.18 (F1/A13): the matcher edge cases the CLI fixtures cannot reach ─────
console.log('\n── configKeyPaths(): real key PATHS, not leaf names anywhere in the file')
{
  const cfg = [
    '<?php', '// a comment with a stray [ bracket', 'return [',
    "    'tax' => [", "        'enabled' => env('ORDER_TAX', true),", "        'rate' => 0.1,", '    ],',
    "    'printer' => array('enabled' => false),", "    'max_devices' => 5,", '];',
  ].join('\n')
  eq([...configKeyPaths(cfg).keys()].join(','), 'tax,tax.enabled,tax.rate,printer,printer.enabled,max_devices',
    'nested [] and array() both descend; env() does not')
  eq(findConfigKey(cfg, 'order.tax.enabled', 'config/order.php').line, 5, "Laravel's file-name segment is trimmed when the cite carries it")
  eq(findConfigKey(cfg, 'tax.enabled', 'config/order.php').line, 5, 'and not required')
  eq(findConfigKey(cfg, 'enabled', 'config/order.php').line, 0, 'a bare leaf name is NOT a key path — this is the whole point')
  eq(findConfigKey(cfg, 'tax.enabled.deeper', 'config/order.php').line, 0, 'and neither is a path past a scalar')
}

console.log('\n── findRouteName(): exact, composed, and refused')
{
  const routes = [
    "Route::prefix('api')->name('api.')->group(function () {",
    "    Route::name('v1.')->group(function () {",
    "        Route::get('/o', 'C@i')->name('orders.index');",
    '    });', '});',
    "Route::get('/p', 'H@p')->name('health.ping');",
  ].join('\n')
  eq(findRouteName(routes, 'health.ping').composed, undefined, 'an exact literal is not a composition')
  eq(findRouteName(routes, 'api.v1.orders.index').parts.join('+'), 'api.+v1.+orders.index', 'group prefixes compose in order')
  eq(findRouteName(routes, 'api.v1.orders.destroy').line, 0, 'a leaf nobody declared does not compose')
  eq(findRouteName(routes, 'v1.orders.index').composed, true, 'a partial composition is still a composition — reported, never silently exact')
  eq(findRouteName("Route::get('/x', 'C@i');", 'anything').known.length, 0, 'a file with no name() literals says so')
}

console.log('\n── findEnumCase(): PHP cases, Dart members, and the type guard')
{
  const php = "enum SubscriptionStatus: string {\n    case Grace = 'grace';\n    case Active;\n}"
  eq(findEnumCase(php, 'SubscriptionStatus::Grace').line, 2, 'a backed case')
  eq(findEnumCase(php, 'SubscriptionStatus::Active').line, 3, 'a pure case')
  eq(findEnumCase(php, 'OtherEnum::Grace').line, 0, 'the type half is checked, not decoration')
  eq(findEnumCase('enum PayMode { cash, khqr, card }', 'PayMode::khqr').line, 1, 'a Dart enum member')
  eq(findEnumCase('enum PayMode { cash, khqr }', 'PayMode::crypto').line, 0, 'a member that is not there')
  eq(findEnumCase("switch (x) {\n    case Grace:\n}", 'Grace').line, 0, 'a switch arm (`case X:`) is NOT an enum case — the colon is what separates them')
  eq(findEnumCase("enum S {\n    case Grace; // the dunning window\n}", 'Grace').line, 2, 'a trailing comment does not hide a case')
}

console.log('\n── measureCount(): counts, and refuses a pattern it cannot compile')
{
  eq(measureCount(['case A;', 'case B;', 'other'], '^\\s*case ').n, 2, 'lines matching')
  eq(measureCount(['a.php', 'b.md'], '\\.php$').n, 1, 'entries matching')
  eq(!!measureCount(['x'], '([').error, true, 'a broken regex is an error, never a silent zero')
}

console.log('\n── findTestLabel(): PHPUnit methods, and the annotation that must be ATTACHED')
{
  const php = ['class T {', '    public function test_a(): void {}', '    #[Test]', '    public function b(): void {}', '    public function helper(): void {}', '}'].join('\n')
  eq(findTestLabel(php, 'test_a'), 2, 'a test_* method is a label')
  eq(findTestLabel(php, 'b'), 4, 'an #[Test]-annotated method is a label')
  eq(findTestLabel(php, 'helper'), 0, 'the PREVIOUS method\'s #[Test] does not bless the next one')
  eq(findTestLabel("it('does a thing', function () {", 'does a thing'), 1, 'Pest labels still match, unchanged')
  eq(findTestLabel("group('a group', () {", 'a group'), 0, 'group() still never matches')
}

console.log('\n── parseTreePath(): only a bare key + colon is cross-repo')
{
  eq(parseTreePath('order-module:app/X.php').tree, 'order-module', 'a tree-qualified path')
  eq(parseTreePath('app/Http/Controllers/X.php'), null, 'a plain path is not')
  eq(parseTreePath('../POS/app/X.php'), null, 'and neither is a relative sibling path — 0.17.0 trees keep their meaning')
}

console.log(`\n${fail ? 'FAILED' : 'OK'} — ${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
