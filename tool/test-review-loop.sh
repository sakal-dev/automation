#!/usr/bin/env bash
#
# test-review-loop.sh — the runnable spec for the PR review loop (SKA-010).
#
# It exercises the REAL scripts the engine runs — actions/review-state,
# actions/review-brief, actions/review-anchors — against recorded GitHub
# payloads, through a `gh` shim on PATH. Nothing here is a re-implementation of
# the logic under test; if a script changes, this test changes with it or goes
# red. That is the point: the merge preconditions and the rework cap are now
# the sort of thing you can assert in three seconds instead of discovering in
# production at round 47.
#
# WHY A REPLAY AND NOT A LIVE CYCLE, for the parts that are replayed: GitHub
# refuses `APPROVE` and `REQUEST_CHANGES` on your own pull request. A live
# request-changes therefore needs a SECOND GitHub identity, which is exactly
# what SKA-011 builds and what does not exist yet. Every fact that a single
# identity CAN establish live was established live (see the SKA-010 report);
# the review-event paths are replayed here from real payload shapes.
#
#   ./tool/test-review-loop.sh            run everything
#   ./tool/test-review-loop.sh -v         also print each scenario's check log
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERBOSE=0; [ "${1:-}" = "-v" ] && VERBOSE=1
pass=0; fail=0
ok()   { pass=$((pass+1)); printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad()  { fail=$((fail+1)); printf '  \033[31mFAIL\033[0m %s\n' "$*"; }
note() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
FIXTURE="$WORK/fixture"; mkdir -p "$FIXTURE" "$WORK/bin"

# ---------------------------------------------------------------------------
# The `gh` shim. It answers exactly the calls the scripts under test make, from
# files in $FIXTURE, and honours --jq itself so the scripts' own filters run
# unmodified. Anything unrecognised is a loud failure, not a silent empty
# string — a stub that quietly returns nothing is how a test proves the wrong
# thing.
# ---------------------------------------------------------------------------
cat > "$WORK/bin/gh" <<'SHIM'
#!/usr/bin/env bash
args=("$@"); jqf=""; query=""
for ((i=0;i<${#args[@]};i++)); do
  [ "${args[$i]}" = "--jq" ] && jqf="${args[$((i+1))]}"
  case "${args[$i]}" in query=*) query="${args[$i]#query=}" ;; esac
done
emit() { if [ -n "$jqf" ]; then jq -r "$jqf" <<<"$1"; else printf '%s\n' "$1"; fi; }
f() { cat "$FIXTURE/$1" 2>/dev/null || echo '{}'; }

# non-api verbs (label create, etc.) are writes; the pure scripts make none.
[ "${args[0]}" != "api" ] && { echo "SHIM: unexpected write call: gh ${args[*]}" >&2; exit 9; }

target="${args[1]}"
if [ "$target" = "graphql" ]; then
  # review-state asks for latestReviews; review-brief asks only for threads.
  case "$query" in
    *latestReviews*) emit "$(f pr.json)" ;;
    *)               emit "$(f threads.json)" ;;
  esac
  exit 0
fi

case "$target" in
  */check-runs)                emit "$(f checks.json)" ;;
  */pulls/*/reviews)           emit "$(f reviews.json)" ;;
  */compare/*)
      [ -f "$FIXTURE/compare.fail" ] && exit 1
      emit "$(f compare.json)" ;;
  */commits/*)
      # used by review-anchors to ask "does `before` still resolve?"
      [ -f "$FIXTURE/before-gone" ] && exit 1
      emit '{"sha":"deadbeef"}' ;;
  */issues/*)                  emit "$(f issue.json)" ;;
  *) echo "SHIM: unhandled gh api target: $target" >&2; exit 9 ;;
esac
SHIM
chmod +x "$WORK/bin/gh"
export PATH="$WORK/bin:$PATH"
export FIXTURE

# ---------------------------------------------------------------------------
# Fixture builders — the shapes GitHub really returns.
# ---------------------------------------------------------------------------
reset_fixture() {
  rm -f "$FIXTURE"/*.json "$FIXTURE"/compare.fail "$FIXTURE"/before-gone
  echo '{"check_runs":[]}'                > "$FIXTURE/checks.json"
  echo '{"labels":[]}'                    > "$FIXTURE/issue.json"
  echo '[]'                               > "$FIXTURE/reviews.json"
  echo '{"status":"ahead"}'               > "$FIXTURE/compare.json"
}

# mkpr — build the GraphQL PullRequest payload review-state reads.
# Every knob is a named env var so a scenario reads like the situation it is.
mkpr() {
  local state="${PR_STATE:-OPEN}" merged="${PR_MERGED:-false}" draft="${PR_DRAFT:-false}"
  local head="${HEAD:-abc123}" author="${AUTHOR:-claude[bot]}" body="${BODY:-}"
  local labels="${LABELS-}" files="${FILES-src/app.ts}"
  local decision="${GH_DECISION:-null}" mergestate="${GH_MERGESTATE:-CLEAN}"
  local reviews="${REVIEWS:-[]}" latest="${LATEST:-[]}" threads="${THREADS:-[]}"
  jq -n \
    --arg state "$state" --argjson merged "$merged" --argjson draft "$draft" \
    --arg head "$head" --arg author "$author" --arg body "$body" \
    --arg mergestate "$mergestate" \
    --argjson labels "$(jq -Rn --arg l "$labels" '($l|split(",")|map(select(length>0)|{name:.}))')" \
    --argjson files "$(jq -Rn --arg f "$files" '($f|split(",")|map(select(length>0)|{path:.}))')" \
    --argjson filecount "${FILE_COUNT:-0}" \
    --argjson decision "$( [ "$decision" = "null" ] && echo null || jq -Rn --arg d "$decision" '$d')" \
    --argjson reviews "$reviews" --argjson latest "$latest" --argjson threads "$threads" \
    '{data:{repository:{pullRequest:{
        number:1,title:"t",body:$body,state:$state,isDraft:$draft,headRefOid:$head,
        baseRefName:"main",merged:$merged,mergedAt:null,mergeable:"MERGEABLE",
        mergeStateStatus:$mergestate,reviewDecision:$decision,
        author:{login:$author},labels:{nodes:$labels},
        files:{totalCount:(if $filecount>0 then $filecount else ($files|length) end),nodes:$files},
        reviews:{nodes:$reviews},latestReviews:{nodes:$latest},
        reviewThreads:{nodes:$threads}}}}}' > "$FIXTURE/pr.json"
}

review()  { jq -nc --arg s "$1" '{state:$s}'; }                       # history entry
latest()  { jq -nc --arg s "$1" --arg who "$2" --arg oid "$3" \
              '{state:$s,submittedAt:"2026-07-27T00:00:00Z",author:{login:$who},authorAssociation:"COLLABORATOR",commit:{oid:$oid}}'; }
thread()  { jq -nc --argjson res "$1" --arg path "$2" --arg who "$3" --arg body "$4" \
              '{isResolved:$res,isOutdated:false,path:$path,line:10,originalLine:10,
                comments:{nodes:[{author:{login:$who},body:$body,diffHunk:"@@ -1 +1 @@",createdAt:"2026-07-27T00:00:00Z"}]}}'; }

# run_state — execute the REAL evaluator, return the verdict JSON.
run_state() {
  local out="$WORK/out.$$"; : > "$out"
  GITHUB_OUTPUT="$out" GH_TOKEN=x REPO=acme/widget PRS=1 \
    CI_CHECK="${CI_CHECK:-analyze-and-test}" \
    GUARDRAILS="${GUARDRAILS:-CLAUDE.md,docs/RULES.md,.github/**}" \
    DOCS_ONLY="${DOCS_ONLY_PATHS:-docs/**,**/*.md}" \
    REQUIRE_APPROVAL="${REQUIRE_APPROVAL:-true}" \
    L_AUTOMERGE=auto-merge L_NEEDS_HUMAN=needs-human-merge \
    L_BROKEN="review:broken-anchors" L_ESCALATED="review:escalated" \
    L_URGENT="priority:urgent" CAP="${CAP:-2}" \
    bash "$ROOT/actions/review-state/review-state.sh" > "$WORK/log.$$" 2>&1
  [ "$VERBOSE" = "1" ] && sed 's/^/      | /' "$WORK/log.$$" >&2
  sed -n '/^verdicts<</,/^REVIEW_STATE_EOF$/p' "$out" | sed '1d;$d'
}

