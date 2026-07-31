#!/usr/bin/env node
// =============================================================================
// sakal-baseline — the last-submitted receipt and the mutation gates
// (SKA-033 interim → SKA-034 permanent · D02 rounds 1–2, all verdicts).
//
// Q-M1 settled why: AC identity is the ROW (uuid), the letter is an ADDRESS —
// evidence (citations, bugs, verifier results) attaches to rows. So mutation
// is governed here, mechanically:
//
//   P-M3 (permanent, as amended)  On a CONFIRMED set change: EXACT content
//        match converges silently (same text = same criterion, the row keeps
//        its uuid, the letter recomputes as a display address). Everything
//        else REFUSES with the diff; near-matches are ranked SUGGESTIONS
//        only — thresholds rank, never decide; no constant silently moves
//        data. The operator's confirmed mapping (--map) is recorded in the
//        committed receipt. Unmatched tree ACs become new rows; unmatched
//        server rows are flagged orphans — NEVER deleted, NEVER re-texted
//        silently.
//   P-M6(i)  Any text change on a row carrying citations is surfaced in the
//        confirm diff, set-shift or not — "re-texting under evidence" never
//        slides through as scenario A. (The database-side verification reset
//        is SKM-040's trigger; against a server predating it, verifier state
//        does NOT auto-reset — stated, not assumed.)
//   P-M5  Three-way: server ≠ receipt ⇒ REFUSE naming field + both values.
//        When it refuses, AC mapping is DEFERRED (one refusal at a time — no
//        double-refusal confusion).
//   P-M4  Cites keyed (ac, path, symbol, kind): add missing, SKIP identical
//        (SKM-039 makes a re-add a quiet no-op server-side; pre-039 servers
//        would duplicate — never re-send what the receipt shows landed),
//        FLAG vanished, never delete.
//
// THE RECEIPT (.sakal/.baseline.json) is COMMITTED — the team's shared
// record; deterministic serialization (sorted keys, stable order). Writes
// land in it PER-WRITE on ACK: "Sent N" may only ever equal acked-N, and a
// partial failure leaves exactly the un-acked records stale (the next check
// names them). THE LOG (.sakal/submit-log.md) is append-only and human-
// readable; nothing submit-produced lives outside .sakal/ (operator ruling,
// binding).
//
// Modes:
//   --check [--server state.json] [--confirm-ac-changes] [--map T=B]...
//   --write [--ack kind/key]... [--map T=B]... [--note "..."]... [--ts ISO]
//   --rebaseline · --log "line" [--ts ISO]
// =============================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { readScalars, readFencedACs, normWS } from './sakal-shared.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const all = n => args.flatMap((a, i) => a === n ? [args[i + 1]] : [])
const DIR = opt('--dir', '.sakal')
const MODE = args.includes('--correct') ? 'correct'
  : args.includes('--write') ? 'write' : args.includes('--rebaseline') ? 'rebaseline' : args.includes('--log') ? 'log' : 'check'
const CONFIRM = args.includes('--confirm-ac-changes')
const JSON_OUT = args.includes('--json')
const SERVER = opt('--server', null)
const TS = opt('--ts', null) ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
const MAPS = all('--map').map(m => { const [t, b] = m.split('='); return { tree: t, base: b } })
const ACKS = all('--ack')
const NOTES = all('--note')
// F-9: the ack names WHICH field-families actually went over the wire, and
// what was held back and why. Never inferred from the tree.
const SENT = all('--sent')                                    // e.g. --sent fields --sent cites:AC-a|enforced|p|s
const HELD = all('--held').map(h => { const i = h.indexOf('='); return { family: h.slice(0, i), why: h.slice(i + 1) } })
const CORRECT = opt('--correct', null)                        // family name to re-derive from server truth
const FAMILIES_ALL = ['fields', 'acs', 'acTexts', 'cites']
const BASE = join(DIR, '.baseline.json')
const LOG = join(DIR, 'submit-log.md')

