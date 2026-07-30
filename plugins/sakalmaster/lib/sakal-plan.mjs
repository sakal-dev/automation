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
  stories.push({ file: relative(DIR, p), key: g('key'), epic: g('epic'), journey: g('journey'), persona: g('persona'), module: g('module'), hasSource: /^source:\s*\S/m.test(t) })
}
// F-4 (SKA-035): every reference kind now HAS a list tool server-side
// (list_registry · list_journeys · list_epics). An absent set in the state
// file is therefore "the caller did not read it", NOT "the server holds
// none" — and blocking a story on an unread set is the false-refusal hole.
// `apps` may arrive as keys or as {key, github_repo} rows (list_registry).
const keysOf = v => (v ?? []).map(x => typeof x === 'string' ? x : x.key)
const supplied = k => Array.isArray(server[k])
const on = { epic: new Set(keysOf(server.epics)), journey: new Set(keysOf(server.journeys)),
  persona: new Set(keysOf(server.personas)), module: new Set(keysOf(server.modules)), story: new Set(keysOf(server.stories)) }
const unread = ['epics', 'journeys', 'personas', 'modules'].filter(k => !supplied(k))

// THE DECLARATION IS A CLAIM; here is where it is checked.
const declProblems = []
if (!ns) declProblems.push(`${DIR}/config.yaml: no project/app key declared — submit cannot resolve a target`)
else if (server.project && cfg('project') && server.project !== cfg('project'))
  declProblems.push(`${DIR}/config.yaml: declares project "${cfg('project')}" but the server resolved "${server.project}" — fix the declaration, nothing was written`)
// App identity is resolved by lib/sakal-identity.mjs (F-5: key AND repo
// axes, conflict refusal, show-and-ask creation) — the planner only notes
// that the declared key is unknown to the read-back, and points there.
if (cfg('app') && supplied('apps') && keysOf(server.apps).length && !keysOf(server.apps).includes(cfg('app')))
  declProblems.push(`${DIR}/config.yaml: declares app "${cfg('app')}", which no read-back row carries by KEY — run lib/sakal-identity.mjs (it also matches by linked repo, and refuses rather than creating silently)`)