# expect — assert decision, and (optionally) that a reason matches a regex.
expect() { # $1=label $2=expected decision $3=reason regex (optional)
  local label="$1" want="$2" rx="${3:-}" v got
  v="$(run_state)"
  got="$(jq -r '.[0].decision' <<<"$v" 2>/dev/null || echo "PARSE-ERROR")"
  if [ "$got" != "$want" ]; then
    bad "$label — expected $want, got $got"
    jq -r '.[0].reasons[]? | "        · " + .' <<<"$v" 2>/dev/null
    return
  fi
  if [ -n "$rx" ] && ! jq -r '.[0].reasons[]?' <<<"$v" 2>/dev/null | grep -qiE "$rx"; then
    bad "$label — decision $got correct, but no reason matched /$rx/"
    jq -r '.[0].reasons[]? | "        · " + .' <<<"$v" 2>/dev/null
    return
  fi
  ok "$label → $got${rx:+ (reason matched)}"
}

expect_fact() { # $1=label $2=jq path $3=expected
  local label="$1" path="$2" want="$3" v got
  v="$(run_state)"
  got="$(jq -r ".[0].facts.$path" <<<"$v" 2>/dev/null || echo "PARSE-ERROR")"
  [ "$got" = "$want" ] && ok "$label → $path=$got" || bad "$label — expected $path=$want, got $got"
}

