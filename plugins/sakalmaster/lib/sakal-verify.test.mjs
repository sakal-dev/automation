#!/usr/bin/env node
// =============================================================================
// Tests for sakal-verify.mjs itself (SPOS-270). It runs as a CLI, not a
// library of exported functions, so these drive it the only honest way: spawn
// it against a throwaway fixture .sakal/ tree and read its --json report —
// the same contract a caller gets.
//
// Case: an epic doc drafted with no document behind it (`source: none
// (drafted)`) must warn like checkSource() warns for stories/journeys/
// epics.yaml — never the SRCGONE error resolvePinned() raises for a path it
// cannot resolve. A REAL path that is simply missing must still SRCGONE.
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

// A minimal, otherwise-healthy scope:app tree — one epic doc, nothing else —
// so the only problems it can report are the ones this suite is pinning.
function fixtureTree(epicBody) {
  const root = mkdtempSync(join(tmpdir(), 'sakal-verify-test-'))
  const dir = join(root, '.sakal')
  mkdirSync(join(dir, 'epics'), { recursive: true })
  writeFileSync(join(dir, 'config.yaml'), 'project: fixture\nscope: app\napp: fixture-app\n')
  writeFileSync(join(dir, 'epics', 'TEST-01.md'), epicBody)
  return root
}

// --json exits 1 on any error (the CLI's normal, documented contract) — a
// red tree is an expected RESULT here, not a broken test run, so the exit
// code is ignored and only stdout is parsed.
function runVerify(root) {
  let out
  try { out = execFileSync(process.execPath, [verifyScript, '--dir', '.sakal', '--repo-root', root, '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (e) { out = e.stdout }
  return JSON.parse(out)
}

console.log('\n── epic-doc source: the DRAFTED exemption (SPOS-270)')
{
  const root = fixtureTree([
    '---', 'key: TEST-01', 'title: Drafted epic fixture', 'app: fixture-app',
    'source: none (drafted)', '---', '',
    '## Why this exists', '', 'A drafted epic with no document behind it yet.', '',
  ].join('\n'))
  try {
    const report = runVerify(root)
    const problems = report.problems.filter(p => p.file === '.sakal/epics/TEST-01.md')
    eq(report.ok, true, 'a drafted epic doc does not fail verify')
    eq(problems.filter(p => p.sev === 'error').length, 0, 'no SRCGONE (or any other) error for a drafted epic doc')
    eq(problems.filter(p => p.sev === 'warn' && p.code === 'DRAFTED').length, 1, 'exactly one DRAFTED warning')
    eq(problems.find(p => p.code === 'DRAFTED')?.msg, 'epic TEST-01 is drafted with no document behind it',
      'DRAFTED message matches checkSource()\'s wording for stories/journeys/epics.yaml rows')
  } finally { rmSync(root, { recursive: true, force: true }) }
}

console.log('\n── epic-doc source: a real-but-missing path still SRCGONE-errors (control)')
{
  const root = fixtureTree([
    '---', 'key: TEST-01', 'title: Dead-source epic fixture', 'app: fixture-app',
    'source: docs/specs/does-not-exist.md#some-anchor', '---', '',
    '## Why this exists', '', 'A source that points at a document nobody wrote.', '',
  ].join('\n'))
  try {
    const report = runVerify(root)
    const problems = report.problems.filter(p => p.file === '.sakal/epics/TEST-01.md')
    eq(report.ok, false, 'a dead epic source fails verify')
    eq(problems.filter(p => p.sev === 'warn' && p.code === 'DRAFTED').length, 0, 'no DRAFTED warning — this was never drafted, it is missing')
    eq(problems.filter(p => p.sev === 'error' && p.code === 'SRCGONE').length, 1, 'exactly one SRCGONE error')
  } finally { rmSync(root, { recursive: true, force: true }) }
}

console.log(`\n${fail ? 'FAILED' : 'OK'} — ${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