// ── snapshot ────────────────────────────────────────────────────────────────
const sortObj = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b, 'en')))
const walk = d => existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(join(d, e.name)) : (e.name.endsWith('.md') ? [join(d, e.name)] : [])) : []
const fmAndBody = p => {
  const lines = readFileSync(p, 'utf8').split('\n')
  const end = lines[0]?.trim() === '---' ? lines.indexOf('---', 1) : -1
  return { fm: readScalars(lines.slice(1, end < 0 ? 0 : end).join('\n')), body: lines.slice(end + 1).join('\n') }
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
const loadBaseline = () => { try { return JSON.parse(readFileSync(BASE, 'utf8')) } catch { return undefined } }

// ── F-9: the receipt records THE TRANSMISSION, per write, per family ────────
// A record's `_sent` says which field-families actually went over the wire.
// Anything not acked — held back, deferred, refused, or simply unrecorded by
// a pre-F-9 receipt — is ABSENT to the gate: "identical" requires an ACKED
// value, full stop. The 162 deferred owner cites were "identical" to a gate
// reading tree-vs-tree; that is the whole defect.
const SCHEMA = 2
const HEADER = '_note'
const NOTE_TEXT = 'Receipt schema 2 (SKA-036/F-9): `_sent` records WHICH field-families were transmitted per write. ' +
  'A family absent from `_sent`, or carrying {held_back}, is treated as NOT DELIVERED by the convergence gate — ' +
  'those items are to-ADD. Migrated pre-F-9 records carry _sent.<family>.unverified: their transmission was never ' +
  'recorded, so nothing may be claimed for them; `--correct <family> --server <state>` re-derives one against server truth.'

/** Read old shape, write new — one-way, headered. Values are preserved; only
 *  the CLAIM about their delivery is downgraded to honest ignorance. */
function migrate(receipt) {
  if (receipt._schema === SCHEMA) return { receipt, migrated: 0 }
  let n = 0
  for (const kind of ['stories', 'epics', 'journeys']) for (const rec of Object.values(receipt[kind] ?? {})) {
    if (rec._sent) continue
    rec._sent = Object.fromEntries(FAMILIES_ALL.filter(f => rec[f] !== undefined)
      .map(f => [f, { unverified: 'pre-F-9 receipt — transmission was never recorded' }]))
    n++
  }
  receipt._schema = SCHEMA
  receipt[HEADER] = NOTE_TEXT
  return { receipt, migrated: n }
}
/** Delivered values for a family, or undefined when nothing was acked. */
const deliveredFamily = (rec, family) => {
  const st = rec?._sent?.[family]
  if (!st || st.held_back || st.unverified) return undefined
  return Array.isArray(st.items) ? st.items : rec[family]
}
const familyState = (rec, family) => {
  const st = rec?._sent?.[family]
  if (!st) return 'unrecorded'
  if (st.held_back) return `held_back: ${st.held_back}`
  if (st.unverified) return 'unverified'
  return 'acked'
}

if (!existsSync(DIR)) { console.error(`${DIR}/ does not exist`); process.exit(2) }
const tree = snapshot()

// ── the append-only log: one terse entry, one line per write family ─────────
function logAppend(lines) {
  const head = existsSync(LOG) ? '' : '# submit log — append-only, written by submit (nothing submit-related lives outside .sakal/)\n'
  appendFileSync(LOG, `${head}\n## ${TS}\n${lines.map(l => `- ${l}`).join('\n')}\n`)
}

if (MODE === 'log') {
  logAppend([opt('--log', '')].concat(NOTES))
  console.log(`  logged to ${LOG}`)
  process.exit(0)
}

if (MODE === 'write' || MODE === 'rebaseline') {
  let receipt
  if (MODE === 'write' && ACKS.length) {
    // Per-write acked receipts: ONLY acked records land; "Sent N" = acked-N.
    // F-9: and only the acked FAMILIES within each record are claimed.
    receipt = loadBaseline() ?? { stories: {}, epics: {}, journeys: {} }
    if (receipt === undefined) { console.error('  receipt unreadable — recover with --rebaseline first'); process.exit(1) }
    receipt = migrate(receipt).receipt
    const missing = []
    // --sent fields | --sent cites:<item>|<item> (per-ITEM within a family:
    // 3 of 5 cites sent is three acked items, not a delivered family).
    const sentSpec = new Map()
    for (const s of SENT) { const i = s.indexOf(':'); const fam = i < 0 ? s : s.slice(0, i); const items = i < 0 ? null : s.slice(i + 1).split(',').filter(Boolean); sentSpec.set(fam, items) }
    if (!SENT.length && !HELD.length) sentSpec.set('*', null)   // legacy: whole record
    for (const a of ACKS) {
      const [kind, key] = a.split('/')
      const rec = tree[kind]?.[key]
      if (!rec) { missing.push(a); continue }
      const prev = receipt[kind][key]
      const next = { ...rec, _sent: { ...(prev?._sent ?? {}) } }
      for (const f of FAMILIES_ALL) {
        if (rec[f] === undefined) continue
        if (sentSpec.has('*') || sentSpec.has(f)) {
          const items = sentSpec.get(f) ?? null
          next._sent[f] = items ? { items } : { acked: true }
        } else if (!next._sent[f]) next._sent[f] = { held_back: 'not named in the ack' }
      }
      for (const h of HELD) next._sent[h.family] = { held_back: h.why }
      receipt[kind][key] = next
    }
    for (const k of ['stories', 'epics', 'journeys']) receipt[k] = sortObj(receipt[k])
    if (missing.length) { console.error(`  REFUSED — acked records not in the tree: ${missing.join(', ')} (an ack must name what was actually sent)`); process.exit(1) }
  } else {
    if (MODE === 'rebaseline') {
      console.log('  RE-BASELINE — the old receipt is lost or unreadable. The FULL snapshot below becomes the new receipt;')
      console.log('  review it: anything the server holds beyond it will refuse as in-app drift on the next submit.\n')
      console.log(serialize(tree))
    }
    // A full write claims delivery of everything it snapshots — legitimate
    // only right after a submit that sent everything; --ack is the honest
    // path when families were held back.
    receipt = tree
    for (const kind of ['stories', 'epics', 'journeys']) for (const rec of Object.values(receipt[kind]))
      rec._sent = Object.fromEntries(FAMILIES_ALL.filter(f => rec[f] !== undefined).map(f => [f, { acked: true }]))
    for (const h of HELD) for (const kind of ['stories', 'epics', 'journeys']) for (const rec of Object.values(receipt[kind]))
      if (rec[h.family] !== undefined) rec._sent[h.family] = { held_back: h.why }
    receipt._schema = SCHEMA
    receipt[HEADER] = NOTE_TEXT
  }
  // Confirmed mappings are part of the committed receipt (P-M3 as amended).
  if (MAPS.length) {
    receipt.mappings ??= {}
    for (const m of MAPS.filter(m => m.base !== 'new')) {
      const story = m.tree.replace(/-[a-z]$/, '')
      receipt.mappings[story] = [...new Set([...(receipt.mappings[story] ?? []), `${m.tree}<=${m.base}`])].sort()
    }
    receipt.mappings = sortObj(receipt.mappings)
  }
  writeFileSync(BASE, serialize(receipt))
  const counts = ['stories', 'epics', 'journeys'].map(k => `${k} ${Object.keys(receipt[k] ?? {}).length}`).join(' · ')
  console.log(`  receipt ${ACKS.length ? `updated: ${ACKS.length} write(s) acked` : 'written (full)'} — ${counts}`)
  console.log('  Committed, deliberately — the receipt travels with the branch.')
  if (MODE === 'write') {
    const fam = { stories: [], epics: [], journeys: [] }
    for (const a of ACKS) { const [k, key] = a.split('/'); (fam[k] ??= []).push(key) }
    const famLines = ACKS.length
      ? Object.entries(fam).filter(([, v]) => v.length).map(([k, v]) => `${k} ${v.length} acked: ${v.sort().join(' ')}`)
      : [`full receipt: ${counts}`]
    if (MAPS.length) famLines.push(`mappings confirmed: ${MAPS.map(m => `${m.tree}=${m.base}`).sort().join(' ')}`)
    logAppend(famLines.concat(NOTES))
    console.log(`  logged to ${LOG}`)
  }
  process.exit(0)
}

// ── the corrective (F-9): re-derive ONE family against SERVER truth ─────────
// Hand-edits of receipts end with this finding. The tool reads what the
// server actually holds (the read-back's `records.<kind>.<key>.<family>`)
// and rewrites that family's claim: matched values stay acked, unmatched
// claims are downgraded (to-ADD next pass), and a server-denied claim is
// named in the diff. Without a read-back it REFUSES — trusting either side
// unread is exactly how F-9 happened.
if (MODE === 'correct') {
  const family = CORRECT
  if (!FAMILIES_ALL.includes(family)) { console.error(`  --correct <family>: one of ${FAMILIES_ALL.join(', ')}`); process.exit(2) }
  let receipt = loadBaseline()
  if (receipt === undefined || receipt === null) { console.error(`  ${BASE} is missing or unreadable — nothing to correct (--rebaseline creates one).`); process.exit(1) }
  const server = SERVER && existsSync(SERVER) ? JSON.parse(readFileSync(SERVER, 'utf8')) : null
  const records = server?.records ?? null
  if (!records) {
    console.log('  REFUSED — cannot verify against a server I cannot read.')
    console.log(`    --server must supply a read-back carrying \`records.<kind>.<key>.${family}\` (for cites: the citations listed per AC).`)
    console.log('    An older server, or a hosted MCP that predates the list tools, cannot answer this — do not correct blind:')
    console.log('    a receipt corrected against silence is the F-9 defect with a new date.')
    process.exit(1)
  }
  const { receipt: migrated, migrated: nMig } = migrate(receipt)
  receipt = migrated
  const diff = { verified: [], toAdd: [], denied: [], untouched: 0 }
  for (const kind of ['stories', 'epics', 'journeys']) for (const [key, rec] of Object.entries(receipt[kind] ?? {})) {
    if (rec[family] === undefined) { diff.untouched++; continue }
    const srv = records[kind]?.[key]?.[family]
    if (srv === undefined) { diff.untouched++; continue }   // server said nothing about this record
    const claimed = Array.isArray(rec[family]) ? rec[family] : [rec[family]]
    const held = Array.isArray(srv) ? srv : [srv]
    const heldSet = new Set(held.map(String))
    const confirmed = claimed.filter(c => heldSet.has(String(c)))
    const denied = claimed.filter(c => !heldSet.has(String(c)))
    if (denied.length) diff.denied.push({ kind, key, denied })
    if (confirmed.length) diff.verified.push({ kind, key, n: confirmed.length })
    // The receipt now claims exactly what the server confirms.
    rec._sent ??= {}
    rec._sent[family] = confirmed.length
      ? { items: confirmed.map(String) }
      : { held_back: `corrected ${TS}: the server holds none of this family for this record` }
    if (denied.length) diff.toAdd.push(...denied.map(d => `${key}: ${d}`))
  }
  console.log(`\n  CORRECTIVE — family "${family}" re-derived against server truth${nMig ? ` (${nMig} pre-F-9 record(s) migrated to schema ${SCHEMA})` : ''}`)
  console.log(`    verified (server confirms the claim): ${diff.verified.reduce((a, v) => a + v.n, 0)} item(s) across ${diff.verified.length} record(s)`)
  console.log(`    DENIED by the server (receipt claimed, server does not hold) → to-ADD next pass: ${diff.toAdd.length}`)
  for (const d of diff.toAdd.slice(0, 10)) console.log(`      ${d}`)
  if (diff.toAdd.length > 10) console.log(`      … ${diff.toAdd.length - 10} more`)
  console.log(`    records the server said nothing about (left untouched, still unverified): ${diff.untouched}`)
  if (!args.includes('--dry-run')) {
    writeFileSync(BASE, serialize(receipt))
    logAppend([`corrective: ${family} re-derived against server read-back — ${diff.toAdd.length} denied claim(s) downgraded to to-ADD, ${diff.verified.length} record(s) confirmed`])
    console.log(`\n  ${BASE} rewritten; ${LOG} records the correction. Other families are byte-untouched.`)
  } else console.log('\n  --dry-run: nothing written.')
  process.exit(0)
}

// ── check ───────────────────────────────────────────────────────────────────
const out = { firstSubmit: false, threeWay: [], acPlans: [], unresolved: [], retextUnderEvidence: [], textFree: [], citesToAdd: [], citesIdentical: 0, citesVanished: [], notDelivered: [], notes: [] }
const tSet2 = st => new Set(st.cites)
let baseline = null
if (!existsSync(BASE)) {
  out.firstSubmit = true
  out.notes.push('no baseline — first submit for this tree: nothing to refuse; everything is a create. Ack writes into the receipt as they land (--write --ack kind/key).')
} else {
  baseline = loadBaseline()
  if (baseline === undefined) {
    console.error(`  REFUSED — ${BASE} exists but cannot be parsed. The receipt is corrupt.`)
    console.error('  Recover with --rebaseline: it prints the FULL snapshot that becomes the new receipt, then writes it.')
    process.exit(1)
  }
}

// Deterministic similarity: token Jaccard over normalised words. RANKS only.
const tokens = s => new Set(normWS(s).toLowerCase().split(' ').filter(Boolean))
const score = (a, b) => {
  const ta = tokens(a), tb = tokens(b)
  const inter = [...ta].filter(x => tb.has(x)).length
  const union = new Set([...ta, ...tb]).size
  return union ? Math.round((inter / union) * 100) : 0
}

if (baseline) {
  // P-M5 first — one refusal at a time: server drift defers everything else.
  const server = SERVER && existsSync(SERVER) ? JSON.parse(readFileSync(SERVER, 'utf8')) : null
  const records = server?.records ?? null
  if (!records) out.notes.push('server state carries no field values (SKM-038 read-back not deployed here) — three-way degrades to baseline-vs-tree; in-app edits cannot be detected until it ships')
  else for (const kind of ['stories', 'epics', 'journeys']) for (const [key, srv] of Object.entries(records[kind] ?? {})) {
    const b = baseline[kind]?.[key]
    if (!b) continue
    for (const [field, sv] of Object.entries(srv.fields ?? {}))
      if (b.fields?.[field] !== undefined && String(sv) !== String(b.fields[field]))
        out.threeWay.push({ kind, key, field, server: String(sv), baseline: String(b.fields[field]) })
  }

  if (!out.threeWay.length) for (const [key, st] of Object.entries(tree.stories)) {
    const b = baseline.stories?.[key]
    if (!b) continue
    const citesOn = id => (b.cites ?? []).filter(c => c.startsWith(`${id}|`)).length
    const sameSet = b.acs.length === st.acs.length && b.acs.every((id, i) => id === st.acs[i])
    if (sameSet) {
      for (const id of st.acs) {
        if ((b.acTexts?.[id] ?? '') === (st.acTexts[id] ?? '')) continue
        const n = citesOn(id)
        if (n) out.retextUnderEvidence.push({ id, cites: n, old: b.acTexts[id], next: st.acTexts[id] })
        else out.textFree.push(`${id}: text changed under a stable id, no evidence on the row — flows freely (scenario A)`)
      }
    } else {
      // P-M3 permanent: content-match the changed set.
      const bIds = [...b.acs], tIds = [...st.acs]
      const mapped = []   // {tree, base, textChanged}
      const explicit = new Map(MAPS.map(m => [m.tree, m.base]))
      // exact content matches, unique both sides
      for (const t of [...tIds]) {
        const cands = bIds.filter(bid => (b.acTexts?.[bid] ?? '') === (st.acTexts[t] ?? ''))
        if (cands.length === 1 && tIds.filter(x => (st.acTexts[x] ?? '') === (b.acTexts?.[cands[0]] ?? '')).length === 1) {
          mapped.push({ tree: t, base: cands[0], textChanged: false })
          bIds.splice(bIds.indexOf(cands[0]), 1); tIds.splice(tIds.indexOf(t), 1)
        }
      }
      // operator-confirmed mappings
      for (const t of [...tIds]) {
        const target = explicit.get(t)
        if (!target) continue
        if (target === 'new') { mapped.push({ tree: t, base: null, textChanged: false }); tIds.splice(tIds.indexOf(t), 1); continue }
        if (!bIds.includes(target)) { out.notes.push(`--map ${t}=${target}: ${target} is not an unmatched receipt row — ignored`); continue }
        mapped.push({ tree: t, base: target, textChanged: (b.acTexts?.[target] ?? '') !== (st.acTexts[t] ?? '') })
        bIds.splice(bIds.indexOf(target), 1); tIds.splice(tIds.indexOf(t), 1)
      }
      // the rest: suggestions rank, never decide
      for (const t of tIds) {
        const ranked = bIds.map(bid => ({ bid, s: score(st.acTexts[t] ?? '', b.acTexts?.[bid] ?? '') })).sort((a, z) => z.s - a.s || a.bid.localeCompare(z.bid))
        if (ranked.length && ranked[0].s >= 50)
          out.unresolved.push({ story: key, tree: t, suggestions: ranked.filter(r => r.s >= 50).slice(0, 3) })
        else mapped.push({ tree: t, base: null, textChanged: false })   // new row
      }
      const orphanRows = bIds.filter(bid => !out.unresolved.some(u => u.suggestions.some(s => s.bid === bid)))
      out.acPlans.push({ story: key, confirmed: CONFIRM, baseline: b.acs, tree: st.acs, mapped, orphanRows })
      for (const m of mapped) if (m.base && m.textChanged && citesOn(m.base))
        out.retextUnderEvidence.push({ id: `${key}:${m.tree}<=${m.base}`, cites: citesOn(m.base), old: b.acTexts[m.base], next: st.acTexts[m.tree] })
    }
    // P-M4 cites — F-9: only DELIVERED cites count as identical. A family
    // held back, unverified, or never named in an ack is ABSENT to this gate,
    // however complete the tree's copy looks.
    const delivered = deliveredFamily(b, 'cites')
    const bSet = new Set(delivered ?? [])
    if (delivered === undefined && (b.cites ?? []).length) out.notDelivered.push(`${key}: cites ${familyState(b, 'cites')} — ${(b.cites ?? []).length} claim(s) in the receipt were never acked as sent; treated as ABSENT`)
    for (const c of st.cites) if (!bSet.has(c)) out.citesToAdd.push(c)
    for (const c of (delivered ?? [])) if (!tSet2(st).has(c)) out.citesVanished.push(c)
    out.citesIdentical += st.cites.filter(c => bSet.has(c)).length
    for (const f of ['fields', 'acTexts']) if (b[f] !== undefined && deliveredFamily(b, f) === undefined)
      out.notDelivered.push(`${key}: ${f} ${familyState(b, f)} — re-send; the receipt claims no delivery`)
  }
}

if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)) }
else {
  if (out.firstSubmit) console.log(`  ${out.notes[0]}`)
  for (const t of out.textFree) console.log(`  ${t}`)
  if (out.citesToAdd.length) console.log(`  cites to ADD (${out.citesToAdd.length}): ${out.citesToAdd.slice(0, 5).join(' · ')}${out.citesToAdd.length > 5 ? ' …' : ''}`)
  if (out.citesIdentical) console.log(`  cites identical (SKIP — SKM-039 makes a re-add a no-op, a pre-039 server would DUPLICATE): ${out.citesIdentical}`)
  if (out.citesVanished.length) { console.log('  cites VANISHED from the tree (FLAGGED, never deleted — deleting evidence is a human act):'); for (const c of out.citesVanished) console.log(`    ${c}`) }
  if (out.notDelivered.length) {
    // Grouped by family + state: a per-record dump of a migrated tree is
    // hundreds of lines nobody reads, and an unread gate is no gate.
    const grouped = new Map()
    for (const n of out.notDelivered) {
      const m = n.match(/^(\S+): (\w+) ([^—]+)—/)
      const k = m ? `${m[2]} ${m[3].trim()}` : 'other'
      if (!grouped.has(k)) grouped.set(k, [])
      grouped.get(k).push(m ? m[1] : n)
    }
    console.log(`  NOT DELIVERED (F-9) — the receipt records the TRANSMISSION; these families were never acked as sent, so they are to-ADD, not identical:`)
    for (const [k, keys] of grouped) console.log(`    ${k}: ${keys.length} record(s) — ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ` … +${keys.length - 3}` : ''}`)
    console.log('    `--correct <family> --server <read-back>` re-derives one family against server truth; unverified = a pre-F-9 receipt that never recorded its transmission.')
  }
  for (const n of out.notes.slice(out.firstSubmit ? 1 : 0)) console.log(`  ${n}`)
}