# ===========================================================================
note "1. MERGE PRECONDITIONS — the full set, one failure at a time"
# ===========================================================================
green() { echo '{"check_runs":[{"name":"analyze-and-test","conclusion":"success"}]}' > "$FIXTURE/checks.json"; }
red()   { echo '{"check_runs":[{"name":"analyze-and-test","conclusion":"failure"}]}' > "$FIXTURE/checks.json"; }

# happy — reset every knob to a PR that SHOULD merge, so each scenario below
# changes exactly one thing and the verdict can only be about that thing.
# (Assignments are exported, not command prefixes: a prefix would evaporate
# after mkpr and quietly test a different PR than the label claims.)
happy() {
  reset_fixture; green
  export PR_STATE=OPEN PR_MERGED=false PR_DRAFT=false HEAD=abc123 AUTHOR="claude[bot]"
  export BODY="" LABELS="auto-merge" FILES="src/app.ts" FILE_COUNT=0 REVIEWS="[]" THREADS="[]"
  export LATEST="[$(latest APPROVED codex-reviewer abc123)]"
  export GH_DECISION="APPROVED" GH_MERGESTATE="CLEAN"
  export CAP=2 REQUIRE_APPROVAL=true
  mkpr
}

happy;                                              expect "green CI + current approval + no threads" merge
happy; LABELS=""; mkpr;                             expect "no auto-merge label" hold "auto-merge label"
happy; PR_DRAFT=true GH_MERGESTATE=DRAFT; mkpr;     expect "draft PR" hold "draft"
happy; red;                                         expect "CI not green" hold "not green"
happy; LATEST="[]" GH_DECISION=null; mkpr;          expect "no approval at all" hold "no approval"
happy; LATEST="[$(latest APPROVED codex-reviewer OLDSHA)]"; mkpr
                                                    expect "approval of a vanished commit (stale)" hold "no CURRENT approval"
happy; LATEST="[$(latest CHANGES_REQUESTED codex-reviewer abc123)]" GH_DECISION=CHANGES_REQUESTED; mkpr
                                                    expect "open change-request" hold "change-request"
