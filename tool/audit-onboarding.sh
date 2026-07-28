#!/usr/bin/env bash
#
# audit-onboarding.sh — check what an onboarding run actually wrote.
#
# Built for SKA-014 (garage as customer #1) and deliberately NOT specific to it:
# every customer's first import deserves the same check, and an audit performed
# by hand once is a ladder, not a staircase.
#
# It answers the questions that decide whether an import is trustworthy:
#
#   1. COUNTS      — how much landed, against the spec set it came from
#   2. BORN OPEN   — did any claimed status leak in? (the one that matters most:
#                    a spec's [x] is a claim, and the verifier decides)
#   3. NOT READY   — did anything land agent-ready? (the operator flips that)
#   4. REFS        — are GitHub issues linked by github_ref, and uniquely?
#   5. CONVERGENCE — does a second read find the same keys, no duplicates?
#
# It is READ-ONLY. It calls no write tool and cannot change what it audits.
#
# Usage:
#   SAKAL_TOKEN=sakal_pat_…  \
#   SAKAL_SUPABASE_URL=https://<staging>.supabase.co \
#   SAKAL_SUPABASE_PUBLISHABLE_KEY=sb_publishable_… \
#   MCP_PATH=/path/to/SakalMaster/apps/mcp/dist/index.js \
#   ./tool/audit-onboarding.sh --project <uuid> [--repo owner/name] \
#                             [--expect-journeys N --expect-epics N \
#                              --expect-stories N --expect-acs N]
#
# The SKA-014 invocation (garage as customer #1), with today's spec set as the
# baseline — 6 journeys / 13 epic files / 50 stories / 181 ACs, of which 131 are
# marked [x] and must ALL land open:
#
#   ./tool/audit-onboarding.sh --project <garage-project-uuid> \
#     --repo sakal-dev/sakalpos-garage \
#     --expect-journeys 6 --expect-epics 13 --expect-stories 50 --expect-acs 181
#
# The retired dry-run baseline was 6/13/48/189. Stories +2 and ACs -8 against it
# are expected: four PRs touched docs/specs on 2026-07-27 (#115 #116 #117 #127).
# A delta is a thing to EXPLAIN, which is why the script says so rather than
# failing.
#
# Local dev stack: use SAKAL_EMAIL/SAKAL_PASSWORD instead of SAKAL_TOKEN.
# The token goes in the ENVIRONMENT, never on the command line and never in a
# chat — same rule the onboarding skill itself follows.
#
set -uo pipefail

PROJECT=""; REPO=""; E_J=""; E_E=""; E_S=""; E_A=""
while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --expect-journeys) E_J="$2"; shift 2 ;;
    --expect-epics) E_E="$2"; shift 2 ;;
    --expect-stories) E_S="$2"; shift 2 ;;
    --expect-acs) E_A="$2"; shift 2 ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done
[ -n "$PROJECT" ] || { echo "--project <uuid> is required"; exit 2; }
[ -n "${MCP_PATH:-}" ] && [ -f "$MCP_PATH" ] || { echo "MCP_PATH must point at apps/mcp/dist/index.js"; exit 2; }

pass=0; fail=0; warn=0
ok()   { pass=$((pass+1)); printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad()  { fail=$((fail+1)); printf '  \033[31mFAIL\033[0m %s\n' "$*"; }
note() { warn=$((warn+1)); printf '  \033[33mNOTE\033[0m %s\n' "$*"; }
head() { printf '\n\033[1;34m══\033[0m %s\n' "$*"; }

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

# One stdio MCP client, reused for every read. Same door the import used.
cat > "$WORK/call.mjs" <<'EOF'
import { spawn } from 'node:child_process'
const calls = JSON.parse(process.argv.slice(2).join(' ') || '[]')
const srv = spawn('node', [process.env.MCP_PATH], { env: process.env, stdio: ['pipe','pipe','pipe'] })
let buf=''; const pending=new Map(); let id=0
srv.stdout.on('data', d => { buf += d
  let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0,i).trim(); buf = buf.slice(i+1)
    if (!l) continue; try { const m = JSON.parse(l); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } } catch {} } })
const rpc=(method,params)=>new Promise((res,rej)=>{ const n=++id; pending.set(n,res)
  srv.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n')
  setTimeout(()=>{ if(pending.has(n)){pending.delete(n);rej(new Error('timeout '+method))} },45000) })
