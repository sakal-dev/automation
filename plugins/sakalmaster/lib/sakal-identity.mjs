#!/usr/bin/env node
// =============================================================================
// sakal-identity — host and app identity, resolved by reading or refused
// (SKA-035 · F-3, F-5; F-4's consumption is the planner's half).
//
// The disease this cures, named in the F345 contract: an identity decision
// made without a read path, defaulting to ACTION instead of REFUSAL.
//   Host ← session state.   Apps ← create-on-miss.
// After this: each is a read or a refusal. Identity is never inherited from
// "whichever MCP happens to be connected" — the least trustworthy source in
// the system — and an app is never conjured because a lookup missed.
//
// F-3 · HOST
//   config `target_host` is the DECLARATION and it is the truth: the
//   connection must match it, never vice versa. Mismatch → REFUSE naming
//   both values and the split-brain risk; the only fix is editing the
//   config. `FILL-AT-SUBMIT` + a connected server → SHOW-AND-ASK (never
//   inherit); `--adopt` records the operator's answer on first success.
//
// F-5 · APP
//   Match existing apps on TWO axes before any create verdict: the declared
//   key, and the tree's git origin against `apps.github_repo` (the better
//   key, and it was in hand all along). Either axis hits → converge onto
//   that row, reporting WHICH axis. Both hit different rows → CONFLICT,
//   refuse with both. Neither → SHOW-AND-ASK, never silent creation.
//   Keys are surface names (`garage-flutter`), per the recorded ruling.
//
//   node sakal-identity.mjs --server state.json [--dir .sakal] [--repo-root .]
//                           [--adopt] [--interactive] [--json]
//
// The state file is what the caller read back (sakal_list_registry supplies
// apps with their github_repo). Exit: 0 resolved · 1 refused/ask · 2 bad call.
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readScalars } from './sakal-shared.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const DIR = opt('--dir', '.sakal')
const ROOT = opt('--repo-root', '.')
const SERVER = opt('--server', null)
const ADOPT = args.includes('--adopt')
const INTERACTIVE = args.includes('--interactive')
const JSON_OUT = args.includes('--json')

const cfgPath = join(DIR, 'config.yaml')
if (!existsSync(cfgPath)) { console.error(`${cfgPath} does not exist`); process.exit(2) }
let cfgText = readFileSync(cfgPath, 'utf8')
const cfg = k => readScalars(cfgText)[k]?.value
const PLACEHOLDER = v => v == null || v === '' || /^FILL-AT-SUBMIT$/i.test(v) || /^</.test(v)

if (!SERVER) { console.error('--server <state.json> is required — identity is READ, never assumed'); process.exit(2) }
if (!existsSync(SERVER)) {
  // "target_host set but server unreachable" — name WHICH, never silently
  // fall through to a different host.
  console.log('REFUSED — no server read-back was supplied, so identity cannot be resolved.')
  console.log(`  declared target_host: ${cfg('target_host') ?? '(none)'}`)
  console.log('  If the host is unreachable, say so and stop — do NOT submit against whatever else is connected.')
  process.exit(1)
}
const server = JSON.parse(readFileSync(SERVER, 'utf8'))
const connectedHost = server.host ?? server.target_host ?? null

const out = { host: { declared: cfg('target_host') ?? null, connected: connectedHost, verdict: null }, app: { declared: cfg('app') ?? null, origin: null, verdict: null, axis: null, row: null, candidates: [] }, refusals: [], asks: [], writes: [] }

// ── F-3 · host ──────────────────────────────────────────────────────────────
const declaredHost = cfg('target_host')
if (!connectedHost) out.host.verdict = 'unknown-connection'
else if (PLACEHOLDER(declaredHost)) {
  out.host.verdict = ADOPT ? 'adopted' : 'ask'
  if (ADOPT) out.writes.push(['target_host', connectedHost])
  else out.asks.push(`config.yaml says \`target_host: ${declaredHost ?? '(unset)'}\` and the connected server is ${connectedHost}.\n    Identity is NEVER inherited from whichever MCP is connected. Confirm this is the intended host:\n    re-run with --adopt to record it, or edit config.yaml by hand.`)
} else if (declaredHost !== connectedHost) {
  out.host.verdict = 'mismatch'
  out.refusals.push(`HOST MISMATCH — the declaration is the truth; the connection must match it, never the other way around.\n    config target_host: ${declaredHost}\n    connected server:   ${connectedHost}\n    Submitting anyway would SPLIT THE BRAIN: half this project's records on one host, half on another, each\n    looking complete and neither being. Fix by editing config.yaml (deliberately), or connect the declared host.`)
} else out.host.verdict = 'match'

// Project, same doctrine. A PLACEHOLDER is not a mismatch — it is the
// unfilled declaration this run may record (with --adopt), never inherit.
if (server.project && PLACEHOLDER(cfg('project'))) {
  if (ADOPT) out.writes.push(['project', server.project])
  else out.asks.push(`config.yaml has no project declared (\`${cfg('project') ?? 'unset'}\`); the connected server resolved "${server.project}".\n    Confirm and record it with --adopt, or write it by hand.`)
} else if (server.project && cfg('project') && server.project !== cfg('project'))
  out.refusals.push(`PROJECT MISMATCH — config declares "${cfg('project')}", the server resolved "${server.project}". Fix the declaration; nothing was written.`)
