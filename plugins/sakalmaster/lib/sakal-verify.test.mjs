#!/usr/bin/env node
// =============================================================================
// Tests for sakal-verify.mjs itself. It runs as a CLI, not a library of
// exported functions, so these drive it the only honest way: spawn it against
// a throwaway fixture .sakal/ tree and read its --json report — the same
// contract a caller gets.
//
// SPOS-270 (0.17.0): the epic-doc DRAFTED exemption.
// 0.18 (F1 + A13): every new citation symbol_kind, POSITIVE AND NEGATIVE —
//   a matcher that cannot fail is a matcher that proves nothing — plus the
//   cross-repo trees map, the project-layer reference check, and the
//   backward-compatibility pins that keep 0.17.0-shaped citations verifying.
// =============================================================================
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const verifyScript = join(here, 'sakal-verify.mjs')
let pass = 0, fail = 0
const eq = (got, want, label) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log(`  PASS  ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`) }
}
const trash = []
const tmp = prefix => { const d = mkdtempSync(join(tmpdir(), prefix)); trash.push(d); return d }

// A minimal, otherwise-healthy scope:app tree — one epic doc, nothing else —
// so the only problems it can report are the ones this suite is pinning.
function fixtureTree(epicBody) {
  const root = tmp('sakal-verify-test-')
  const dir = join(root, '.sakal')
  mkdirSync(join(dir, 'epics'), { recursive: true })
  writeFileSync(join(dir, 'config.yaml'), 'project: fixture\nscope: app\napp: fixture-app\n')
  writeFileSync(join(dir, 'epics', 'TEST-01.md'), epicBody)
  return root
}

// --json exits 1 on any error (the CLI's normal, documented contract) — a
// red tree is an expected RESULT here, not a broken test run, so the exit
// code is ignored and only stdout is parsed.
function runVerify(root, extra = []) {
  let out
  try { out = execFileSync(process.execPath, [verifyScript, '--dir', '.sakal', '--repo-root', root, '--json', ...extra],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }) }
  catch (e) { out = e.stdout }
  return JSON.parse(out)
}

// ── a git-backed repo, so `sha:` pins resolve the way they do in the field ──
const git = (root, ...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
function makeRepo(files, prefix = 'sakal-repo-') {
  const root = tmp(prefix)
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true })
    writeFileSync(join(root, p), body)
  }
  git(root, 'init', '-q')
  git(root, 'add', '-A')
  execFileSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'fixture'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  return { root, sha: git(root, 'rev-parse', '--short', 'HEAD') }
}

/** A story tree carrying exactly the citations given. Every knob that could
 *  add unrelated problems (source pins, epic docs, key shapes) is set to the
 *  quiet value, so a report from here is about the citation and nothing else. */
