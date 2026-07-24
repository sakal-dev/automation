#!/usr/bin/env bash
#
# test-sakal-source.sh — exercise the integrated-mode seams (claim-sakal /
# report-sakal / the sweep's sakal steps) against a SakalMaster stack with
# plain curl, in seconds. The runnable spec for session 4's STEP 5.
#
#   SAKAL_URL        stack URL            (default: local supabase, :54341)
#   SAKAL_ANON_KEY   anon key             (default: read from `supabase status` locally)
#   SAKAL_TOKEN      a sakal_pat_… PAT    (required unless LOCAL_BOOTSTRAP=1)
#   PROJECT          project uuid         (required unless LOCAL_BOOTSTRAP=1)
#   TASK_KEY         a task to make agent-ready for the claim test (bootstrap picks one)
#   LOCAL_BOOTSTRAP  =1: log in as the seeded dev user, mint a PAT, pick the
#                    seeded project + a task, set it agent-ready. LOCAL ONLY.
#
# What it proves, in order:
#   1 token-exchange: PAT → short-lived JWT
#   2 claim_next_task returns the seeded agent-ready task (atomic lease)
#   3 report_run heartbeat + progress (lease extended)
#   4 report_run succeeded with a fake PR ref
#   5 empty queue → clean "none" (the cheap-gate contract)
#   6 second task → claim → block_run raises the question (visible in Needs-me)
#   7 the runs are visible via the read view (Team · Agents' source)
# App-filter test (claim with wrong app → nothing) is COMMENTED until
# sakal-dev/sakalmaster#1 lands.
set -euo pipefail

