#!/usr/bin/env bash
# workers/lib/lifecycle.sh — the ONE claim/brief/report/release lifecycle,
# shared by headless-loop (method 4) and sdk-worker (method 5). Source this;
# do not fork it — the contract (docs/task-contract.md) allows exactly one
# lifecycle, and the SOURCE switch lives HERE, never in the workers.
#
# Env contract (see headless-loop/env.example):
#   SOURCE=github|sakalmaster  REPO=owner/name
#   github:      GH_TOKEN (PAT with issues+contents+pr write)
#   sakalmaster: SAKAL_URL SAKAL_ANON_KEY SAKAL_TOKEN PROJECT [APP]
#
# Exports after claim: TASK_REF (issue number | task key), RUN_ID (sakal),
# BRIEF_FILE (assembled brief path).

# ── auth (sakal) ────────────────────────────────────────────────────────────
sakal_jwt() {
  curl -sf -X POST "$SAKAL_URL/functions/v1/token-exchange" \
    -H "apikey: $SAKAL_ANON_KEY" -H "content-type: application/json" \
    -d "{\"token\":\"$SAKAL_TOKEN\"}" | jq -r '.access_token // empty'
}
sakal_rpc() { # $1=fn $2=json
  local jwt; jwt=$(sakal_jwt) || return 1
  curl -sf -X POST "$SAKAL_URL/rest/v1/rpc/$1" \
    -H "apikey: $SAKAL_ANON_KEY" -H "authorization: Bearer $jwt" \
    -H "content-type: application/json" -d "$2"
}

# ── claim ───────────────────────────────────────────────────────────────────
# Sets TASK_REF (and RUN_ID for sakal). Returns 1 when nothing is claimable.
claim() {
  if [ "$SOURCE" = "github" ]; then
    # oldest actionable claude-ready issue; label-claim is check-then-act —
    # the small race is accepted in github mode (the DB lease in sakal mode
    # is exact); a lost race self-heals via claude-done/release-all.
    # REST throughout (gh api), NOT `gh issue list/edit`: those are GraphQL,
    # and a shared user PAT's GraphQL pool drains under heavy sweep days —
    # observed live 2026-07-23: a release retried 4 times into an empty pool
    # and the claim stuck. REST rides a separate, roomier limit.
    TASK_REF=$(gh api "repos/$REPO/issues?state=open&labels=claude-ready&per_page=100" --jq \
      '[.[] | select(.pull_request | not) | select(([.labels[].name] | index("claude-blocked") or index("claude-working")) | not)] | sort_by(.number) | .[0].number // empty')
    [ -z "$TASK_REF" ] && return 1
    gh api -X POST "repos/$REPO/issues/$TASK_REF/labels" -f "labels[]=claude-working" >/dev/null
    echo "[claim] github issue #$TASK_REF"
  else
    local payload='{"p_project":"'"$PROJECT"'","p_source":"manual","p_lease_seconds":'"${LEASE_SECONDS:-1800}"'}'
    if [ -n "${APP:-}" ]; then payload=$(jq -c --arg a "$APP" '. + {p_app:$a}' <<<"$payload"); fi
    local c; c=$(sakal_rpc claim_next_task "$payload") || return 1
    RUN_ID=$(jq -r '.[0].run_id // empty' <<<"$c"); TASK_REF=$(jq -r '.[0].task_key // empty' <<<"$c")
    STORY_KEY=$(jq -r '.[0].story_key // empty' <<<"$c")
    [ -z "$RUN_ID" ] && return 1
    echo "[claim] sakal task $TASK_REF (run $RUN_ID)"
  fi
}