function citeTree(root, cites, { config = 'project: fixture\nscope: app\napp: fixture-app\n' } = {}) {
  const dir = join(root, '.sakal')
  mkdirSync(join(dir, 'stories', 'TEST-01'), { recursive: true })
  writeFileSync(join(dir, 'config.yaml'), config)
  const block = cites.map((c, i) => {
    const lines = [`- ac: TEST-01-01-${String.fromCharCode(97 + i)}`, `  text: "A claim number ${i + 1}."`]
    if (!c) { lines.push('  cite: []'); return lines.join('\n') }
    lines.push('  cite:')
    for (const [k, v] of Object.entries(c)) lines.push(k === 'kind' ? `    - kind: ${v}` : `      ${k}: ${v}`)
    return lines.join('\n')
  }).join('\n')
  writeFileSync(join(dir, 'stories', 'TEST-01', 'TEST-01-01.md'), [
    '---', 'key: TEST-01-01', 'title: A fixture story', 'epic: TEST-01', 'persona: cashier',
    'app: fixture-app', 'module: fixture-module', 'tags: [P0]', 'out_of_scope: []',
    'source: none (drafted)', '---', '',
    'As a cashier, I want a fixture, so that the matcher has something to chew on.', '',
    '## Acceptance criteria', '', '```yaml', block, '```', '',
  ].join('\n'))
  return root
}
const codesFor = (report, code) => report.problems.filter(p => p.code === code)
const errorsOf = report => report.problems.filter(p => p.sev === 'error')

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── epic-doc source: the DRAFTED exemption (SPOS-270)')
{
  const root = fixtureTree([
    '---', 'key: TEST-01', 'title: Drafted epic fixture', 'app: fixture-app',
    'source: none (drafted)', '---', '',
    '## Why this exists', '', 'A drafted epic with no document behind it yet.', '',
  ].join('\n'))
  const report = runVerify(root)
  const problems = report.problems.filter(p => p.file === '.sakal/epics/TEST-01.md')
  eq(report.ok, true, 'a drafted epic doc does not fail verify')
  eq(problems.filter(p => p.sev === 'error').length, 0, 'no SRCGONE (or any other) error for a drafted epic doc')
  eq(problems.filter(p => p.sev === 'warn' && p.code === 'DRAFTED').length, 1, 'exactly one DRAFTED warning')
  eq(problems.find(p => p.code === 'DRAFTED')?.msg, 'epic TEST-01 is drafted with no document behind it',
    'DRAFTED message matches checkSource()\'s wording for stories/journeys/epics.yaml rows')
}

console.log('\n── epic-doc source: a real-but-missing path still SRCGONE-errors (control)')
{
  const root = fixtureTree([
    '---', 'key: TEST-01', 'title: Dead-source epic fixture', 'app: fixture-app',
    'source: docs/specs/does-not-exist.md#some-anchor', '---', '',
    '## Why this exists', '', 'A source that points at a document nobody wrote.', '',
  ].join('\n'))
  const report = runVerify(root)
  const problems = report.problems.filter(p => p.file === '.sakal/epics/TEST-01.md')
  eq(report.ok, false, 'a dead epic source fails verify')
  eq(problems.filter(p => p.sev === 'warn' && p.code === 'DRAFTED').length, 0, 'no DRAFTED warning — this was never drafted, it is missing')
  eq(problems.filter(p => p.sev === 'error' && p.code === 'SRCGONE').length, 1, 'exactly one SRCGONE error')
}

// ═════════════════════════════════════════════════════════════════════════════
// F1 — the citation-grammar extensions. One repo carries every shape.
// ═════════════════════════════════════════════════════════════════════════════
const APP = makeRepo({
  'routes/api.php': [
    '<?php',
    "Route::prefix('api')->name('api.')->group(function () {",
    "    Route::name('order.v1.')->group(function () {",
    "        Route::get('/orders', [OrderController::class, 'index'])->name('admin.orders.index');",
    '    });',
    '});',
    "Route::get('/ping', [HealthController::class, 'ping'])->name('health.ping');",
  ].join('\n'),
  'config/order.php': [
    '<?php',
    'return [',
    '    // taxes are on unless a tenant turns them off',
    "    'tax' => [",
    "        'enabled' => env('ORDER_TAX', true),",
    "        'rate' => 0.1,",
    '    ],',
    "    'max_devices' => 5,",
    '];',
  ].join('\n'),
  'Resources/views/receipts/duplicate.blade.php': '<div>duplicate receipt</div>\n',
  'app/Enums/SubscriptionStatus.php': [
    '<?php',
    'enum SubscriptionStatus: string {',
    "    case Active = 'active';",
    "    case Grace = 'grace';",
    "    case Expired = 'expired';",
    '}',
  ].join('\n'),
  'app/Enums/PermissionEnum.php': [
    '<?php',
    'enum PermissionEnum: string {',
    "    case ViewOrders = 'view-orders';",
    "    case EditOrders = 'edit-orders';",
    "    case VoidOrders = 'void-orders';",
    '}',
  ].join('\n'),
  'tests/Feature/CheckoutTest.php': [
    '<?php',
    'class CheckoutTest extends TestCase {',
    '    public function test_block_policy_rejects_over_limit(): void { $this->assertTrue(true); }',
    '    #[Test]',
    '    public function warn_policy_flags_it(): void { $this->assertTrue(true); }',
    '    public function makeOrder(): Order { return new Order(); }',
    '}',
  ].join('\n'),
  'app/Services/Billing.php': "<?php\nclass Billing {\n    public function charge() {}\n}\n",
}, 'sakal-app-')

