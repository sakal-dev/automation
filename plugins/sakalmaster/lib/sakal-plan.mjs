#!/usr/bin/env node
// =============================================================================
// sakal-plan — drift and submit-readiness. SUBMIT ONLY.
//
// Verify is strictly local (it lints files, on a plane). Everything that needs
// the server lives here, because submit is the one phase allowed to touch it.
//
// This is NOT a second gate. It runs no validation rules — those live solely in
// sakal-verify.mjs, which submit runs first. This reads keys and refs to answer
// two questions verify cannot: what has SakalMaster got, and what is ready.
//
//   node sakal-plan.mjs --dir .sakal --server state.json [--scope sel] [--json]
// =============================================================================
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
// The SAME reader verify uses. A second config parser is how SKA-024 happened.
import { readScalars, stripInlineComment } from './sakal-shared.mjs'
const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const DIR = opt('--dir', '.sakal'), SCOPE = opt('--scope', null), JSON_OUT = args.includes('--json')
const SERVER = opt('--server', null)
if (!SERVER || !existsSync(SERVER)) { console.error('--server <state.json> is required (submit reads SakalMaster back first)'); process.exit(2) }
const server = JSON.parse(readFileSync(SERVER, 'utf8'))
const cfgText = existsSync(join(DIR, 'config.yaml')) ? readFileSync(join(DIR, 'config.yaml'), 'utf8') : ''
const scalars = readScalars(cfgText)
const cfg = k => scalars[k]?.value
const ns = cfg('app') ?? cfg('project')

const walk = d => existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(join(d, e.name)) : (e.name.endsWith('.md') ? [join(d, e.name)] : [])) : []
const stories = []
for (const p of walk(join(DIR, 'stories'))) {
  const t = readFileSync(p, 'utf8')
  const g = k => { const m = t.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')); return m ? stripInlineComment(m[1]) : undefined }
  stories.push({ file: relative(DIR, p), key: g('key'), epic: g('epic'), journey: g('journey'), persona: g('persona'), module: g('module') })
}
const on = { epic: new Set(server.epics ?? []), journey: new Set(server.journeys ?? []),
  persona: new Set(server.personas ?? []), module: new Set(server.modules ?? []), story: new Set(server.stories ?? []) }

// THE DECLARATION IS A CLAIM; here is where it is checked.
const declProblems = []
if (!ns) declProblems.push(`${DIR}/config.yaml: no project/app key declared — submit cannot resolve a target`)
else if (server.project && cfg('project') && server.project !== cfg('project'))
  declProblems.push(`${DIR}/config.yaml: declares project "${cfg('project')}" but the server resolved "${server.project}" — fix the declaration, nothing was written`)
if (cfg('app') && (server.apps ?? []).length && !(server.apps ?? []).includes(cfg('app')))
  declProblems.push(`${DIR}/config.yaml: declares app "${cfg('app')}", which is not a codebase in this project — link it, or fix the key`)

const inS = f => !SCOPE || f.includes(SCOPE.replace(/^\.\//, ''))
const ready = [], blocked = [], already = []
for (const s of stories.filter(s => inS(s.file))) {
  if (on.story.has(`spec:${ns}:${s.key}`)) { already.push(s); continue }
  const miss = [['epic', s.epic], ['journey', s.journey], ['persona', s.persona], ['module', s.module]]
    .filter(([f, v]) => v && !on[f].has(v))
  if (miss.length) {
    const [f, v] = miss[0]
    blocked.push({ ...s, why: `${s.key} references ${f} ${v}, which is not in SakalMaster yet — submit ${f === 'epic' ? 'epics.yaml' : f === 'journey' ? 'journeys.yaml' : `registry/${f}s.yaml`} first` })
  } else ready.push(s)
}
const want = new Set(stories.map(s => `spec:${ns}:${s.key}`))
const drift = { onlyLocal: [...want].filter(k => !on.story.has(k)), onlyServer: [...on.story].filter(k => !want.has(k)) }

if (JSON_OUT) { console.log(JSON.stringify({ ok: !declProblems.length, declProblems, ready, blocked, already, drift }, null, 2)); process.exit(declProblems.length ? 1 : 0) }
if (declProblems.length) {
  console.log('REFUSED — the declaration does not resolve against the server. Nothing was written.')
  for (const d of declProblems) console.log(`  ${d}`)
  process.exit(1)
}
console.log(`\n  submit readiness${SCOPE ? ` (scope: ${SCOPE})` : ''}:`)
console.log(`    ready: ${ready.length}   blocked: ${blocked.length}   already in SakalMaster: ${already.length}`)
for (const x of ready) console.log(`      ready    ${x.key}`)
for (const x of blocked) console.log(`      blocked  ${x.why}`)
console.log(`\n  drift vs the server, read live just now (WHOLE TREE, not just the scope):`)
if (!drift.onlyLocal.length && !drift.onlyServer.length) console.log('    none — files and SakalMaster agree')
if (drift.onlyLocal.length) console.log(`    ${drift.onlyLocal.length} in files, NOT yet in SakalMaster: ${drift.onlyLocal.join(', ')}`)
if (drift.onlyServer.length) { console.log(`    ${drift.onlyServer.length} in SakalMaster, NOT in files: ${drift.onlyServer.join(', ')}`); console.log('      ↳ someone edited in-app, or a story left the files. Submit will NOT delete these.') }
console.log()
