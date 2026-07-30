#!/usr/bin/env node
// =============================================================================
// sakal-baseline — the last-submitted receipt, and the gates it powers
// (SKA-033 · D02-R1 verdicts P-M3, P-M4, P-M5).
//
// Q-M1 settled why this exists: AC identity is the ROW (uuid), the letter is
// an ADDRESS — a letter-shift re-submit silently re-texts rows whose evidence
// (citations, bugs, verifier results) stays attached. The corruption path
// must be one explicit confirmation wide, not one spec edit wide.
//
//   .sakal/.baseline.json    last-submitted values per field, per record.
//   COMMITTED, deliberately: the tree is committed by design and the baseline
//   is the team's shared receipt — a gitignored copy would let two machines
//   disagree about the same server, and the three-way refusal only means
//   something if the receipt travels with the branch.
//   Deterministic: sorted keys, stable serialization, trailing newline.
//
// Modes:
//   --check (default)      compare TREE vs BASELINE (vs SERVER values where
//                          the state file carries them):
//     · P-M3  AC-set gate: count/order/letters differ from baseline → REFUSE
//             (exit 1) with the renumber diff; --confirm-ac-changes proceeds.
//             Text-only edits under stable ids FLOW FREELY (scenario A).
//     · P-M4  cite convergence, keyed (ac, path, symbol, kind): ADD missing,
//             SKIP identical, FLAG vanished — never delete (a vanished cite
//             may be a moved file; CITEGONE at verify already speaks).
//     · P-M5  three-way: server ≠ baseline on a field → REFUSE naming the
//             field and both values (someone edited in-app; converging over
//             them would clobber). Server values absent from the state file
//             → stated, two-way only.
//   --write                snapshot the tree as the new baseline (run AFTER
//                          a green submit — the receipt records what landed).
//   --rebaseline           lost/corrupt baseline recovery: shows the FULL
//                          snapshot that will become the receipt, then writes.
//
// First-ever submit: no baseline → nothing to refuse, say so, exit 0
// (--write afterwards creates it).
//
//   node sakal-baseline.mjs [--dir .sakal] [--check|--write|--rebaseline]
//                           [--server state.json] [--confirm-ac-changes] [--json]
// =============================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { readScalars, readFencedACs } from './sakal-shared.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const DIR = opt('--dir', '.sakal')
const MODE = args.includes('--write') ? 'write' : args.includes('--rebaseline') ? 'rebaseline' : 'check'
const CONFIRM = args.includes('--confirm-ac-changes')
const JSON_OUT = args.includes('--json')
const SERVER = opt('--server', null)
const BASE = join(DIR, '.baseline.json')

// ── snapshot: the tree's submitted values, deterministically ────────────────
const sortObj = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b, 'en')))
const walk = d => existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(join(d, e.name)) : (e.name.endsWith('.md') ? [join(d, e.name)] : [])) : []
const fmAndBody = p => {
  const lines = readFileSync(p, 'utf8').split('\n')
  const end = lines[0]?.trim() === '---' ? lines.indexOf('---', 1) : -1
  return { fm: readScalars(lines.slice(1, end < 0 ? 0 : end).join('\n')), body: lines.slice(end + 1).join('\n'), text: lines.join('\n') }
}
function snapshot() {
  const s = { stories: {}, epics: {}, journeys: {} }
  for (const p of walk(join(DIR, 'stories'))) {
    const { fm, body } = fmAndBody(p)
    if (!fm.key?.value) continue
    const acs = readFencedACs(body)
    s.stories[fm.key.value] = {
      fields: sortObj(Object.fromEntries(['title', 'epic', 'journey', 'persona', 'module', 'tags', 'out_of_scope', 'consumes_raw', 'source'].filter(k => fm[k]).map(k => [k, fm[k].value]))),
      acs: acs.map(a => a.id),
      acTexts: sortObj(Object.fromEntries(acs.map(a => [a.id, a.text ?? '']))),
      cites: acs.flatMap(a => a.cites.map(c => `${a.id}|${c.kind}|${c.path}|${c.symbol}`)).sort(),
    }
  }
  for (const p of walk(join(DIR, 'epics'))) {
    const { fm, body } = fmAndBody(p)
    if (!fm.key?.value) continue
    s.epics[fm.key.value] = { fields: sortObj(Object.fromEntries(['title', 'tier', 'priority', 'consumes_raw', 'source'].filter(k => fm[k]).map(k => [k, fm[k].value]))), body }
  }
  for (const p of walk(join(DIR, 'journeys'))) {
    const { fm, body } = fmAndBody(p)
    if (!fm.key?.value) continue
    s.journeys[fm.key.value] = { fields: sortObj(Object.fromEntries(['title', 'goal', 'persona', 'source'].filter(k => fm[k]).map(k => [k, fm[k].value]))), body }
  }
  return { stories: sortObj(s.stories), epics: sortObj(s.epics), journeys: sortObj(s.journeys) }
}
const serialize = snap => JSON.stringify(snap, null, 2) + '\n'

if (!existsSync(DIR)) { console.error(`${DIR}/ does not exist`); process.exit(2) }
const tree = snapshot()

if (MODE === 'write' || MODE === 'rebaseline') {
  if (MODE === 'rebaseline') {
    console.log('  RE-BASELINE — the old receipt is lost or unreadable. The FULL snapshot below becomes the new receipt;')
    console.log('  review it: anything the server holds beyond it will refuse as in-app drift on the next submit.\n')
    console.log(serialize(tree))
  }
  writeFileSync(BASE, serialize(tree))
  console.log(`  baseline written: ${BASE} (${Object.keys(tree.stories).length} stories · ${Object.keys(tree.epics).length} epics · ${Object.keys(tree.journeys).length} journeys)`)
  console.log('  Committed, deliberately — the receipt travels with the branch.')
  process.exit(0)
}