const C = (extra) => ({ kind: 'enforced', sha: APP.sha, ...extra })

console.log('\n── symbol_kind: route — the composed name, the exact name, and the miss')
{
  const r = runVerify(citeTree(tmp('sakal-tree-'), [
    C({ symbol_kind: 'route', path: 'routes/api.php', symbol: 'health.ping' }),
    C({ symbol_kind: 'route', path: 'routes/api.php', symbol: 'api.order.v1.admin.orders.index' }),
  ], {}), [])
  // The story tree lives in its own dir; point the cites at the app repo by
  // running verify WITH that repo as the root.
  eq(r.counts.stories, 1, 'the fixture story parsed')
}
{
  // Cites resolve against --repo-root, so the story tree is written INTO the
  // app repo (uncommitted — the pin resolves the code, not the .sakal/ tree).
  citeTree(APP.root, [
    C({ symbol_kind: 'route', path: 'routes/api.php', symbol: 'health.ping' }),
    C({ symbol_kind: 'route', path: 'routes/api.php', symbol: 'api.order.v1.admin.orders.index' }),
    C({ symbol_kind: 'route', path: 'routes/api.php', symbol: 'api.order.v1.admin.orders.destroy' }),
  ])
  const r = runVerify(APP.root)
  const gone = codesFor(r, 'CITEGONE')
  eq(gone.length, 1, 'exactly one route cite fails — the one that is not declared')
  eq(gone[0].msg.startsWith('TEST-01-01-c: no route named "api.order.v1.admin.orders.destroy"'), true, 'the failure names the route and the AC')
  eq(gone[0].msg.includes('names found: api., order.v1., admin.orders.index, health.ping'), true, 'and lists what the file DOES declare')
  eq(codesFor(r, 'CITECOMPOSED').length, 1, 'the composed route is reported as composed, never silently equated to an exact hit')
  eq(codesFor(r, 'CITECOMPOSED')[0].msg.includes('"api." + "order.v1." + "admin.orders.index"'), true, 'and names the pieces it composed')
}

console.log('\n── symbol_kind: config — a real key path, and a key that only LOOKS present')
{
  citeTree(APP.root, [
    C({ symbol_kind: 'config', path: 'config/order.php', symbol: 'order.tax.enabled' }),
    C({ symbol_kind: 'config', path: 'config/order.php', symbol: 'max_devices' }),
    C({ symbol_kind: 'config', path: 'config/order.php', symbol: 'order.enabled' }),
  ])
  const r = runVerify(APP.root)
  const gone = codesFor(r, 'CITEGONE')
  eq(gone.length, 1, 'only the wrong key path fails')
  eq(gone[0].msg.includes('config key "order.enabled" is not a key path'), true,
    '`enabled` exists in the file but NOT at that path — a leaf-name grep would have passed this')
  eq(gone[0].msg.includes('keys found: tax, tax.enabled, tax.rate, max_devices'), true, 'the failure lists the real key paths')
}

console.log('\n── symbol_kind: view — the name IS the path, and a name that is not')
{
  citeTree(APP.root, [
    C({ symbol_kind: 'view', path: 'Resources/views/receipts/duplicate.blade.php', symbol: 'pos::receipts.duplicate' }),
    C({ symbol_kind: 'view', path: 'Resources/views/receipts/duplicate.blade.php', symbol: 'pos::receipts.original' }),
  ])
  const r = runVerify(APP.root)
  const gone = codesFor(r, 'CITEGONE')
  eq(gone.length, 1, 'the mismatched view name fails')
  eq(gone[0].msg.includes('resolves to …/receipts/original.blade.php, which is not the cited path'), true,
    'and says which file that name would have to be')
}