happy; THREADS="[$(thread false src/app.ts codex-reviewer 'this needs a null check')]"; mkpr
                                                    expect "approved but a thread is open" hold "unresolved review thread"
happy; LATEST="[$(latest APPROVED codex-reviewer abc123),$(latest CHANGES_REQUESTED socheat abc123)]" GH_DECISION=CHANGES_REQUESTED; mkpr
                                                    expect "mixed reviewers: agent approves, human objects" hold "change-request"
happy; LATEST="[$(latest CHANGES_REQUESTED codex-reviewer abc123),$(latest APPROVED socheat abc123)]" GH_DECISION=CHANGES_REQUESTED; mkpr
                                                    expect "mixed reviewers the other way round" hold "change-request"
happy; LABELS="auto-merge,needs-human-merge"; mkpr; expect "needs-human-merge hard stop" hold "needs-human-merge"
happy; LABELS="auto-merge,review:broken-anchors"; mkpr
                                                    expect "review:broken-anchors hard stop" hold "broken-anchors"
happy; LABELS="auto-merge,review:escalated"; mkpr;  expect "review:escalated hard stop" hold "escalated"
happy; LABELS="auto-merge,priority:urgent"; mkpr;   expect "priority:urgent never auto-merges" hold "urgent"
happy; FILES="CLAUDE.md"; mkpr;                     expect "guardrail path" hold "guardrail"
happy; PR_STATE=MERGED PR_MERGED=true; mkpr;        expect "already merged" hold "MERGED"
happy; REQUIRE_APPROVAL=false LATEST="[]" GH_DECISION=null; mkpr
                                                    expect "require_approval:false keeps the pre-v2.5 behaviour" merge

note "1b. GitHub's own opinion is the tiebreak"
happy; GH_DECISION=CHANGES_REQUESTED; mkpr;         expect "GitHub says CHANGES_REQUESTED, our counters say clean" hold "GitHub reviewDecision"
happy; GH_DECISION=REVIEW_REQUIRED; mkpr;           expect "branch protection wants a review we cannot see" hold "REVIEW_REQUIRED"
happy; GH_MERGESTATE=BLOCKED; mkpr;                 expect "mergeStateStatus=BLOCKED" hold "BLOCKED"
happy; GH_MERGESTATE=DIRTY; mkpr;                   expect "mergeStateStatus=DIRTY (conflicts)" hold "DIRTY"
happy; GH_MERGESTATE=BEHIND; mkpr;                  expect "mergeStateStatus=BEHIND" hold "BEHIND"
happy; GH_MERGESTATE=UNKNOWN; mkpr;                 expect "mergeStateStatus=UNKNOWN is NOT disagreement" merge

note "1c. the docs-only fast path, and its limits"
happy; FILES="docs/guide.md,docs/api.md" LATEST="[]" GH_DECISION=null; red; mkpr
expect "docs-only: no CI, no approval needed (deliberate)" merge
happy; FILES="docs/guide.md" LATEST="[$(latest CHANGES_REQUESTED socheat abc123)]" GH_DECISION=CHANGES_REQUESTED; mkpr
expect "docs-only does NOT waive a change-request" hold "change-request"
happy; FILES="docs/guide.md" LATEST="[]" GH_DECISION=null THREADS="[$(thread false docs/guide.md socheat 'wrong link')]"; mkpr
expect "docs-only does NOT waive an unresolved thread" hold "unresolved"
happy; FILES="CLAUDE.md" LATEST="[]" GH_DECISION=null; mkpr
expect "guardrail beats docs-only (CLAUDE.md is a .md file)" hold "guardrail"
happy; FILES="docs/a.md,src/app.ts" LATEST="[]" GH_DECISION=null; red; mkpr
expect "one code file spoils the docs-only batch" hold "not green"
# PINNED, not accidental: the default docs_only glob `**/*.md` needs a slash,
# so a ROOT-level README.md is not docs-only and its PR still requires CI. The
# conservative direction, and it stays that way until a repo widens the input.
happy; FILES="README.md" LATEST="[]" GH_DECISION=null; red; mkpr
expect "root-level README.md is NOT docs-only under the default globs" hold "not green"