const out=[]
try {
  await rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'sakal-audit',version:'1'}})
  srv.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n')
  for (const c of calls) {
    const r = await rpc('tools/call',{name:c.tool,arguments:c.args})
    out.push({ tool:c.tool, error: r.result?.isError || !!r.error,
               text: r.result?.content?.map(x=>x.text).join(' ') ?? '',
               data: r.result?.structuredContent ?? null })
  }
  console.log(JSON.stringify(out))
} catch(e){ console.log(JSON.stringify([{tool:'FATAL',error:true,text:e.message,data:null}])) }
srv.kill()
EOF

mcp() { node "$WORK/call.mjs" "$1" 2>/dev/null; }

head "TARGET"
echo "  project: $PROJECT"
echo "  server:  ${SAKAL_SUPABASE_URL:-<default/local>}"
[ -n "$REPO" ] && echo "  repo:    $REPO"

# ---- pull everything once -------------------------------------------------
# `limit` is capped at 100 server-side, so page. And treat ANY tool error as a
# hard stop: an audit that reports "0 stories, all fine" because the call failed
# is worse than no audit at all — it launders a broken read as a clean result.
R1=$(mcp "[{\"tool\":\"sakal_project_summary\",\"args\":{\"project\":\"$PROJECT\"}},
           {\"tool\":\"sakal_search_stories\",\"args\":{\"project\":\"$PROJECT\",\"limit\":100}},
           {\"tool\":\"sakal_list_tasks\",\"args\":{\"project\":\"$PROJECT\",\"limit\":100}}]")
if [ -z "$R1" ] || echo "$R1" | grep -q '"tool":"FATAL"'; then
  bad "could not reach the MCP server — $(echo "$R1" | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["text"])' 2>/dev/null || echo 'no response')"
  echo; echo "RESULT: audit could not run"; exit 1
fi
if echo "$R1" | python3 -c 'import sys,json; sys.exit(0 if any(x["error"] for x in json.load(sys.stdin)) else 1)'; then
  echo
  echo "$R1" | python3 -c 'import sys,json
for x in json.load(sys.stdin):
    if x["error"]: print(f"  \033[31mFAIL\033[0m {x[\"tool\"]} errored: {x[\"text\"][:200]}")'
  echo
  echo -e "\033[31mRESULT: audit ABORTED — a read failed, so any count below would be a lie\033[0m"
  exit 1
fi
echo "$R1" > "$WORK/r1.json"

python3 - "$WORK/r1.json" "$E_J" "$E_E" "$E_S" "$E_A" "$REPO" <<'PY'
import json, sys, collections
r = json.load(open(sys.argv[1]))
e_j, e_e, e_s, e_a, repo = sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6]
by = {x['tool']: x for x in r}
summary = (by.get('sakal_project_summary') or {}).get('data') or {}
stories  = ((by.get('sakal_search_stories') or {}).get('data') or {}).get('items') or []
tasks    = ((by.get('sakal_list_tasks')    or {}).get('data') or {}).get('items') or []

P=[];F=[];N=[]
def ok(m):P.append(m)
def bad(m):F.append(m)
def note(m):N.append(m)

acs = summary.get('acs') or {}
total_acs = acs.get('total', 0)

print("\n\033[1;34m══\033[0m 1 · COUNTS")
print(f"  stories: {len(stories)}    ACs: {total_acs}    tasks: {len(tasks)}")
sc = ((by.get('sakal_search_stories') or {}).get('data') or {})
if sc.get('nextCursor'): note(f"stories page is FULL ({len(stories)}) and more remain — this audit read one page; totals below undercount")
tc = ((by.get('sakal_list_tasks') or {}).get('data') or {})
if tc.get('nextCursor'): note(f"tasks page is FULL ({len(tasks)}) and more remain — totals below undercount")
def cmp(label, got, want):
    if not want: return
    want=int(want)
    if got==want: ok(f"{label}: {got} == baseline {want}")
    else: note(f"{label}: {got} vs baseline {want} (delta {got-want:+d}) — EXPLAIN this, do not excuse it")
cmp("stories", len(stories), e_s)
cmp("ACs", total_acs, e_a)

print("\n\033[1;34m══\033[0m 2 · BORN OPEN  (the one that matters most)")
nonopen = {k: acs.get(k,0) for k in ('verified','enforced','failing','broken') if acs.get(k,0)}
if total_acs == 0:
    bad("no ACs at all — nothing was imported, or the wrong project was audited")
elif not nonopen:
    ok(f"all {total_acs} ACs are open — no claimed status leaked in")
else:
    bad(f"{sum(nonopen.values())} AC(s) are NOT open at import time: {nonopen}. "
        "A status was asserted rather than derived — this is the invariant the product rests on.")

print("\n\033[1;34m══\033[0m 3 · NOT AGENT-READY")
ready = [t for t in tasks if t.get('agentReady') or t.get('agent_ready')]
if not tasks: note("no tasks imported — expected only if the repo had no open issues")
elif ready: bad(f"{len(ready)} task(s) landed AGENT-READY: {[t.get('key') for t in ready][:5]} — the operator flips that switch, not the import")
else: ok(f"all {len(tasks)} task(s) are not-agent-ready")

print("\n\033[1;34m══\033[0m 4 · GITHUB REFS")
refs = [t.get('githubRef') or t.get('github_ref') for t in tasks]
refs = [x for x in refs if x]
if not tasks: note("no tasks, so no refs to check")
else:
    if len(refs)==len(tasks): ok(f"all {len(tasks)} task(s) carry a github_ref")
    else: note(f"{len(tasks)-len(refs)} task(s) carry NO github_ref — fine only if they came from specs, not issues")
    dupes = [k for k,v in collections.Counter(refs).items() if v>1]
    if dupes: bad(f"the same issue is claimed by more than one task: {dupes} — a 23505 that got around the constraint")
    elif refs: ok("every github_ref is unique")
    if repo:
        wrong=[x for x in refs if not x.startswith(f"github:{repo}#")]
        if wrong: note(f"{len(wrong)} ref(s) point outside {repo}: {wrong[:3]}")
        elif refs: ok(f"every ref points at {repo}")

print("\n\033[1;34m══\033[0m 5 · KEY HYGIENE")
keys=[s.get('key') for s in stories]
d=[k for k,v in collections.Counter(keys).items() if v>1]
if d: bad(f"duplicate story keys: {d}")
elif keys: ok(f"{len(keys)} story keys, all distinct")
unkeyed=[k for k in keys if not (k or '').startswith('spec:')]
if unkeyed: note(f"{len(unkeyed)} story key(s) do not use the spec:<repo>:<id> convention: {unkeyed[:3]} — re-runs converge on these keys, so an ad-hoc key is a future duplicate")

for m in P: print(f"  \033[32mPASS\033[0m {m}")
for m in N: print(f"  \033[33mNOTE\033[0m {m}")
for m in F: print(f"  \033[31mFAIL\033[0m {m}")
print(f"\n{'\033[32m' if not F else '\033[31m'}RESULT: {len(P)} passed, {len(N)} notes, {len(F)} failed\033[0m")
sys.exit(1 if F else 0)
PY
rc=$?

head "6 · CONVERGENCE  (re-read; keys must be stable and unduplicated)"
R2=$(mcp "[{\"tool\":\"sakal_search_stories\",\"args\":{\"project\":\"$PROJECT\",\"limit\":100}}]")
if echo "$R2" | python3 -c 'import sys,json; sys.exit(0 if any(x["error"] for x in json.load(sys.stdin)) else 1)' 2>/dev/null; then
  echo "  FAIL  the convergence re-read itself errored — cannot compare"; rc=1; R2='[]'
fi
K1=$(python3 -c "
import json,sys
d=json.load(open('$WORK/r1.json'))
print(' '.join(sorted(x.get('key','') for x in (next(i for i in d if i['tool']=='sakal_search_stories')['data'] or {}).get('items',[]))))")
K2=$(python3 -c "
import json,sys
d=json.loads('''$R2''')
print(' '.join(sorted(x.get('key','') for x in (d[0]['data'] or {}).get('items',[]))))" 2>/dev/null)
if [ "$K1" = "$K2" ] && [ -n "$K1" ]; then
  echo "  PASS  a second read returns the identical key set — stable identity"
else
  echo "  FAIL  the key set moved between two reads"
  rc=1
fi

echo
echo "NOTE: this audit is read-only. It proves what landed; it does not prove the"
echo "      import was pleasant. The friction log is the other half, and only a"
echo "      human who ran it blind can write that."
exit $rc