console.log('\n── symbol_kind: enum_case — the case, a missing case, and the wrong enum')
{
  citeTree(APP.root, [
    C({ symbol_kind: 'enum_case', path: 'app/Enums/SubscriptionStatus.php', symbol: 'SubscriptionStatus::Grace' }),
    C({ symbol_kind: 'enum_case', path: 'app/Enums/SubscriptionStatus.php', symbol: 'SubscriptionStatus::Cancelled' }),
    C({ symbol_kind: 'enum_case', path: 'app/Enums/SubscriptionStatus.php', symbol: 'PermissionEnum::Grace' }),
  ])
  const r = runVerify(APP.root)
  const gone = codesFor(r, 'CITEGONE')
  eq(gone.length, 2, 'the missing case and the wrong-enum cite both fail')
  eq(gone[0].msg.includes('no `case Cancelled`'), true, 'a case that is not there is named')
  eq(gone[1].msg.includes('no `enum PermissionEnum` declared here'), true,
    'a case that IS there under the wrong enum is refused — the type half of Type::Case is load-bearing')
}

console.log('\n── verified: PHPUnit method-style tests are test LABELS now')
{
  citeTree(APP.root, [
    { kind: 'verified', sha: APP.sha, path: 'tests/Feature/CheckoutTest.php', symbol: 'test_block_policy_rejects_over_limit' },
    { kind: 'verified', sha: APP.sha, path: 'tests/Feature/CheckoutTest.php', symbol: 'warn_policy_flags_it' },
    { kind: 'verified', sha: APP.sha, path: 'tests/Feature/CheckoutTest.php', symbol: 'makeOrder' },
  ])
  const r = runVerify(APP.root)
  const gone = codesFor(r, 'CITEGONE')
  eq(gone.length, 1, 'the two real tests verify; the helper method does not')
  eq(gone[0].msg.startsWith('TEST-01-01-c: no test label "makeOrder"'), true,
    'a plain method is NOT a test label — only test_* or an #[Test]/@test annotated one')
}

console.log('\n── symbol_kind: measured — a figure that is re-counted, not just asserted')
{
  citeTree(APP.root, [
    C({ symbol_kind: 'measured', path: 'app/Enums/PermissionEnum.php', symbol: 'PermissionEnum', count: 3, count_pattern: '"^\\\\s*case "' }),
    C({ symbol_kind: 'measured', path: 'app/Enums/PermissionEnum.php', symbol: 'PermissionEnum', count: 89, count_pattern: '"^\\\\s*case "' }),
  ])
  const r = runVerify(APP.root)
  const gone = codesFor(r, 'CITEGONE')
  eq(gone.length, 1, 'the true figure passes and the drifted one fails')
  eq(gone[0].msg.includes('measured 3 lines matching'), true, 'the failure prints the number it actually counted')
  eq(gone[0].msg.includes('but the cite claims 89'), true, 'and the number the cite claimed')
}

console.log('\n── measured: over a DIRECTORY, and the required fields')
{
  citeTree(APP.root, [
    C({ symbol_kind: 'measured', path: 'app/Enums', symbol: 'app/Enums', count: 2, count_pattern: '"\\\\.php$"' }),
    C({ symbol_kind: 'measured', path: 'app/Enums/PermissionEnum.php', symbol: 'PermissionEnum', count: 3 }),
  ])
  const r = runVerify(APP.root)
  eq(codesFor(r, 'CITEGONE').length, 0, 'a directory measure counts its entries')
  eq(codesFor(r, 'REQUIRED').filter(p => p.msg.includes('count_pattern')).length, 1,
    'a measured cite without count_pattern is refused — a figure with no method is a note, not a citation')
}

