#!/usr/bin/env node
// =============================================================================
// sakal-select — resolve a /sakal-submit selector, or refuse in words.
//
// This lived in prose until SKA-019, which meant a typo's behaviour depended on
// the agent reading carefully. A refusal is a safety feature; safety features
// belong in code.
//
// It resolves a selector to the concrete files a submit would touch, refuses
// anything outside `.sakal/`, and — the part that matters when someone
// mistypes — always lists what IS selectable.
//
//   node sakal-select.mjs --dir .sakal [--json] [<selector>]
//
// No selector = the show-and-ask listing. Exit 0 = resolved, 1 = refused.
// =============================================================================
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const DIR = opt('--dir', '.sakal')
const JSON_OUT = args.includes('--json')
const selector = args.filter(a => !a.startsWith('--') && a !== DIR)[0] ?? null

const dirAbs = resolve(DIR)
if (!existsSync(dirAbs)) { console.error(`${DIR}/ does not exist. Run /sakal-onboard-project or /sakal-onboard-app first.`); process.exit(2) }

const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])

// What a person may point at. `proposals/` is deliberately absent: it is never
// submitted from here, so offering it as a selector would be a lie.
const SUBMITTABLE = ['registry', 'journeys.yaml', 'epics.yaml', 'stories', 'tasks', 'bugs', 'decisions.md']
const NEVER = new Set(['proposals', 'context.md', '_unread.md', 'findings.md', 'config.yaml'])

function selectable() {
  const out = []
  for (const e of readdirSync(dirAbs, { withFileTypes: true })) {
    if (NEVER.has(e.name)) continue
    if (!SUBMITTABLE.includes(e.name)) continue
    if (e.isDirectory()) {
      out.push(`${e.name}/`)
      if (e.name === 'stories') for (const s of readdirSync(join(dirAbs, e.name), { withFileTypes: true }))
        if (s.isDirectory()) out.push(`stories/${s.name}/`)
    } else out.push(e.name)
  }
  return out
}

const listAlternatives = () => {
  const s = selectable()
  console.log('  What you can select:')
  for (const x of s) console.log(`    ${x}`)
  console.log('    --all                (everything above, refused if verify has any error)')
  console.log('  Or a single file, e.g. stories/BK-01/BK-01-01.md')
}

if (!selector || selector === '--all') {
  const files = walk(dirAbs)
    .map(p => relative(dirAbs, p))
    .filter(p => !NEVER.has(p.split(sep)[0]))
    .filter(p => SUBMITTABLE.includes(p.split(sep)[0]) || SUBMITTABLE.includes(p))
  if (JSON_OUT) console.log(JSON.stringify({ ok: true, selector: selector ?? null, files }, null, 2))
  else {
    console.log(selector === '--all'
      ? `  --all → ${files.length} file(s). Refused if verify reports ANY error anywhere.`
      : `  No selector given. ${files.length} file(s) are selectable; nothing will be sent.`)
    listAlternatives()
  }
  process.exit(0)
}

// ── refuse anything outside .sakal/, including via .. ───────────────────────
const target = resolve(dirAbs, selector)
if (!target.startsWith(dirAbs + sep) && target !== dirAbs) {
  console.log(`REFUSED — "${selector}" points outside ${DIR}/.`)
  console.log('  Submit only ever sends files from this directory.')
  listAlternatives(); process.exit(1)
}
const head = relative(dirAbs, target).split(sep)[0]
if (NEVER.has(head)) {
  console.log(`REFUSED — "${selector}" is not submittable.`)
  console.log(head === 'proposals'
    ? '  proposals/ is carried to the spec-home by a human, deliberately. Submit never sends it.'
    : `  ${head} is local bookkeeping, not data for SakalMaster.`)
  listAlternatives(); process.exit(1)
}
if (!existsSync(target)) {
  console.log(`REFUSED — "${selector}" does not exist in ${DIR}/.`)
  listAlternatives(); process.exit(1)
}

const files = (statSync(target).isDirectory() ? walk(target) : [target]).map(p => relative(dirAbs, p))
if (!files.length) {
  console.log(`REFUSED — "${selector}" is empty; there is nothing to send.`)
  listAlternatives(); process.exit(1)
}
if (JSON_OUT) console.log(JSON.stringify({ ok: true, selector, files }, null, 2))
else {
  console.log(`  "${selector}" → ${files.length} file(s):`)
  for (const f of files) console.log(`    ${f}`)
}
process.exit(0)