note "1e. an unseeable file list must fail CLOSED"
# Found live: GraphQL caps `first:` at 100 and returns the whole connection as
# NULL past the cap, while its siblings still resolve. An empty file list makes
# the guardrail check pass vacuously — which is the auto-merge of CLAUDE.md the
# guardrail exists to prevent. Both ways of not seeing the list now hold.
happy; FILE_COUNT=250; mkpr
expect "PR with more files than one page — guardrail check untrustworthy" hold "cannot see the full changed-file list"
happy; FILES="" FILE_COUNT=7; mkpr
expect "file list came back empty but the PR has files (null connection)" hold "cannot see the full changed-file list"
happy; FILES="" FILE_COUNT=0; red; mkpr
expect "a PR GitHub reports as zero-file is not docs-only — CI still required" hold "not green"

note "1d. the label may live on the linked issue, not the PR"
happy; LABELS="" BODY="Closes #42"; mkpr
echo '{"labels":[{"name":"auto-merge"}]}' > "$FIXTURE/issue.json"
expect "auto-merge on the linked issue counts" merge
echo '{"labels":[{"name":"auto-merge"},{"name":"needs-human-merge"}]}' > "$FIXTURE/issue.json"
expect "needs-human-merge on the linked issue also counts" hold "needs-human-merge"

# ===========================================================================
note "2. THE REWORK CAP — the defence against an infinite loop"
# ===========================================================================
rounds_case() { # $1=how many CHANGES_REQUESTED in history  $2=body marker (or "")
  local keep_cap="${CAP:-2}" hist i
  happy
  export CAP="$keep_cap"
  hist="["
  for ((i=0;i<$1;i++)); do hist="$hist$(review CHANGES_REQUESTED),"; done
  hist="${hist%,}]"
  export REVIEWS="$hist" BODY="${2:-}"
  mkpr
}

rounds_case 0 "";  expect_fact "no change-requests yet"                  rounds 0
rounds_case 1 "";  expect_fact "round 1 counted from review history"     rounds 1
rounds_case 1 "";  expect_fact "round 1 → another round is allowed"      rework_decision rework
rounds_case 2 "";  expect_fact "round 2 (at the cap) → still allowed"    rework_decision rework
rounds_case 3 "";  expect_fact "round 3 (past the cap) → ESCALATE"       rework_decision escalate
CAP=1 rounds_case 2 "";  expect_fact "cap is configurable (cap=1, round 2)" rework_decision escalate
CAP=2

note "2b. a dismissal must not reset the cap"
# GitHub rewrites a dismissed review's state to DISMISSED, so history alone
# would forget the round. The body marker is the floor.
rounds_case 0 "<!-- sakal-review: rounds=3 -->"
expect_fact "history wiped by dismissals, marker remembers"              rounds 3
rounds_case 0 "<!-- sakal-review: rounds=3 -->"
expect_fact "…and the cap still fires"                                   rework_decision escalate
rounds_case 3 "<!-- sakal-review: rounds=1 -->"
expect_fact "a tampered-down marker cannot lower the history count"      rounds 3

# ===========================================================================
note "3. APPEND-ONLY — force-push detection on a reviewed PR"
# ===========================================================================
run_anchors() {
  local out="$WORK/a.$$"; : > "$out"
  GITHUB_OUTPUT="$out" GH_TOKEN=x REPO=acme/widget PR=1 \
    BEFORE="${BEFORE:-aaa}" AFTER="${AFTER:-bbb}" FORCE_CHECK="${FORCE_CHECK:-false}" \
    bash "$ROOT/actions/review-anchors/review-anchors.sh" > "$WORK/alog.$$" 2>&1
  [ "$VERBOSE" = "1" ] && sed 's/^/      | /' "$WORK/alog.$$" >&2
  grep '^verdict=' "$out" | tail -1 | cut -d= -f2
}
expect_anchor() { # $1=label $2=expected verdict
  local got; got="$(run_anchors)"
  [ "$got" = "$2" ] && ok "$1 → $got" || bad "$1 — expected $2, got $got"
}