console.log('\n── symbol_kind validation: unknown kinds and crossed proof kinds are refused')
{
  citeTree(APP.root, [
    C({ symbol_kind: 'sorcery', path: 'app/Services/Billing.php', symbol: 'Billing' }),
    C({ symbol_kind: 'test', path: 'app/Services/Billing.php', symbol: 'Billing' }),
    { kind: 'verified', sha: APP.sha, symbol_kind: 'route', path: 'routes/api.php', symbol: 'health.ping' },
  ])
  const r = runVerify(APP.root)
  const kinds = codesFor(r, 'CITEKIND')
  eq(kinds.length, 3, 'all three malformed cites are refused')
  eq(kinds[0].msg.includes('symbol_kind "sorcery" is not one of'), true, 'an unknown symbol_kind is named, with the legal set')
  eq(kinds[1].msg.includes('belongs under `kind: verified`, not `kind: enforced`'), true, 'symbol_kind: test under enforced is refused')
  eq(kinds[2].msg.includes('belongs under `kind: enforced`, not `kind: verified`'), true, 'symbol_kind: route under verified is refused')
}

console.log('\n── backward compatibility: a 0.17.0-shaped cite is byte-for-byte still valid')
{
  citeTree(APP.root, [
    { kind: 'enforced', sha: APP.sha, path: 'app/Services/Billing.php', symbol: 'Billing' },
    { kind: 'enforced', sha: APP.sha, path: 'app/Services/Billing.php', symbol: 'Ledger' },
  ])
  const r = runVerify(APP.root)
  const gone = codesFor(r, 'CITEGONE')
  eq(gone.length, 1, 'the declaration still resolves, and the missing one still fails')
  eq(gone[0].msg.includes('no declaration of "Ledger" greps'), true, '0.17.0\'s own message, unchanged')
}

// ═════════════════════════════════════════════════════════════════════════════
// A13 — cross-repo citation resolution through the trees map.
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── A13: a cross-repo cite with no trees map fails LOUDLY, not silently')
{
  citeTree(APP.root, [C({ path: 'other-app:app/Services/Billing.php', symbol: 'Billing' })])
  const r = runVerify(APP.root)
  eq(codesFor(r, 'XTREE').length, 1, 'the unresolvable tree key is an error, not a pass')
  eq(codesFor(r, 'XTREE')[0].msg.includes('"other-app" is not a tree in the map'), true, 'the failure names the tree key')
  eq(codesFor(r, 'XTREE')[0].fix.includes('registry/trees.yaml'), true, 'and names the file that would fix it')
}