if (server.project_id && PLACEHOLDER(cfg('target_project_id')) && ADOPT) out.writes.push(['target_project_id', server.project_id])

// ── F-5 · app resolver ──────────────────────────────────────────────────────
// apps come as strings (legacy state) or {key, github_repo} rows (list_registry).
const apps = (server.apps ?? []).map(a => typeof a === 'string' ? { key: a, github_repo: null } : a)
let origin = null
try {
  const m = execFileSync('git', ['-C', ROOT, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim().match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)
  if (m) origin = m[1]
} catch { /* no git / no origin */ }
out.app.origin = origin

const declaredApp = cfg('app')
if (declaredApp) {
  const byKey = apps.find(a => a.key === declaredApp) ?? null
  const byRepo = origin ? apps.find(a => a.github_repo && a.github_repo.replace(/\.git$/, '') === origin) ?? null : null
  out.app.candidates = [byKey, byRepo].filter(Boolean).map(a => a.key)

  if (byKey && byRepo && byKey.key !== byRepo.key) {
    out.app.verdict = 'conflict'
    out.refusals.push(`APP IDENTITY CONFLICT — two different rows claim this tree; picking one would be a guess:\n    by key   "${declaredApp}"  → app ${byKey.key}${byKey.github_repo ? ` (repo ${byKey.github_repo})` : ' (no repo linked)'}\n    by repo  "${origin}" → app ${byRepo.key}\n    Decide in the app: move the repo link, or fix the declared key. Nothing was written.`)
  } else if (byKey && byRepo) {
    out.app.verdict = 'match'; out.app.axis = 'key+repo'; out.app.row = byKey.key
  } else if (byKey) {
    out.app.verdict = 'match'; out.app.axis = 'key'; out.app.row = byKey.key
    if (origin && byKey.github_repo && byKey.github_repo.replace(/\.git$/, '') !== origin) {
      out.app.verdict = 'origin-drift'
      out.refusals.push(`ORIGIN DRIFT — app "${byKey.key}" is linked to ${byKey.github_repo}, but this tree's git origin is ${origin}.\n    Origin does NOT win automatically: identity is at stake, and a moved remote and a wrong declaration look identical from here.\n    Decide it — re-link the app (set_app_repo) or fix the tree's remote — then re-run.`)
    }
  } else if (byRepo) {
    out.app.verdict = 'match'; out.app.axis = 'repo'; out.app.row = byRepo.key
    out.asks.push(`config declares app \`${declaredApp}\`, but the row linked to this repo (${origin}) is \`${byRepo.key}\`.\n    Converging onto \`${byRepo.key}\` by the REPO axis (the better key). Confirm, or fix the declaration; --adopt records it.`)
    if (ADOPT) { out.writes.push(['app', byRepo.key]); out.asks.pop() }
  } else {
    out.app.verdict = 'ask-create'
    out.asks.push(`no app matches key \`${declaredApp}\`${origin ? ` or repo \`${origin}\`` : ' (this tree has no git origin to match on)'} in project "${server.project ?? cfg('project')}".\n    Creation is NEVER silent. Choose: create app \`${declaredApp}\` (keys are SURFACE NAMES, not repo names), or\n    name an existing app to converge onto, or stop. Known apps: ${apps.map(a => a.key).join(', ') || '(none read back)'}`)
  }
}

// ── report ──────────────────────────────────────────────────────────────────
if (JSON_OUT) console.log(JSON.stringify(out, null, 2))
else {
  console.log(`\n  host: declared ${out.host.declared ?? '(unset)'} · connected ${out.host.connected ?? '(unknown)'} → ${out.host.verdict}`)
  if (out.app.declared) console.log(`  app:  declared ${out.app.declared} · origin ${out.app.origin ?? '(none)'} → ${out.app.verdict}${out.app.axis ? ` (matched by ${out.app.axis}: ${out.app.row})` : ''}`)
  if (out.host.verdict === 'unknown-connection') console.log('  note: the read-back names no host — the caller should include it; identity checking is degraded, say so before writing.')
}

for (const r of out.refusals) console.log(`\n  REFUSED — ${r}`)
if (out.asks.length && !out.refusals.length) {
  console.log(`\n  SHOW-AND-ASK — a decision only the operator can make:`)
  for (const a of out.asks) console.log(`    ${a}`)
  if (!INTERACTIVE) console.log(`\n  This session cannot ask. Re-run interactively, or record the answer:\n    node ${process.argv[1].replace(/^.*\/(?=lib\/)/, '')} --server <state.json> --dir ${DIR} --adopt`)
}
if (out.writes.length && !out.refusals.length) {
  for (const [k, v] of out.writes) {
    cfgText = new RegExp(`^${k}:`, 'm').test(cfgText)
      ? cfgText.replace(new RegExp(`^${k}:.*$`, 'm'), `${k}: ${v}`)
      : cfgText.replace(/\n*$/, '\n') + `${k}: ${v}\n`
  }
  writeFileSync(cfgPath, cfgText)
  console.log(`\n  RECORDED in ${cfgPath} (identity is written once, then enforced): ${out.writes.map(([k, v]) => `${k}=${v}`).join(' · ')}`)
}
process.exit(out.refusals.length || out.asks.length ? 1 : 0)
