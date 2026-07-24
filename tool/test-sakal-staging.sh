#!/usr/bin/env bash
#
# test-sakal-staging.sh — the STAGING-SAFE variant of test-sakal-source.sh
# (session 9, step 1). Same coverage, one crucial difference: it must NOT
# consume the seeded flip task — no `succeeded`, no lasting park. Final
# state == initial state (task agent-ready, claimable), so the flip that
# follows gets the exact task the human seeded.
#
# Env (no LOCAL_BOOTSTRAP here — staging creds are explicit):
#   SAKAL_URL SAKAL_ANON_KEY SAKAL_TOKEN PROJECT APP WRONG_APP
#   APP        = the app key the claimant is bound to (garage)
#   WRONG_APP  = a VALID key of a DIFFERENT app (unknown keys RAISE, by design)
#
# The 10 checks (mapping to the local suite in test-sakal-source.sh):
#   1 token-exchange                          (=local 1)
#   2 filtered claim p_app=APP → seeded task  (=local 2, + app filter POSITIVE)
#   3 heartbeat + progress                    (=local 3)
#   4 block_run → run blocked (Needs-me)      (=local 6)
#   5 wrong-app claim → none                  (app filter NEGATIVE)
#   6 unknown-app claim → error raised        (find_id contract)
#   7 lease expiry → filtered re-claim; old run abandoned  (lease semantics)
#   8 report failed → task stays claimable, UNPARKED       (=local 4 inverse)
#   9 park → claim none (cheap gate) → UNPARK              (=local 5 + restore)
#  10 agent_runs shows blocked→abandoned + failed rows     (=local 7)
# `succeeded`+park is deliberately NOT exercised here — proven 10/10 locally,
# and the live flip itself proves it on staging minutes later.
set -euo pipefail
SAKAL_URL="${SAKAL_SUPABASE_URL:-${SAKAL_URL:-}}"
SAKAL_ANON_KEY="${SAKAL_SUPABASE_PUBLISHABLE_KEY:-${SAKAL_ANON_KEY:-}}"
: "${SAKAL_URL:?set SAKAL_SUPABASE_URL}"; : "${SAKAL_ANON_KEY:?set SAKAL_SUPABASE_PUBLISHABLE_KEY}"; : "${SAKAL_TOKEN:?}"; : "${PROJECT:?}"; : "${APP:?}"; : "${WRONG_APP:?}"
LEASE=90
pass=0; fail=0
ok()   { pass=$((pass+1)); printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad()  { fail=$((fail+1)); printf '  \033[31mFAIL\033[0m %s\n' "$*"; }
note() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
RPC="$SAKAL_URL/rest/v1/rpc"

note "1. token-exchange"
JWT=$(curl -sf -X POST "$SAKAL_URL/functions/v1/token-exchange" \
  -H "apikey: $SAKAL_ANON_KEY" -H "content-type: application/json" \
  -d "{\"token\":\"$SAKAL_TOKEN\"}" | jq -r '.access_token // empty')
[ -n "$JWT" ] && ok "PAT exchanged" || { bad token-exchange; exit 1; }
AUTH=(-H "apikey: $SAKAL_ANON_KEY" -H "authorization: Bearer $JWT" -H "content-type: application/json")
jwt_refresh() { JWT=$(curl -sf -X POST "$SAKAL_URL/functions/v1/token-exchange" -H "apikey: $SAKAL_ANON_KEY" -H "content-type: application/json" -d "{\"token\":\"$SAKAL_TOKEN\"}" | jq -r .access_token); AUTH=(-H "apikey: $SAKAL_ANON_KEY" -H "authorization: Bearer $JWT" -H "content-type: application/json"); }

note "2. filtered claim (p_app=$APP) → the seeded task"
C1=$(curl -sf -X POST "$RPC/claim_next_task" "${AUTH[@]}" \
  -d "{\"p_project\":\"$PROJECT\",\"p_source\":\"manual\",\"p_lease_seconds\":$LEASE,\"p_app\":\"$APP\"}")
RUN1=$(jq -r '.[0].run_id // empty' <<<"$C1"); T1=$(jq -r '.[0].task_key // empty' <<<"$C1"); S1=$(jq -r '.[0].story_key // empty' <<<"$C1")
[ -n "$RUN1" ] && ok "claimed $T1 (story $S1, run ${RUN1:0:8}…)" || bad "filtered claim returned none"

note "3. heartbeat + progress"
curl -sf -X POST "$RPC/report_run" "${AUTH[@]}" -d "{\"p_project\":\"$PROJECT\",\"p_run\":\"$RUN1\",\"p_status\":\"running\",\"p_lease_seconds\":$LEASE}" >/dev/null && ok heartbeat || bad heartbeat
curl -sf -X POST "$RPC/report_run" "${AUTH[@]}" -d "{\"p_project\":\"$PROJECT\",\"p_run\":\"$RUN1\",\"p_status\":\"running\",\"p_summary\":\"staging pre-flip check (test-sakal-staging.sh)\",\"p_lease_seconds\":$LEASE}" >/dev/null && ok progress || bad progress

note "4. block_run → question raised (check Needs-me in the UI)"
curl -sf -X POST "$RPC/block_run" "${AUTH[@]}" \
  -d "{\"p_project\":\"$PROJECT\",\"p_run\":\"$RUN1\",\"p_reason\":\"staging pre-flip check: does the question reach Needs-me? (test artifact — resolve freely)\"}" >/dev/null \
  && ok "blocked" || bad block_run

note "5. wrong-app claim (p_app=$WRONG_APP) → none"
C2=$(curl -sf -X POST "$RPC/claim_next_task" "${AUTH[@]}" \
  -d "{\"p_project\":\"$PROJECT\",\"p_source\":\"manual\",\"p_lease_seconds\":$LEASE,\"p_app\":\"$WRONG_APP\"}")
[ "$(jq 'length' <<<"$C2")" = "0" ] && ok "wrong app sees nothing" || bad "wrong app claimed: $C2"

note "6. unknown-app claim → raises"
if curl -sf -X POST "$RPC/claim_next_task" "${AUTH[@]}" \
  -d "{\"p_project\":\"$PROJECT\",\"p_source\":\"manual\",\"p_lease_seconds\":$LEASE,\"p_app\":\"no-such-app-xyz\"}" >/dev/null 2>&1; then
  bad "unknown app did not raise"
else ok "unknown app key raises (find_id contract)"; fi

note "7. lease expiry (${LEASE}s) → filtered re-claim; blocked run abandoned"
sleep $((LEASE + 5)); jwt_refresh
C3=$(curl -sf -X POST "$RPC/claim_next_task" "${AUTH[@]}" \
  -d "{\"p_project\":\"$PROJECT\",\"p_source\":\"manual\",\"p_lease_seconds\":$LEASE,\"p_app\":\"$APP\"}")
RUN2=$(jq -r '.[0].run_id // empty' <<<"$C3"); T2=$(jq -r '.[0].task_key // empty' <<<"$C3")
[ "$T2" = "$T1" ] && [ "$RUN2" != "$RUN1" ] && ok "re-claimed $T1 on a fresh run after expiry" || bad "re-claim: got '$T2' run '$RUN2'"

note "8. report failed → task stays claimable, unparked"
curl -sf -X POST "$RPC/report_run" "${AUTH[@]}" \
  -d "{\"p_project\":\"$PROJECT\",\"p_run\":\"$RUN2\",\"p_status\":\"failed\",\"p_error\":\"staging pre-flip check — expected artifact\"}" >/dev/null && ok "failed reported" || bad report_failed

note "9. park → empty claim → UNPARK (restore seeded state)"
curl -sf -X POST "$RPC/set_task_agent_ready" "${AUTH[@]}" -d "{\"p_project\":\"$PROJECT\",\"p_task\":\"$T1\",\"p_ready\":false}" >/dev/null
C4=$(curl -sf -X POST "$RPC/claim_next_task" "${AUTH[@]}" \
  -d "{\"p_project\":\"$PROJECT\",\"p_source\":\"manual\",\"p_lease_seconds\":$LEASE,\"p_app\":\"$APP\"}")
[ "$(jq 'length' <<<"$C4")" = "0" ] && ok "parked queue is empty (cheap gate)" || bad "parked queue still claimable"
curl -sf -X POST "$RPC/set_task_agent_ready" "${AUTH[@]}" -d "{\"p_project\":\"$PROJECT\",\"p_task\":\"$T1\",\"p_ready\":true}" >/dev/null && ok "unparked — seeded state restored"

note "10. agent_runs rows visible (Team · Agents source)"
RUNS=$(curl -sf "$SAKAL_URL/rest/v1/agent_runs?select=status&id=in.($RUN1,$RUN2)" "${AUTH[@]}" | jq -r 'map(.status)|sort|join(",")')
echo "  statuses: $RUNS"
[[ "$RUNS" == *abandoned* && "$RUNS" == *failed* ]] && ok "blocked→abandoned + failed recorded" || bad "unexpected: $RUNS"

echo; note "RESULT: $pass passed, $fail failed"
[ "$fail" = "0" ]