let refused = false
if (out.threeWay.length) {
  refused = true
  console.log('\n  REFUSED — the server moved since the last submit (in-app edits). Converging over them would clobber:')
  for (const t of out.threeWay) console.log(`    ${t.kind}/${t.key} · ${t.field}: server "${t.server}" ≠ baseline "${t.baseline}"`)
  console.log('  Reconcile by hand, then re-run. AC mapping is DEFERRED until this is resolved — one refusal at a time.')
} else {
  if (out.acPlans.length && !CONFIRM) {
    refused = true
    console.log('\n  REFUSED — the AC set changed since the last submit. Letters are ADDRESSES; rows keep their uuid.')
    for (const g of out.acPlans) console.log(`    ${g.story}:\n      baseline: ${g.baseline.join(' ')}\n      tree:     ${g.tree.join(' ')}`)
    console.log('  Deliberate? Re-run with --confirm-ac-changes; content matching then converges what is provably the same')
    console.log('  and refuses the rest with ranked suggestions (thresholds rank, never decide).')
  }
  if (CONFIRM && out.unresolved.length) {
    refused = true
    console.log('\n  REFUSED — content matching left ambiguity; a score never moves data. Confirm each mapping or split:')
    for (const u of out.unresolved) for (const s of u.suggestions)
      console.log(`    tree ${u.tree} resembles receipt row ${s.bid} at ${s.s}% — confirm with --map ${u.tree}=${s.bid}, or --map ${u.tree}=new`)
  }
  if (out.retextUnderEvidence.length) {
    if (!CONFIRM) refused = true
    console.log(`\n  ${CONFIRM ? 'CONFIRMED (surfaced for the record)' : 'REFUSED'} — re-texting under evidence (P-M6): the row's citations attest the OLD wording:`)
    for (const r of out.retextUnderEvidence) {
      console.log(`    ${r.id} (${r.cites} citation(s)):`)
      console.log(`      old: ${r.old.length > 70 ? r.old.slice(0, 70) + '…' : r.old}`)
      console.log(`      new: ${r.next.length > 70 ? r.next.slice(0, 70) + '…' : r.next}`)
    }
    console.log('  SKM-040\'s trigger resets verification on re-text server-side; against a server predating SKM-040 the')
    console.log('  verifier state does NOT auto-reset — run the verify sweep after submitting. ' + (CONFIRM ? '' : 'Proceed with --confirm-ac-changes.'))
  }
  if (CONFIRM && !refused && out.acPlans.length) {
    console.log('\n  CONFIRMED — the convergence plan (rows keep uuids; letters recompute as display addresses):')
    for (const g of out.acPlans) {
      for (const m of g.mapped) {
        if (m.base && m.tree === m.base && !m.textChanged) continue
        if (m.base) console.log(`    ${g.story}: row ${m.base} → address ${m.tree}${m.textChanged ? ' + update_ac_text (surfaced above if evidenced)' : ' (text unchanged)'}`)
        else console.log(`    ${g.story}: ${m.tree} is a NEW row (create_ac)`)
      }
      for (const o of g.orphanRows) console.log(`    ${g.story}: receipt row ${o} unmatched — ORPHAN-AC on the server; flagged, never deleted`)
      console.log(`    ${g.story}: reorder to ${g.tree.join(' ')} recomputes the display addresses`)
    }
    console.log('  Record the mapping in the receipt when acking: --write --ack stories/<key> --map <tree>=<row> …')
  }
}
process.exit(refused ? 1 : 0)