console.log('\n── A13: the trees map resolves a sibling repo, its OWN pin included')
{
  // Spec-home + two app repos, laid out as siblings the way the fleet is.
  const home = tmp('sakal-home-')
  const sib = makeRepo({ 'app/Services/Ledger.php': "<?php\nclass Ledger {\n}\n" }, 'sakal-sib-')
  mkdirSync(join(home, '.sakal', 'registry'), { recursive: true })
  writeFileSync(join(home, '.sakal', 'config.yaml'), 'project: fixture\nscope: project\n')
  writeFileSync(join(home, '.sakal', 'registry', 'personas.yaml'), 'personas:\n  - cashier — The person at the till\n')
  writeFileSync(join(home, '.sakal', 'registry', 'goals.yaml'), 'goals:\n  - sell — Take money\n')
  writeFileSync(join(home, '.sakal', 'registry', 'modules.yaml'), 'modules:\n  - fixture-module — The fixture capability\n')
  writeFileSync(join(home, '.sakal', 'registry', 'codebases.yaml'), 'codebases:\n  - fixture-app — fixture/app\n  - sibling-app — fixture/sibling\n')
  writeFileSync(join(home, '.sakal', 'registry', 'trees.yaml'),
    `trees:\n  - sibling-app — ${join(sib.root, '.sakal')}\n`)
  writeFileSync(join(home, '.sakal', 'journeys.yaml'), 'journeys:\n  - FX-J1 — A fixture journey\n    goal: sell\n    persona: cashier\n    source: none (drafted)\n')
  writeFileSync(join(home, '.sakal', 'epics.yaml'), 'epics:\n  - TEST-01 — The fixture epic\n    source: none (drafted)\n')
  // The sibling needs a .sakal/ of its own for the map to point at.
  mkdirSync(join(sib.root, '.sakal'), { recursive: true })
  writeFileSync(join(sib.root, '.sakal', 'config.yaml'), 'project: fixture\nscope: app\napp: sibling-app\n')

  citeTree(APP.root, [
    { kind: 'enforced', sha: sib.sha, path: 'sibling-app:app/Services/Ledger.php', symbol: 'Ledger' },
    { kind: 'enforced', sha: sib.sha, path: 'sibling-app:app/Services/Ledger.php', symbol: 'Vault' },
  ], { config: `project: fixture\nscope: app\napp: fixture-app\nproject_layer: ${join(home, '.sakal')}\n` })
  const r = runVerify(APP.root)
  eq(r.counts.trees, 1, 'the trees map loaded through project_layer:')
  eq(codesFor(r, 'XTREE').length, 0, 'the tree key resolved')
  eq(codesFor(r, 'PINMISS').length, 0,
    "the SIBLING repo's own sha resolved in the SIBLING repo's git — no working-tree fallback, which is what 0.17.0 could only ever do")
  const gone = codesFor(r, 'CITEGONE')
  eq(gone.length, 1, 'and the symbol that is not in the sibling still fails')
  eq(gone[0].msg.includes('no declaration of "Vault"'), true, 'named, from across the repo boundary')

  console.log('\n── A13: project-layer references, checked from an app tree at last')
  eq(codesFor(r, 'XREF').length, 0, 'every reference in the fixture story resolves in the spec-home')
  citeTree(APP.root, [null], { config: `project: fixture\nscope: app\napp: fixture-app\nproject_layer: ${join(home, '.sakal')}\n` })
  // Same tree, but point the story at a persona the project layer never declared.
  const storyPath = join(APP.root, '.sakal', 'stories', 'TEST-01', 'TEST-01-01.md')
  writeFileSync(storyPath, execFileSync('cat', [storyPath], { encoding: 'utf8' }).replace('persona: cashier', 'persona: barista'))
  const r2 = runVerify(APP.root)
  eq(codesFor(r2, 'XREF').length, 1, 'an undeclared persona is caught across the repo boundary')
  eq(codesFor(r2, 'XREF')[0].sev, 'warn', 'a warning by default — this check did not exist while the trees were written')
  eq(errorsOf(r2).length, 0, 'so an existing tree does not go red the day 0.18 lands')
  const r3 = runVerify(APP.root, ['--strict-xref'])
  eq(codesFor(r3, 'XREF')[0].sev, 'error', '--strict-xref promotes it to the gate, for a tree that has been normalised')

  console.log('\n── A13: superseded_by turns the retirement PROSE into a checked link')
  const epicsYaml = join(home, '.sakal', 'epics.yaml')
  mkdirSync(join(sib.root, '.sakal', 'epics'), { recursive: true })
  writeFileSync(join(sib.root, '.sakal', 'epics', 'SIB-01.md'),
    ['---', 'key: SIB-01', 'title: The tree that superseded it', 'app: sibling-app', 'source: none (drafted)', '---', ''].join('\n'))
  writeFileSync(epicsYaml, 'epics:\n  - TEST-01 — The fixture epic\n    source: none (drafted)\n' +
    '  - OLD-01 — A retired epic\n    source: none (retired — superseded)\n    superseded_by: sibling-app:SIB-01\n' +
    '  - OLD-02 — Retired into a tree nobody declared\n    source: none (retired — superseded)\n    superseded_by: ghost-app:GH-01\n' +
    '  - OLD-03 — Retired into an epic that does not exist there\n    source: none (retired — superseded)\n    superseded_by: sibling-app:NOPE-99\n')
  const rh = runVerify(home)
  eq(codesFor(rh, 'RETIRED').length, 1, 'a resolvable supersession is RETIRED — not "drafted with no document behind it"')
  eq(codesFor(rh, 'RETIRED')[0].msg.includes('superseded by sibling-app:SIB-01'), true, 'and says where it went')
  eq(codesFor(rh, 'XTREE').length, 1, 'a supersession into an undeclared tree is an error')
  eq(codesFor(rh, 'XEPIC').length, 1, 'a supersession into a non-existent epic doc is an error')
  eq(codesFor(rh, 'DRAFTED').filter(p => p.msg.includes('OLD-01')).length, 0,
    'the resolved row loses its DRAFTED warning — it did not vanish, it moved')
}