reset_fixture
echo '[]' > "$FIXTURE/reviews.json"
expect_anchor "unreviewed PR: a rebase is ordinary hygiene" no-reviews

echo '[{"id":1,"submitted_at":"2026-07-27T00:00:00Z"}]' > "$FIXTURE/reviews.json"
echo '{"status":"ahead"}' > "$FIXTURE/compare.json"
expect_anchor "reviewed PR, appended commits" append-only
echo '{"status":"identical"}' > "$FIXTURE/compare.json"
expect_anchor "reviewed PR, nothing pushed" append-only
echo '{"status":"diverged"}' > "$FIXTURE/compare.json"
expect_anchor "reviewed PR, FORCE-PUSH (diverged)" rewritten
echo '{"status":"behind"}' > "$FIXTURE/compare.json"
expect_anchor "reviewed PR, history rolled back (behind)" rewritten
touch "$FIXTURE/compare.fail" "$FIXTURE/before-gone"
expect_anchor "compare 404 and the old commit is gone → rewritten" rewritten
rm -f "$FIXTURE/before-gone"
expect_anchor "compare failed but the old commit resolves → unknown, NOT a violation" unknown
rm -f "$FIXTURE/compare.fail"
BEFORE=same AFTER=same expect_anchor "identical shas" append-only

# ===========================================================================
note "4. THE REWORK BRIEF — what the coder is actually handed"
# ===========================================================================
reset_fixture
jq -n --argjson t "[$(thread false src/pay.ts codex-reviewer 'this rounds money with floats'),$(thread true src/old.ts codex-reviewer 'already fixed, resolved')]" \
  '{data:{repository:{pullRequest:{reviewThreads:{nodes:$t}}}}}' > "$FIXTURE/threads.json"

BRIEF="$(GH_TOKEN=x REPO=acme/widget PR=1 BRANCH=claude/issue-7 REVIEWER=codex-reviewer \
  REVIEW_BODY='Two problems: money must not be a float, and the retry has no ceiling.' \
  ROUNDS=1 CAP=2 EXTRA_DENYLIST='infra/**' \
  bash "$ROOT/actions/review-brief/review-brief.sh" 2>/dev/null)"

[ "$VERBOSE" = "1" ] && sed 's/^/      | /' <<<"$BRIEF"

has() { grep -qF "$1" <<<"$BRIEF"; }
has 'money must not be a float'          && ok "carries the review body VERBATIM"          || bad "review body missing from the brief"
has 'this rounds money with floats'      && ok "carries the unresolved thread verbatim"    || bad "unresolved thread missing"
has 'already fixed, resolved'            && bad "RESOLVED thread leaked into the brief"    || ok "resolved threads are excluded"
has 'src/pay.ts:10'                      && ok "names the file and line of each thread"    || bad "thread location missing"
has 'APPEND-ONLY'                        && ok "states the append-only rule"               || bad "append-only rule missing"
has 'only the reviewer or a human resolves' && ok "coder may reply but never resolve"      || bad "thread-resolution rule missing"
has './tool/verify.sh'                   && ok "restates the gate"                         || bad "gate missing from the brief"
has 'round 1 of 2'                       && ok "tells the coder how much rope is left"     || bad "round/cap missing"
has 'infra/**'                           && ok "carries the repo's extra denylist"         || bad "extra denylist missing"
has 'Open threads — 1'                   && ok "counts only the OPEN threads"              || bad "open-thread count wrong"

echo
if [ "$fail" = "0" ]; then
  printf '\033[32mRESULT: %d passed, 0 failed\033[0m\n' "$pass"
else
  printf '\033[31mRESULT: %d passed, %d FAILED\033[0m\n' "$pass" "$fail"
fi
[ "$fail" = "0" ]
