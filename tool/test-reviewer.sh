#!/usr/bin/env bash
#
# test-reviewer.sh — the runnable spec for the REVIEWER role (SKA-011).
#
# Exercises the real scripts (actions/review-agent/{preflight,submit}.sh)
# through a `gh` shim that records every write, so the assertions are about
# what the reviewer WOULD DO to a repository, not about a re-implementation.
#
# The rules worth having a test for are the ones that fail silently in
# production: reviewing as the author (GitHub answers 422 and the loop just
# goes quiet), reviewing the same commit twice, approving a diff nobody could
# honestly have read, and posting findings with no verdict — which looks like a
# review and decides nothing.
#
#   ./tool/test-reviewer.sh        run everything
#   ./tool/test-reviewer.sh -v     also print each scenario's log
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERBOSE=0; [ "${1:-}" = "-v" ] && VERBOSE=1
pass=0; fail=0
ok()   { pass=$((pass+1)); printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad()  { fail=$((fail+1)); printf '  \033[31mFAIL\033[0m %s\n' "$*"; }
note() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
FIXTURE="$WORK/fixture"; mkdir -p "$FIXTURE" "$WORK/bin" "$FIXTURE/contents"
export FIXTURE

cat > "$WORK/bin/gh" <<'SHIM'
#!/usr/bin/env bash
args=("$@"); jqf=""; method="GET"; use_stdin=0
for ((i=0;i<${#args[@]};i++)); do
  [ "${args[$i]}" = "--jq" ] && jqf="${args[$((i+1))]}"
  [ "${args[$i]}" = "-X" ]   && method="${args[$((i+1))]}"
  [ "${args[$i]}" = "--input" ] && use_stdin=1
done
emit() { if [ -n "$jqf" ]; then jq -r "$jqf" <<<"$1"; else printf '%s\n' "$1"; fi; }
f() { cat "$FIXTURE/$1" 2>/dev/null || echo '{}'; }
rec() { echo "$*" >> "$FIXTURE/calls.log"; }

if [ "${args[0]}" = "label" ]; then rec "label ${args[1]} ${args[2]}"; exit 0; fi
[ "${args[0]}" != "api" ] && { rec "UNEXPECTED ${args[*]}"; exit 9; }

target=""
for a in "${args[@]}"; do case "$a" in repos/*|graphql) target="$a"; break ;; esac; done

if [ "$method" = "POST" ]; then
  payload=""
  [ "$use_stdin" = "1" ] && payload="$(cat)"
  case "$target" in
    */reviews)
      rec "POST review"
      [ -n "$payload" ] && printf '%s' "$payload" > "$FIXTURE/posted-review.json"
      # -f body=... form (the degraded paths)
      for ((i=0;i<${#args[@]};i++)); do
        case "${args[$i]}" in
          event=*) echo "${args[$i]#event=}" > "$FIXTURE/posted-event.txt" ;;
          body=*)  printf '%s' "${args[$i]#body=}" > "$FIXTURE/posted-body.txt" ;;
        esac
      done
      if [ -f "$FIXTURE/reviews-fail" ]; then cat "$FIXTURE/reviews-fail"; exit 1; fi
      echo '{"html_url":"https://github.com/acme/widget/pull/1#pullrequestreview-999"}'; exit 0 ;;
    */labels)   rec "POST label $(printf '%s\n' "${args[@]}" | grep -o 'labels\[\]=.*' | head -1)"; echo '{}'; exit 0 ;;
    */comments) rec "POST issue-comment"; echo '{}'; exit 0 ;;
    *) rec "POST $target"; echo '{}'; exit 0 ;;
  esac
fi

case "$target" in
  */pulls/*/reviews*) emit "$(f reviews.json)" ;;
  */pulls/*/files*)  emit "$(f files.json)" ;;
  */pulls/*)         emit "$(f pr.json)" ;;
  */contents/*)
      p="${target#*/contents/}"; p="${p%%\?*}"; b="$(basename "$p")"
      if [ -f "$FIXTURE/contents/$b" ]; then
        jq -nc --arg c "$(base64 < "$FIXTURE/contents/$b" | tr -d '\n')" '{content:$c}' | { [ -n "$jqf" ] && jq -r "$jqf" || cat; }
      else exit 1; fi ;;
  */issues/*)        emit "$(f issue.json)" ;;
  *) rec "UNHANDLED $target"; exit 9 ;;
esac
SHIM
chmod +x "$WORK/bin/gh"
export PATH="$WORK/bin:$PATH"

# ---------------------------------------------------------------------------
reset() {
  rm -f "$FIXTURE"/*.json "$FIXTURE"/*.txt "$FIXTURE"/calls.log "$FIXTURE"/reviews-fail
  rm -f "$FIXTURE"/contents/*
  echo '[]' > "$FIXTURE/reviews.json"
  echo '{"labels":[]}' > "$FIXTURE/issue.json"
  mkpr; mkfiles "src/app.ts"
}
mkpr() {
  jq -n --arg author "${AUTHOR:-claude[bot]}" --arg state "${STATE:-open}" \
        --argjson draft "${DRAFT:-false}" --arg head "${HEAD:-abc123}" \
        --arg body "${BODY:-}" \
    '{number:1,title:"t",body:$body,state:$state,draft:$draft,
      head:{sha:$head},base:{ref:"main"},user:{login:$author}}' > "$FIXTURE/pr.json"
}
mkfiles() { # each arg: path[:additions:deletions:status:patch]
  local out="[]" a
  for a in "$@"; do
    local p="${a%%|*}" rest="${a#*|}" add=5 del=1 st="modified" patch="+ ordinary line"
    [ "$rest" != "$a" ] && { IFS='|' read -r add del st patch <<< "$rest"; }
    out=$(jq -c --arg p "$p" --argjson ad "${add:-5}" --argjson de "${del:-1}" \
          --arg st "${st:-modified}" --arg pa "${patch:-+ ordinary}" \
          '. + [{filename:$p,additions:$ad,deletions:$de,status:$st,patch:$pa}]' <<<"$out")
  done
  printf '%s' "$out" > "$FIXTURE/files.json"
}

run_pre() {
  local out="$WORK/o.$$"; : > "$out"
  GITHUB_OUTPUT="$out" GH_TOKEN=x REPO=acme/widget PR=1 \
    REVIEWER_KIND="${REVIEWER_KIND:-github-actions}" APP_BOT_LOGIN="sakal-master[bot]" \
    AGENT_AUTHORS="${AGENT_AUTHORS:-claude[bot],claude-bot}" \
    MAX_FILES="${MAX_FILES:-60}" MAX_LINES="${MAX_LINES:-1500}" \
    bash "$ROOT/actions/review-agent/preflight.sh" > "$WORK/l.$$" 2>&1
  [ "$VERBOSE" = "1" ] && sed 's/^/      | /' "$WORK/l.$$" >&2
  cat "$out"
}
val() { grep "^$2=" <<<"$1" | tail -1 | cut -d= -f2-; }

expect_pre() { # label, key, expected
  local o; o="$(run_pre)"; local got; got="$(val "$o" "$2")"
  [ "$got" = "$3" ] && ok "$1 → $2=$got" || bad "$1 — expected $2=$3, got '${got:-<empty>}'"
}

run_submit() {
  local rc
  GH_TOKEN=x REPO=acme/widget PR=1 \
    FINDINGS_FILE="${FF:-$WORK/findings.json}" HEAD="${HEAD:-abc123}" \
    REVIEWER_LOGIN="${RL:-github-actions[bot]}" \
    STOP_MODE="${SM:-}" STOP_REASON="${SR:-}" \
    DANGEROUS="${DG:-[]}" DANGEROUS_COUNT="${DC:-0}" \
    GENERATED="[]" UNMARKED="${UM:-[]}" FILES_COUNT=3 LINES_COUNT=40 \
    COST_NOTE="" CAP=2 GITHUB_OUTPUT="$WORK/so.$$" \
    bash "$ROOT/actions/review-agent/submit.sh" > "$WORK/sl.$$" 2>&1
  rc=$?
  [ "$VERBOSE" = "1" ] && sed 's/^/      | /' "$WORK/sl.$$" >&2
  echo "$rc"
}
findings() { printf '%s' "$1" > "$WORK/findings.json"; }

# ===========================================================================
note "1. IDENTITY — the check that must come before every other check"
# ===========================================================================
reset; AUTHOR="github-actions[bot]" mkpr
expect_pre "PR authored BY the reviewer identity" go false
AUTHOR="github-actions[bot]" mkpr
expect_pre "…and it ESCALATES, it does not skip (a human must be told)" stop_mode escalate
reset
expect_pre "author ≠ reviewer" go true
reset; REVIEWER_KIND=sakalmaster-app expect_pre "App path derives sakal-master[bot]" reviewer_login "sakal-master[bot]"
reset; AUTHOR="sakal-master[bot]" mkpr; AGENT_AUTHORS="sakal-master[bot]" REVIEWER_KIND=sakalmaster-app \
  expect_pre "App reviewing an App-authored PR is unreviewable, not skippable" stop_mode escalate

note "2. ADMISSIBILITY"
reset; DRAFT=true mkpr;                expect_pre "draft PR" go false
reset; STATE=closed mkpr;              expect_pre "closed PR" go false
reset; AUTHOR=socheat mkpr;            expect_pre "a human's PR is not reviewed by the bot" go false
reset; echo '{"labels":[{"name":"review:escalated"}]}' > "$FIXTURE/issue.json"
                                        expect_pre "review:escalated" go false
reset; echo '{"labels":[{"name":"review:broken-anchors"}]}' > "$FIXTURE/issue.json"
                                        expect_pre "review:broken-anchors" go false

note "3. IDEMPOTENCY — never review the same commit twice"
reset
echo '[{"user":{"login":"github-actions[bot]"},"commit_id":"abc123","state":"CHANGES_REQUESTED"}]' > "$FIXTURE/reviews.json"
expect_pre "already reviewed THIS head" go false
reset
echo '[{"user":{"login":"github-actions[bot]"},"commit_id":"OLDSHA","state":"APPROVED"}]' > "$FIXTURE/reviews.json"
expect_pre "reviewed an EARLIER head → new commits deserve a new review" go true
reset
echo '[{"user":{"login":"somebody-else"},"commit_id":"abc123","state":"APPROVED"}]' > "$FIXTURE/reviews.json"
expect_pre "someone else reviewed this head — not my review" go true
reset
echo '[{"user":{"login":"github-actions[bot]"},"commit_id":"abc123","state":"PENDING"}]' > "$FIXTURE/reviews.json"
expect_pre "a crashed run's PENDING draft does not block a fresh review" go true

note "4. SIZE — an honest reviewer says when it cannot read the diff"
reset; mkfiles "a.ts|900|900|modified|+x"
expect_pre "3600 changed lines" stop_mode too-large
reset; mkfiles "a.ts|900|900|modified|+x"; MAX_LINES=5000 expect_pre "…unless the repo raised the limit" go true
reset; mkfiles $(for i in $(seq 1 70); do echo "f$i.ts|1|1|modified|+x"; done)
expect_pre "70 files" stop_mode too-large

note "5. GENERATED FILES — verified by marker, never by filename"
reset; mkfiles "lib/m.g.dart|10|0|modified|+x"
printf '// GENERATED CODE - DO NOT MODIFY BY HAND\nclass X {}\n' > "$FIXTURE/contents/m.g.dart"
o="$(run_pre)"
[ "$(val "$o" generated)" = '["lib/m.g.dart"]' ] && ok "marker present → excluded" || bad "marker present → expected exclusion, got $(val "$o" generated)"
reset; mkfiles "lib/m.g.dart|10|0|modified|+x"
printf 'class HandWritten {}\n' > "$FIXTURE/contents/m.g.dart"
o="$(run_pre)"
[ "$(val "$o" unmarked_generated)" = '["lib/m.g.dart"]' ] && ok "looks generated, says nothing → NAMED" || bad "unmarked → got $(val "$o" unmarked_generated)"
[ "$(val "$o" reviewable)" = '["lib/m.g.dart"]' ] && ok "…and REVIEWED anyway" || bad "unmarked should stay reviewable"
reset; mkfiles "pnpm-lock.yaml|500|10|modified|+x"
o="$(run_pre)"
[ "$(val "$o" generated)" = '["pnpm-lock.yaml"]' ] && ok "a lockfile is generated by definition" || bad "lockfile → $(val "$o" generated)"

note "6. THE DANGEROUS LIST"
danger_kind() { # label, patch, expected kind
  reset; mkfiles "db/x.sql|3|0|modified|$2"
  local o; o="$(run_pre)"
  if jq -e --arg k "$3" 'any(.[]; .kind==$k)' <<<"$(val "$o" dangerous)" >/dev/null 2>&1; then
    ok "$1 → $3"
  else bad "$1 — expected kind '$3', got $(val "$o" dangerous)"; fi
}
danger_kind "DROP TABLE"           "+DROP TABLE users;"                       schema-destruction
danger_kind "DROP COLUMN"          "+ALTER TABLE t DROP COLUMN email;"        schema-destruction
danger_kind "ON DELETE CASCADE"    "+  FOREIGN KEY (x) ON DELETE CASCADE"     delete-cascade
danger_kind "deleteCascade call"   "+  await db.deleteJobCascade(uuid);"      delete-cascade
danger_kind "money path"           "+  final total = price * qty;"            money-or-idempotency
danger_kind "credential"           "+  const apiKey = process.env.API_KEY;"   credential
reset; mkfiles "src/x.ts|0|40|removed|-gone"
o="$(run_pre)"; jq -e 'any(.[]; .kind=="file-deletion")' <<<"$(val "$o" dangerous)" >/dev/null \
  && ok "a deleted file is a signal" || bad "file deletion not flagged"
reset; mkfiles "supabase/migrations/003_x.sql|4|0|added|+create table t();"
o="$(run_pre)"; jq -e 'any(.[]; .kind=="prod-config-or-migration")' <<<"$(val "$o" dangerous)" >/dev/null \
  && ok "a migration is a signal" || bad "migration not flagged"
reset; mkfiles "db/x.sql|3|0|modified|-DROP TABLE users;"
o="$(run_pre)"; [ "$(val "$o" dangerous_count)" = "0" ] \
  && ok "a REMOVED 'DROP TABLE' is the opposite of dangerous" || bad "removed line wrongly flagged"

note "7. VERDICT DISCIPLINE — the submit step refuses an invalid review"
reset
findings '{"summary":"looks fine","findings":[]}'
[ "$(run_submit)" = "1" ] && ok "no verdict → REFUSED (findings without a verdict is not a review)" || bad "missing verdict was accepted"
findings '{"verdict":"maybe","summary":"x","findings":[]}'
[ "$(run_submit)" = "1" ] && ok "nonsense verdict → refused" || bad "bad verdict accepted"
findings '{"verdict":"approve","summary":"","findings":[]}'
[ "$(run_submit)" = "1" ] && ok "approve with no summary → refused (no bare stamps)" || bad "empty summary accepted"
findings '{"verdict":"request-changes","summary":"nope","findings":[]}'
[ "$(run_submit)" = "1" ] && ok "request-changes without what-would-flip-it → refused" || bad "unactionable request-changes accepted"
printf 'not json at all' > "$WORK/findings.json"
[ "$(run_submit)" = "1" ] && ok "unparseable findings → refused, no verdict guessed" || bad "bad JSON accepted"
FF="$WORK/nope.json" ; [ "$(run_submit)" = "1" ] && ok "no findings file → refused (an empty review is not an approval)" || bad "missing file accepted"; unset FF

note "8. VALID REVIEWS reach the API in one atomic call"
reset; findings '{"verdict":"approve","summary":"Checked the ACs against the code; both are met.","findings":[]}'
rc=$(run_submit)
[ "$rc" = "0" ] && ok "approve submits" || bad "approve failed (rc=$rc)"
[ "$(jq -r .event "$FIXTURE/posted-review.json")" = "APPROVE" ] && ok "…as event=APPROVE" || bad "wrong event"
reset; findings '{"verdict":"request-changes","summary":"The guard is in the controller, not the repository.","what_would_flip_it":"Move the status check into JobRepository.deleteDraft and add a refusal test.","findings":[{"file":"src/app.ts","line":12,"severity":"blocker","body":"cascade delete with no status check"}]}'
rc=$(run_submit)
[ "$rc" = "0" ] && ok "request-changes submits" || bad "request-changes failed"
[ "$(jq -r .event "$FIXTURE/posted-review.json")" = "REQUEST_CHANGES" ] && ok "…as event=REQUEST_CHANGES" || bad "wrong event"
[ "$(jq -r '.comments[0].path' "$FIXTURE/posted-review.json")" = "src/app.ts" ] && ok "…with the finding anchored to file:line" || bad "no anchored comment"
grep -q "What would flip this to approve" "$FIXTURE/posted-review.json" && ok "…and the body says what would flip it" || bad "flip text missing"

note "9. THE DANGEROUS LIST OUTRANKS THE VERDICT"
reset; findings '{"verdict":"approve","summary":"Change is correct.","findings":[]}'
DG='[{"kind":"delete-cascade","file":"src/job.dart","evidence":"+ deleteJobCascade"}]' DC=1 rc=$(run_submit)
grep -q "POST label labels\[\]=needs-human-merge" "$FIXTURE/calls.log" \
  && ok "an APPROVE on a cascade delete still gets needs-human-merge" || bad "needs-human-merge not applied"
grep -q "dangerous list" "$FIXTURE/posted-review.json" && ok "…and the review says so out loud" || bad "danger block missing from the body"

note "10. NAMED FAILURE MODES"
reset; findings '{"verdict":"approve","summary":"Fine.","findings":[]}'
echo '{"message":"GitHub Actions is not permitted to approve pull requests"}' > "$FIXTURE/reviews-fail"
rc=$(run_submit)
if grep -q "not permitted to approve" "$WORK/sl.$$" 2>/dev/null || [ "$rc" != "0" ]; then
  ok "Actions-cannot-approve is recognised as an org setting, not a bug"
else bad "approve-blocked not handled"; fi
reset; findings '{"verdict":"comment","summary":"Some notes.","findings":[]}'
echo '{"message":"Resource not accessible by integration"}' > "$FIXTURE/reviews-fail"
rc=$(run_submit)
[ "$rc" = "1" ] && ok "403 → fails loudly rather than silently not reviewing" || bad "403 swallowed"
grep -q "PERMISSION UPDATE NOT YET ACCEPTED" "$WORK/sl.$$" 2>/dev/null \
  && ok "…and names the App permission-acceptance banner as the likely cause" || bad "403 message not specific"

note "11. DEGRADED VERDICTS ARE STILL REVIEWS"
reset; SM=too-large SR="too large (4000 lines)" rc=$(run_submit)
[ "$(cat "$FIXTURE/posted-event.txt" 2>/dev/null)" = "COMMENT" ] && ok "too-large posts a real COMMENT verdict" || bad "too-large posted nothing"
grep -q "human reviewer is requested" "$FIXTURE/posted-body.txt" && ok "…asking for a human, not rubber-stamping" || bad "too-large body wrong"
reset; SM=escalate SR="author is the reviewer identity" rc=$(run_submit)
[ "$(cat "$FIXTURE/posted-event.txt" 2>/dev/null)" = "COMMENT" ] && ok "unreviewable posts a real COMMENT verdict" || bad "escalate posted nothing"
grep -q "POST label labels\[\]=needs-human-merge" "$FIXTURE/calls.log" \
  && ok "…and pulls a human to the merge as well as the thread" || bad "escalate did not apply needs-human-merge"

echo
if [ "$fail" = "0" ]; then printf '\033[32mRESULT: %d passed, 0 failed\033[0m\n' "$pass"
else printf '\033[31mRESULT: %d passed, %d FAILED\033[0m\n' "$pass" "$fail"; fi
[ "$fail" = "0" ]