SAKAL_URL="${SAKAL_SUPABASE_URL:-${SAKAL_URL:-http://127.0.0.1:54341}}"
SAKAL_ANON_KEY="${SAKAL_SUPABASE_PUBLISHABLE_KEY:-${SAKAL_ANON_KEY:-}}"
pass=0; fail=0
ok()   { pass=$((pass+1)); printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad()  { fail=$((fail+1)); printf '  \033[31mFAIL\033[0m %s\n' "$*"; }
note() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

if [ "${LOCAL_BOOTSTRAP:-0}" = "1" ]; then
  note "LOCAL_BOOTSTRAP: dev login → PAT → seeded project/task"
  SAKAL_ANON_KEY="${SAKAL_ANON_KEY:-$(cd "${SAKALMASTER_DIR:-../SakalMaster}" && supabase status -o json 2>/dev/null | jq -r .ANON_KEY)}"
  USER_JWT=$(curl -sf -X POST "$SAKAL_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $SAKAL_ANON_KEY" -H "content-type: application/json" \
    -d '{"email":"dev@sakal.local","password":"sakalmaster"}' | jq -r .access_token)
  UAUTH=(-H "apikey: $SAKAL_ANON_KEY" -H "authorization: Bearer $USER_JWT" -H "content-type: application/json")
  SAKAL_TOKEN=$(curl -sf -X POST "$SAKAL_URL/rest/v1/rpc/create_access_token" "${UAUTH[@]}" \
    -d '{"p_name":"test-sakal-source","p_scopes":["read","write"]}' | jq -r '.[0].token // .token')
  PROJECT=$(curl -sf "$SAKAL_URL/rest/v1/projects?select=id&limit=1" "${UAUTH[@]}" | jq -r '.[0].id')
  # two open tasks for the claim + block tests
  TASKS=$(curl -sf "$SAKAL_URL/rest/v1/tasks?select=key&project_id=eq.$PROJECT&status=not.in.(done,blocked)&limit=2" "${UAUTH[@]}" | jq -r '.[].key')
  for t in $TASKS; do
    curl -sf -X POST "$SAKAL_URL/rest/v1/rpc/set_task_agent_ready" "${UAUTH[@]}" \
      -d "{\"p_project\":\"$PROJECT\",\"p_task\":\"$t\",\"p_ready\":true}" > /dev/null
  done
  note "project=$PROJECT tasks=[$(echo $TASKS | tr '\n' ' ')]"
fi

: "${SAKAL_ANON_KEY:?SAKAL_ANON_KEY required}"; : "${SAKAL_TOKEN:?SAKAL_TOKEN required}"; : "${PROJECT:?PROJECT required}"
RPC="$SAKAL_URL/rest/v1/rpc"

note "1. token-exchange"
JWT=$(curl -sf -X POST "$SAKAL_URL/functions/v1/token-exchange" \
  -H "apikey: $SAKAL_ANON_KEY" -H "content-type: application/json" \
  -d "{\"token\":\"$SAKAL_TOKEN\"}" | jq -r '.access_token // empty')
[ -n "$JWT" ] && ok "PAT exchanged for JWT" || { bad "token-exchange"; exit 1; }
AUTH=(-H "apikey: $SAKAL_ANON_KEY" -H "authorization: Bearer $JWT" -H "content-type: application/json")

note "2. claim_next_task (seeded agent-ready task)"
C1=$(curl -sf -X POST "$RPC/claim_next_task" "${AUTH[@]}" \
  -d "{\"p_project\":\"$PROJECT\",\"p_source\":\"manual\",\"p_lease_seconds\":120}")
RUN1=$(echo "$C1" | jq -r '.[0].run_id // empty'); T1=$(echo "$C1" | jq -r '.[0].task_key // empty')
[ -n "$RUN1" ] && ok "claimed $T1 (run $RUN1)" || bad "claim returned nothing (is a task agent-ready?)"

note "3. heartbeat + progress"
curl -sf -X POST "$RPC/report_run" "${AUTH[@]}" \
  -d "{\"p_project\":\"$PROJECT\",\"p_run\":\"$RUN1\",\"p_status\":\"running\"}" >/dev/null && ok heartbeat || bad heartbeat
curl -sf -X POST "$RPC/report_run" "${AUTH[@]}" \
  -d "{\"p_project\":\"$PROJECT\",\"p_run\":\"$RUN1\",\"p_status\":\"running\",\"p_summary\":\"test progress line\"}" >/dev/null && ok progress || bad progress

note "4. succeeded with fake PR ref, then PARK the task"
curl -sf -X POST "$RPC/report_run" "${AUTH[@]}" \
  -d "{\"p_project\":\"$PROJECT\",\"p_run\":\"$RUN1\",\"p_status\":\"succeeded\",\"p_pr_ref\":\"sakal-dev/example#0\"}" >/dev/null \
  && ok "outcome recorded (no AC changed — the verifier is the judge)" || bad succeeded
# FINDING (2026-07-22): a succeeded run does NOT retire its task — the task
# stays claimable until marked done by merge/verification flows. Executors
# must therefore park it (agent_ready=false) after reporting success, or a
# chained sweep re-claims the same task. The sweep prompt encodes this.
curl -sf -X POST "$RPC/set_task_agent_ready" "${AUTH[@]}" \
  -d "{\"p_project\":\"$PROJECT\",\"p_task\":\"$T1\",\"p_ready\":false}" >/dev/null \
  && ok "task parked (agent_ready=false) — chain cannot re-claim it" || bad "park task"

note "6. claim second task → block_run"
C2=$(curl -sf -X POST "$RPC/claim_next_task" "${AUTH[@]}" \
  -d "{\"p_project\":\"$PROJECT\",\"p_source\":\"manual\",\"p_lease_seconds\":120}")
RUN2=$(echo "$C2" | jq -r '.[0].run_id // empty'); T2=$(echo "$C2" | jq -r '.[0].task_key // empty')
if [ -n "$RUN2" ]; then
  ok "claimed $T2 (run $RUN2)"
  curl -sf -X POST "$RPC/block_run" "${AUTH[@]}" \
    -d "{\"p_project\":\"$PROJECT\",\"p_run\":\"$RUN2\",\"p_reason\":\"test question: which API shape? (from test-sakal-source.sh)\"}" >/dev/null \
    && ok "blocked — question raised into Needs-me" || bad block_run
else
  bad "second claim (need two agent-ready tasks for the block test)"
fi

note "5. empty queue → clean none (park everything still agent-ready first)"
for t in $(curl -sf "$SAKAL_URL/rest/v1/tasks?select=key&project_id=eq.$PROJECT&agent_ready=eq.true" "${AUTH[@]}" | jq -r '.[].key'); do
  curl -sf -X POST "$RPC/set_task_agent_ready" "${AUTH[@]}" \
    -d "{\"p_project\":\"$PROJECT\",\"p_task\":\"$t\",\"p_ready\":false}" >/dev/null || true
done
C3=$(curl -sf -X POST "$RPC/claim_next_task" "${AUTH[@]}" \
  -d "{\"p_project\":\"$PROJECT\",\"p_source\":\"manual\",\"p_lease_seconds\":120}")
[ "$(echo "$C3" | jq 'length')" = "0" ] && ok "empty claim returns none (cheap gate)" || bad "expected empty claim"

note "7. runs visible (Team · Agents source)"
RUNS=$(curl -sf "$SAKAL_URL/rest/v1/agent_runs?select=id,status&id=in.($RUN1,$RUN2)" "${AUTH[@]}" | jq -r 'map(.status) | join(",")')
echo "  statuses: $RUNS"
[[ "$RUNS" == *succeeded* && "$RUNS" == *blocked* ]] && ok "both runs recorded with correct statuses" || bad "run statuses: $RUNS"

# note "8. app filter — ENABLE WHEN sakal-dev/sakalmaster#1 LANDS"
# curl ... claim_next_task -d '{...,"p_app":"wrong-app"}' → expect empty

echo; note "RESULT: $pass passed, $fail failed"
[ "$fail" = "0" ]