// ── check ───────────────────────────────────────────────────────────────────
const out = { firstSubmit: false, acGate: [], citesToAdd: [], citesIdentical: 0, citesVanished: [], threeWay: [], textOnly: [], notes: [] }
let baseline = null
if (!existsSync(BASE)) {
  out.firstSubmit = true
  out.notes.push('no baseline — first submit for this tree: nothing to refuse; everything is a create. Run --write after the submit lands.')
} else {
  try { baseline = JSON.parse(readFileSync(BASE, 'utf8')) } catch {
    console.error(`  REFUSED — ${BASE} exists but cannot be parsed. The receipt is corrupt.`)
    console.error('  Recover with --rebaseline: it prints the FULL snapshot that becomes the new receipt, then writes it.')
    process.exit(1)
  }
}

if (baseline) {
  // P-M3 — the AC-set gate.
  for (const [key, st] of Object.entries(tree.stories)) {
    const b = baseline.stories?.[key]
    if (!b) continue                       // new story — a create, no gate
    const same = b.acs.length === st.acs.length && b.acs.every((id, i) => id === st.acs[i])
    if (!same) {
      out.acGate.push({ key, baseline: b.acs, tree: st.acs })
    } else {
      for (const id of st.acs) if ((b.acTexts?.[id] ?? '') !== (st.acTexts[id] ?? ''))
        out.textOnly.push(`${id}: text changed under a stable id — flows freely (scenario A); update_ac_text converges it`)
    }
    // P-M4 — cite convergence, keyed (ac, path, symbol, kind).
    const bSet = new Set(b.cites ?? []), tSet = new Set(st.cites)
    for (const c of st.cites) if (!bSet.has(c)) out.citesToAdd.push(c)
    for (const c of b.cites ?? []) if (!tSet.has(c)) out.citesVanished.push(c)
    out.citesIdentical += st.cites.filter(c => bSet.has(c)).length
  }
  // P-M5 — three-way where the server state carries values.
  const server = SERVER && existsSync(SERVER) ? JSON.parse(readFileSync(SERVER, 'utf8')) : null
  const records = server?.records ?? null
  if (!records) out.notes.push('server state carries no field values (pre-SKM-038 read-back) — three-way degrades to baseline-vs-tree; in-app edits cannot be detected until the read-back ships')
  else for (const kind of ['stories', 'epics', 'journeys']) for (const [key, srv] of Object.entries(records[kind] ?? {})) {
    const b = baseline[kind]?.[key]
    if (!b) continue
    for (const [field, sv] of Object.entries(srv.fields ?? {})) {
      const bv = b.fields?.[field]
      if (bv !== undefined && String(sv) !== String(bv))
        out.threeWay.push({ kind, key, field, server: String(sv), baseline: String(bv) })
    }
  }
}

if (JSON_OUT) console.log(JSON.stringify(out, null, 2))
else {
  if (out.firstSubmit) console.log(`  ${out.notes[0]}`)
  if (out.textOnly.length) { console.log(`  scenario-A edits (frictionless):`); for (const t of out.textOnly) console.log(`    ${t}`) }
  if (out.citesToAdd.length) console.log(`  cites to ADD (${out.citesToAdd.length}): ${out.citesToAdd.slice(0, 5).join(' · ')}${out.citesToAdd.length > 5 ? ' …' : ''}`)
  if (out.citesIdentical) console.log(`  cites identical (SKIP, never re-add — a pre-SKM-039 server would duplicate them): ${out.citesIdentical}`)
  if (out.citesVanished.length) { console.log(`  cites VANISHED from the tree (FLAGGED, never deleted — a moved file is not a retraction; deleting evidence is a human act):`); for (const c of out.citesVanished) console.log(`    ${c}`) }
  for (const n of out.notes.slice(out.firstSubmit ? 1 : 0)) console.log(`  ${n}`)
}

let refused = false
if (out.threeWay.length) {
  refused = true
  console.log(`\n  REFUSED — the server moved since the last submit (in-app edits). Converging over them would clobber:`)
  for (const t of out.threeWay) console.log(`    ${t.kind}/${t.key} · ${t.field}: server "${t.server}" ≠ baseline "${t.baseline}"`)
  console.log('  Reconcile by hand (adopt the server value into the tree, or decide it), then re-run.')
}
if (out.acGate.length && !CONFIRM) {
  refused = true
  console.log(`\n  REFUSED — the AC set changed since the last submit (count/order/letters). Letters are ADDRESSES;`)
  console.log('  rows keep their uuid, so a shifted re-submit would silently re-text rows whose citations/bugs still attest the OLD claim.')
  for (const g of out.acGate) {
    console.log(`    ${g.key}:`)
    console.log(`      baseline: ${g.baseline.join(' ')}`)
    console.log(`      tree:     ${g.tree.join(' ')}`)
  }
  console.log('  If this renumbering is deliberate, re-run with --confirm-ac-changes (the operator owns that call),')
  console.log('  and record the decision (a key/AC renumber needs a decision record BEFORE re-submit — CONVENTIONS.md).')
}
if (out.acGate.length && CONFIRM && !out.threeWay.length) {
  console.log(`\n  AC-set changes CONFIRMED by the operator (${out.acGate.length} story/ies) — proceeding. The renumber diff, for the record:`)
  for (const g of out.acGate) {
    console.log(`    ${g.key}:`)
    console.log(`      baseline: ${g.baseline.join(' ')}`)
    console.log(`      tree:     ${g.tree.join(' ')}`)
  }
}
process.exit(refused ? 1 : 0)