# ── brief ───────────────────────────────────────────────────────────────────
# One brief format for every executor (same standing block as the dispatch
# skill). Writes BRIEF_FILE.
brief() {
  BRIEF_FILE="$WORKDIR/brief.md"
  {
    if [ "$SOURCE" = "github" ]; then
      gh issue view "$TASK_REF" -R "$REPO" --json title,body --jq '"# " + .title + "\n\n" + .body'
      local closes="Closes #$TASK_REF"
    else
      echo "# SakalMaster task $TASK_REF (story ${STORY_KEY:--}, run $RUN_ID)"
      echo
      echo "Fetch your brief from SakalMaster (env has SAKAL_URL/SAKAL_ANON_KEY/SAKAL_TOKEN):"
      echo 'JWT=$(curl -s -X POST "$SAKAL_URL/functions/v1/token-exchange" -H "apikey: $SAKAL_ANON_KEY" -H "content-type: application/json" -d "{\"token\":\"$SAKAL_TOKEN\"}" | jq -r .access_token)'
      echo "then read the story + ACs: /rest/v1/stories?key=eq.${STORY_KEY}&select=*,acs(*)"
      echo "Report lifecycle with report_run/block_run (run id $RUN_ID); after"
      echo "reporting succeeded, park the task: set_task_agent_ready p_ready:=false."
      local closes="SakalMaster task: $TASK_REF"
    fi
    cat <<EOF

---
Standing instructions (identical for every executor — do not deviate):
Work ONLY on this task, in $REPO, on a branch claude/issue-$TASK_REF-<slug>.
First run ./tool/setup.sh; treat ./tool/verify.sh as the merge gate — it MUST
exit 0 before you open a PR. Never touch .github/**, tool/**, gradle/keystore
files, or .env*. Respect the Out-of-scope section literally. VERIFY-FIRST:
check every AC against the code before writing anything. Open ONE PR whose
body begins \`$closes\`; do NOT merge it — a label-gated automerge workflow
judges it. Do not take or scan for any other work.
EOF
  } > "$BRIEF_FILE"
}

# ── report / release (the trap target — EVERY exit path lands here) ─────────
# usage: finish <succeeded|failed|blocked|released> [detail]
finish() {
  local outcome="${1:-released}" detail="${2:-}"
  if [ "$SOURCE" = "github" ]; then
    case "$outcome" in
      blocked)
        gh api -X POST "repos/$REPO/issues/$TASK_REF/comments" -f body="Blocked: $detail" >/dev/null 2>&1 || true
        gh api -X POST "repos/$REPO/issues/$TASK_REF/labels" -f "labels[]=claude-blocked" >/dev/null 2>&1 || true ;;
    esac
    # the label release — unconditional, idempotent, every path, WITH RETRY,
    # via REST (a stuck release was observed live when the GraphQL pool was
    # empty: 4 retries into the same dead pool). REST DELETE 404s harmlessly
    # when the label is already gone; secondary-rate collisions (two replicas
    # stopping in parallel on one token) still make per-replica tokens the
    # rule — the retry covers whatever remains.
    if [ -n "${TASK_REF:-}" ]; then
      for backoff in 0 3 8 20; do
        sleep "$backoff"
        if gh api -X DELETE "repos/$REPO/issues/$TASK_REF/labels/claude-working" >/dev/null 2>&1; then break; fi
        # a 404 (already absent) exits non-zero — verify before retrying:
        gh api "repos/$REPO/issues/$TASK_REF" --jq '.labels[].name' 2>/dev/null | grep -qx claude-working || break
      done
    fi
  else
    [ -z "${RUN_ID:-}" ] && return 0
    case "$outcome" in
      succeeded)
        sakal_rpc report_run "{\"p_project\":\"$PROJECT\",\"p_run\":\"$RUN_ID\",\"p_status\":\"succeeded\",\"p_pr_ref\":$(jq -Rn --arg v "$detail" '$v')}" >/dev/null || true
        sakal_rpc set_task_agent_ready "{\"p_project\":\"$PROJECT\",\"p_task\":\"$TASK_REF\",\"p_ready\":false}" >/dev/null || true ;;
      blocked)
        sakal_rpc block_run "{\"p_project\":\"$PROJECT\",\"p_run\":\"$RUN_ID\",\"p_reason\":$(jq -Rn --arg v "$detail" '$v')}" >/dev/null || true ;;
      *)
        sakal_rpc report_run "{\"p_project\":\"$PROJECT\",\"p_run\":\"$RUN_ID\",\"p_status\":\"failed\",\"p_error\":$(jq -Rn --arg v "${detail:-terminated without outcome}" '$v')}" >/dev/null || true ;;
    esac
  fi
  echo "[finish] $outcome ${detail:+($detail)}"
}

heartbeat() {
  [ "$SOURCE" = "sakalmaster" ] && [ -n "${RUN_ID:-}" ] && \
    sakal_rpc report_run "{\"p_project\":\"$PROJECT\",\"p_run\":\"$RUN_ID\",\"p_status\":\"running\",\"p_lease_seconds\":${LEASE_SECONDS:-1800}}" >/dev/null 2>&1 || true
}