const inS = f => !SCOPE || f.includes(SCOPE.replace(/^\.\//, ''))
const ready = [], blocked = [], already = []
for (const s of stories.filter(s => inS(s.file))) {
  if (on.story.has(`spec:${ns}:${s.key}`)) { already.push(s); continue }
  const miss = [['epic', s.epic], ['journey', s.journey], ['persona', s.persona], ['module', s.module]]
    // Only a set the caller actually READ can block a story.
    .filter(([f, v]) => v && supplied(`${f}s`) && !on[f].has(v))
  if (miss.length) {
    const [f, v] = miss[0]
    blocked.push({ ...s, why: `${s.key} references ${f} ${v}, which is not in SakalMaster yet — submit ${f === 'epic' ? 'epics.yaml' : f === 'journey' ? 'journeys.yaml' : `registry/${f}s.yaml`} first` })
  } else ready.push(s)
}
const want = new Set(stories.map(s => `spec:${ns}:${s.key}`))
const drift = { onlyLocal: [...want].filter(k => !on.story.has(k)), onlyServer: [...on.story].filter(k => !want.has(k)) }


// ── the SKA-029 writes: narrative · profile · consumes_raw · source ─────────
// What THIS tree will send beyond keys/refs, and which server migration each
// depends on. Each degrades INDEPENDENTLY at submit time (a pre-035/036
// server holds a field back by name; nothing is all-or-nothing).
const mdFiles = d => existsSync(join(DIR, d)) ? readdirSync(join(DIR, d), { withFileTypes: true }).filter(e => e.name.endsWith('.md')).map(e => join(DIR, d, e.name)) : []
const fmOf = p => { const t = readFileSync(p, 'utf8'); const g = k => { const m = t.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')); return m ? stripInlineComment(m[1]).trim() : null }; return { g, body: t.split('\n---\n').slice(1).join('\n---\n') } }
const journeyFiles = mdFiles('journeys').map(fmOf)
const epicFiles = mdFiles('epics').map(fmOf)
const writes = {
  journey_narratives: journeyFiles.filter(f => f.body?.trim()).length,          // → p_narrative (SKM-035)
  epic_consumes_raw: epicFiles.filter(f => f.g('consumes_raw')).length,          // → p_consumes_raw (SKM-035)
  // Epic prose (SKA-032, the R-6 gap): narrative + test-strategy sections in
  // the records, extractable via lib/sakal-record.mjs at submit time. A
  // project-scope index counts entries whose source doc holds the prose.
  epic_narratives: epicFiles.filter(f => /^##\s+What to build\s*$/mi.test(f.body ?? '')).length,
  epic_test_strategies: epicFiles.filter(f => /^##\s+(Test strategy|How this epic proves itself)\s*$/mi.test(f.body ?? '')).length,
  epic_sources: epicFiles.filter(f => f.g('source')).length,                     // → p_source (SKM-036)
  story_sources: stories.filter(s => s.hasSource).length,                        // → p_source (SKM-036)
  app_profile: /^app_profile:/m.test(cfgText),                                   // → sakal_update_app_profile (SKM-035)
}

// ── P-M1 (SKA-033): the orphan report — server has X; tree does not ─────────
// A record the tree stopped naming is a claimable ghost. Reported at EVERY
// submit, per entity kind; deletion stays a human act. Stories scope by app
// (the `spec:<app>:` namespace); epics/journeys scope by project.
const treeEpicKeys = new Set(epicFiles.map(f => f.g('key')).filter(Boolean))
const treeJourneyKeys = new Set(journeyFiles.map(f => f.g('key')).filter(Boolean))
for (const y of [['epics.yaml', treeEpicKeys], ['journeys.yaml', treeJourneyKeys]]) {
  const p = join(DIR, y[0])
  if (existsSync(p)) for (const m of readFileSync(p, 'utf8').matchAll(/^\s*-\s+(\S+)\s+—/gm)) y[1].add(m[1])
}
// App shells (F-5c): keys are SURFACE NAMES; a row whose key is a repo name
// (owner/repo, or a key matching no tree while another row holds this repo)
// is the wrong convention and becomes an orphan under the mutation contract.
const declaredApp = cfg('app')
const appRows = supplied('apps') ? (server.apps ?? []).map(a => typeof a === 'string' ? { key: a, github_repo: null } : a) : []
const orphans = {
  stories: drift.onlyServer,
  epics: keysOf(server.epics).filter(k => !treeEpicKeys.has(k)),
  journeys: keysOf(server.journeys).filter(k => !treeJourneyKeys.has(k)),
  appShells: declaredApp
    ? appRows.filter(a => a.key !== declaredApp && /^[^/]+\/[^/]+$/.test(a.key)).map(a => a.key)
    : [],
}

if (JSON_OUT) { console.log(JSON.stringify({ ok: !declProblems.length, declProblems, ready, blocked, already, drift, writes, orphans }, null, 2)); process.exit(declProblems.length ? 1 : 0) }
if (declProblems.length) {
  console.log('REFUSED — the declaration does not resolve against the server. Nothing was written.')
  for (const d of declProblems) console.log(`  ${d}`)
  process.exit(1)
}
console.log(`\n  submit readiness${SCOPE ? ` (scope: ${SCOPE})` : ''}:`)
console.log(`    ready: ${ready.length}   blocked: ${blocked.length}   already in SakalMaster: ${already.length}`)
for (const x of ready) console.log(`      ready    ${x.key}`)
for (const x of blocked) console.log(`      blocked  ${x.why}`)
console.log(`\n  beyond keys/refs, this tree carries (each degrades INDEPENDENTLY, held back by name on an older server):`)
console.log(`    ${writes.journey_narratives} journey narrative(s) → p_narrative (needs SKM-035)`)
console.log(`    ${writes.epic_consumes_raw} epic consumes_raw line(s) → p_consumes_raw (needs SKM-035)`)
console.log(`    epic prose: ${writes.epic_narratives} narrative(s) · ${writes.epic_test_strategies} test strateg(ies) → p_narrative/p_test_strategy (needs SKM-035; extract via lib/sakal-record.mjs)`)
console.log(`    app profile: ${writes.app_profile ? 'present → sakal_update_app_profile (needs SKM-035)' : 'none declared'}`)
console.log(`    ${writes.story_sources + writes.epic_sources} source URI(s) (stories ${writes.story_sources} · epics ${writes.epic_sources}) → p_source (needs SKM-036)`)
console.log(`\n  drift vs the server, read live just now (WHOLE TREE, not just the scope):`)
if (!drift.onlyLocal.length && !drift.onlyServer.length) console.log('    none — files and SakalMaster agree')
if (drift.onlyLocal.length) console.log(`    ${drift.onlyLocal.length} in files, NOT yet in SakalMaster: ${drift.onlyLocal.join(', ')}`)
if (drift.onlyServer.length) { console.log(`    ${drift.onlyServer.length} in SakalMaster, NOT in files: ${drift.onlyServer.join(', ')}`); console.log('      ↳ someone edited in-app, or a story left the files. Submit will NOT delete these.') }
if (orphans.stories.length || orphans.epics.length || orphans.journeys.length || orphans.appShells.length) {
  console.log(`\n  ORPHANS (P-M1) — a record the tree stopped naming is a claimable ghost; deletion stays a human act:`)
  for (const k of orphans.stories) console.log(`    server has story ${k}; tree does not`)
  for (const k of orphans.epics) console.log(`    server has epic ${k}; tree does not`)
  for (const k of orphans.journeys) console.log(`    server has journey ${k}; tree does not`)
  for (const k of orphans.appShells) console.log(`    server has app ${k} (a REPO-NAME shell — keys are surface names); no tree declares it`)
  if (orphans.appShells.length) console.log('      ↳ delete shells IN THE APP (it refuses while anything real references them): move the repo link (set_app_repo) and the Agent profile off the shell first.')
  console.log('      ↳ a key rename/split needs an operator DECISION RECORD before re-submit (CONVENTIONS.md) — this report is the tripwire.')
}
if (unread.length) console.log(`\n  NOT READ BACK: ${unread.join(', ')} — these sets were not supplied, so nothing was blocked on them (F-4).\n    A connected caller reads list_registry · list_journeys · list_epics; an unread set is not an empty server.`)
console.log()