console.log('\n── the trees map itself is checked where it lives')
{
  const home = tmp('sakal-home2-')
  const sib = makeRepo({ 'x.php': '<?php\n' }, 'sakal-sib2-')
  mkdirSync(join(sib.root, '.sakal'), { recursive: true })
  writeFileSync(join(sib.root, '.sakal', 'config.yaml'), 'project: fixture\nscope: app\napp: actually-called-this\n')
  mkdirSync(join(home, '.sakal', 'registry'), { recursive: true })
  writeFileSync(join(home, '.sakal', 'config.yaml'), 'project: fixture\nscope: project\n')
  writeFileSync(join(home, '.sakal', 'registry', 'trees.yaml'),
    `trees:\n  - sibling-app — ${join(sib.root, '.sakal')}\n  - nowhere-app — ../does/not/exist/.sakal\n`)
  const r = runVerify(home)
  eq(codesFor(r, 'TREEGONE').length, 1, 'a tree path that does not exist is an error')
  eq(codesFor(r, 'TREEAPP').length, 1, 'a map key that disagrees with that tree\'s own app key is an error')
  eq(codesFor(r, 'TREEAPP')[0].msg.includes('`app: actually-called-this`'), true, 'and prints what the tree actually calls itself')
}

console.log('\n── --json survives a report bigger than the OS pipe buffer')
{
  // 400 drafted epic docs ≈ 100 KB of JSON. Before the exitCode fix this came
  // back truncated at 64 KiB and every --json consumer got a parse error.
  const root = tmp('sakal-big-')
  const dir = join(root, '.sakal')
  mkdirSync(join(dir, 'epics'), { recursive: true })
  writeFileSync(join(dir, 'config.yaml'), 'project: fixture\nscope: app\napp: fixture-app\n')
  for (let i = 0; i < 400; i++)
    writeFileSync(join(dir, 'epics', `BIG-${String(i).padStart(3, '0')}.md`), [
      '---', `key: BIG-${String(i).padStart(3, '0')}`, 'title: A drafted epic', 'app: fixture-app',
      'source: none (drafted)', '---', '', '## Why this exists', '', 'Bulk.', '',
    ].join('\n'))
  let raw
  try { raw = execFileSync(process.execPath, [verifyScript, '--dir', '.sakal', '--repo-root', root, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 }) }
  catch (e) { raw = e.stdout }
  eq(raw.length > 65536, true, `the report really is over the 64 KiB pipe buffer (${raw.length} bytes)`)
  let parsed = null
  try { parsed = JSON.parse(raw) } catch { parsed = null }
  eq(parsed?.counts?.epicDocs, 400, 'and it parses whole — all 400 epic docs reported')
}

for (const d of trash) rmSync(d, { recursive: true, force: true })
console.log(`\n${fail ? 'FAILED' : 'OK'} — ${pass} passed, ${fail} failed\n`)
process.exitCode = fail ? 1 : 0
