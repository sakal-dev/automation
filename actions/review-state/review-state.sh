#!/usr/bin/env bash
# =============================================================================
# review-state implementation (SKA-010). PURE: it reads and it judges. It makes
# NO writes — no labels, no comments, no merges. Every caller decides what to do
# with the verdict, so the same judgement can be logged in a dry run, asserted
# in a replay test, and acted on in automerge, without three copies drifting.
#
# Reads one or more PRs and answers, per PR: may this be merged by automation,
# and if not, exactly which precondition failed. The reasons are the audit
# trail — a hold with no named reason is a bug.
#
# ORDER MATTERS. Preconditions are evaluated most-restrictive first, and every
# one of them is a hard stop; there is no "score". A PR that fails three
# preconditions reports all three (we do not stop at the first) because an
# operator fixing one wants to see the other two in the same log.
#
# THE DOCS-ONLY CARVE-OUT is deliberately narrow: a docs-only PR waives the CI
# check and the approval requirement (that is the pre-existing reviewless fast
# path, kept on purpose). It does NOT waive an open change-request or an
# unresolved thread — most-restrictive-wins outranks the fast path, because a
# human who said "no" to a docs PR said no.
#
# GITHUB IS THE TIEBREAK. After computing its own verdict the evaluator asks
# GitHub for `reviewDecision` and `mergeStateStatus` and refuses to merge on
# disagreement. Branch protection, CODEOWNERS, and required reviewers are
# invisible to the checks above; GitHub's own answer is not. UNKNOWN is not
# disagreement — GitHub returns it while it is still computing mergeability,
# and treating that as a block would make merges flaky.
# =============================================================================
set -uo pipefail

OWNER="${REPO%%/*}"; NAME="${REPO##*/}"

# Glob-match helper: bash `case` patterns, where `*` matches `/` — so `docs/**`
# covers any depth and `**/*.md` any directory. (Identical semantics to
# automerge.yml's helper; this file is now the single home for it.)
matches_any() { # $1=file, $2=comma-separated globs
  local f="$1" pats="$2" p
  IFS=',' read -ra arr <<< "$pats"
  for p in "${arr[@]}"; do
    p="$(echo "$p" | xargs)"
    [ -z "$p" ] && continue
    # shellcheck disable=SC2254
    case "$f" in $p) return 0 ;; esac
  done
  return 1
}

# One GraphQL round-trip per PR carries everything REST would need five calls
# for — and two facts REST cannot give at all: reviewThreads (thread resolution
# is GraphQL-only) and mergeStateStatus.
pr_graphql() {
  gh api graphql -f query='
    query($owner:String!,$name:String!,$number:Int!){
      repository(owner:$owner,name:$name){
        pullRequest(number:$number){
          number title body state isDraft headRefOid baseRefName
          merged mergedAt
          mergeable mergeStateStatus reviewDecision
          author{ login }
          labels(first:100){ nodes{ name } }
          files(first:100){ totalCount nodes{ path } }
          reviews(first:100){ nodes{ state } }
          latestReviews(first:50){
            nodes{ state submittedAt author{ login } authorAssociation commit{ oid } }
          }
          reviewThreads(first:100){ nodes{ isResolved isOutdated } }
        }
      }
    }' -F owner="$OWNER" -F name="$NAME" -F number="$1" 2>/dev/null
}

# The rework-round count. TWO sources, and we take the HIGHER:
#   a) GitHub's review history — the number of CHANGES_REQUESTED reviews.
#      Authoritative and unforgeable while it lasts, but it does NOT last: a
#      dismissed review's state becomes DISMISSED and stops being counted, so
#      history alone lets a dismissal reset the cap.
#   b) the marker the engine writes into the PR body.
# Neither alone is durable (the coder can edit a body; a reviewer can dismiss a
# review), so the cap reads max(a,b) — every way to lower the count requires
# defeating both, and a human doing that deliberately is allowed to.
rounds_of() { # $1 = graphql json
  local from_history from_marker
  from_history=$(jq -r '[.data.repository.pullRequest.reviews.nodes[]?
                         | select(.state=="CHANGES_REQUESTED")] | length' <<<"$1" 2>/dev/null || echo 0)
  from_marker=$(jq -r '.data.repository.pullRequest.body // ""' <<<"$1" 2>/dev/null \
    | sed -n 's/.*<!-- sakal-review:[^>]*rounds=\([0-9][0-9]*\).*/\1/p' | head -1)
  from_history="${from_history:-0}"; from_marker="${from_marker:-0}"
  if [ "$from_marker" -gt "$from_history" ]; then echo "$from_marker"; else echo "$from_history"; fi
}

# Linked issues: parse the closing keyword from the PR BODY. The API's
# closingIssuesReferences field lags a freshly-opened PR (constraints #4), and
# the body is what the engine's own PRs are required to carry anyway.
linked_of() { # $1 = body
  printf '%s\n' "$1" \
    | grep -oiE '(close[sd]?|fix(e[sd])?|resolve[sd]?)[[:space:]]+#[0-9]+' \
    | grep -oE '[0-9]+' | sort -u || true
}

verdicts="[]"
IFS=', ' read -ra PR_LIST <<< "${PRS:-}"

for pr in "${PR_LIST[@]}"; do
  [ -z "$pr" ] && continue
  reasons="[]"
  add() { reasons=$(jq -c --arg r "$1" '. + [$r]' <<<"$reasons"); }

  J=$(pr_graphql "$pr")
  if [ -z "$J" ] || [ "$(jq -r '.data.repository.pullRequest.number // "null"' <<<"$J")" = "null" ]; then
    # Fail CLOSED. An unreadable PR is not a mergeable PR.
    add "could not read PR #$pr (API error or no access) — holding"
    verdicts=$(jq -c --argjson v "$(jq -nc --arg pr "$pr" --argjson rs "$reasons" \
      '{pr:($pr|tonumber),decision:"hold",reasons:$rs,facts:{}}')" '. + [$v]' <<<"$verdicts")
    echo "  #$pr: UNREADABLE — hold"
    continue
  fi
  P=$(jq -c '.data.repository.pullRequest' <<<"$J")

  state=$(jq -r '.state' <<<"$P")
  merged=$(jq -r '.merged' <<<"$P")
  draft=$(jq -r '.isDraft' <<<"$P")
  head=$(jq -r '.headRefOid' <<<"$P")
  author=$(jq -r '.author.login // ""' <<<"$P")
  body=$(jq -r '.body // ""' <<<"$P")
  labels=$(jq -r '[.labels.nodes[]?.name] | join(",")' <<<"$P")
  files=$(jq -r '.files.nodes[]?.path' <<<"$P")
  # GraphQL connections cap `first:` at 100 and a request over the cap returns
  # the whole connection as NULL while its siblings still resolve — so an
  # over-cap query yields an EMPTY file list, and an empty file list makes the
  # guardrail check pass vacuously. That is a change to CLAUDE.md auto-merging
  # itself. Found live on the SKA-010 scratch PR with `files(first:300)`.
  # The list is now within the cap, and both ways of not seeing it — null, or a
  # PR with more than 100 files — fail CLOSED.
  file_count=$(jq -r '.files.totalCount // 0' <<<"$P")
  files_truncated=0
  if [ "${file_count:-0}" -gt 100 ]; then files_truncated=1; fi
  if [ -z "$files" ] && [ "${file_count:-0}" -gt 0 ]; then files_truncated=1; fi
  gh_decision=$(jq -r '.reviewDecision // "NONE"' <<<"$P")
  gh_mergestate=$(jq -r '.mergeStateStatus // "UNKNOWN"' <<<"$P")
  rounds=$(rounds_of "$J")

  has_label() { [[ ",$labels," == *",$1,"* ]]; }

  # Latest review PER REVIEWER is the most-restrictive-wins primitive: a
  # reviewer's newest verdict replaces their older one, and nobody else's.
  change_requests=$(jq -r '[.latestReviews.nodes[]? | select(.state=="CHANGES_REQUESTED")] | length' <<<"$P")
  cr_authors=$(jq -r '[.latestReviews.nodes[]? | select(.state=="CHANGES_REQUESTED") | .author.login] | join(",")' <<<"$P")
  approvals_all=$(jq -r '[.latestReviews.nodes[]? | select(.state=="APPROVED")] | length' <<<"$P")
  # An approval of code that no longer exists is void (contract: stale
  # approvals). Fresh = the approved commit IS the current head.
  approvals_fresh=$(jq -r --arg h "$head" \
    '[.latestReviews.nodes[]? | select(.state=="APPROVED") | select((.commit.oid // "") == $h)] | length' <<<"$P")
  approvers=$(jq -r --arg h "$head" \
    '[.latestReviews.nodes[]? | select(.state=="APPROVED") | select((.commit.oid // "") == $h) | .author.login] | join(",")' <<<"$P")
  stale_approvals=$((approvals_all - approvals_fresh))
  unresolved=$(jq -r '[.reviewThreads.nodes[]? | select(.isResolved == false)] | length' <<<"$P")

  linked=$(linked_of "$body")
  # Labels that live on the linked ISSUE count as if they were on the PR: the
  # operator labels the issue, not the branch.
  issue_labels=""
  for iss in $linked; do
    l=$(gh api "repos/$REPO/issues/$iss" --jq '[.labels[].name] | join(",")' 2>/dev/null || echo "")
    issue_labels="$issue_labels,$l"
  done
  any_label() { has_label "$1" || [[ ",$issue_labels," == *",$1,"* ]]; }

  # ---- preconditions, most-restrictive first ------------------------------
  if [ "$state" != "OPEN" ]; then add "PR is $state (merged=$merged) — nothing to merge"; fi

  if any_label "$L_BROKEN"; then
    add "carries $L_BROKEN — a force-push destroyed the review anchors; automation is stopped for this PR until a human clears it"
  fi
  if any_label "$L_ESCALATED"; then
    add "carries $L_ESCALATED — the rework cap was reached; this PR is a human's now"
  fi
  if any_label "$L_NEEDS_HUMAN"; then
    add "carries $L_NEEDS_HUMAN — human-only merge area"
  fi
  if any_label "$L_URGENT"; then
    # Written in every repo's RULES since day one; until now nothing enforced
    # it. An unenforced rule is a wish.
    add "carries $L_URGENT — urgent work is never auto-merged (RULES §6)"
  fi

  if ! any_label "$L_AUTOMERGE"; then
    add "no $L_AUTOMERGE label on the PR or a linked issue — review is the default (invariant 2)"
  fi

  if [ "$draft" = "true" ]; then add "PR is a draft"; fi

  # Guardrail paths never auto-merge — checked BEFORE the docs-only test, so a
  # file matching both lists is a guardrail file and the PR loses the fast path
  # entirely.
  sensitive=0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if matches_any "$f" "$GUARDRAILS"; then sensitive=1; echo "    guardrail file: $f"; fi
  done <<< "$files"
  [ "$sensitive" = "1" ] && add "touches guardrail paths ($GUARDRAILS) — an agent must never auto-merge a change to its own rules or the gate"
  if [ "$files_truncated" = "1" ]; then
    add "cannot see the full changed-file list ($file_count files, page cap 100) — the guardrail check cannot be trusted on a list this size, so this PR is a human's"
  fi

  # Docs-only? Every changed file ignorable by CI. An unreadable/empty file
  # list is treated conservatively: not docs-only.
  docs_only=0
  if [ -n "$files" ] && [ "$sensitive" = "0" ] && [ "$files_truncated" = "0" ]; then
    docs_only=1
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      if ! matches_any "$f" "$DOCS_ONLY"; then docs_only=0; fi
    done <<< "$files"
  fi

  # CI. Docs-only PRs produce no check at all (the repo's CI path-ignores
  # them), so requiring one would deadlock — that is the whole reason the
  # carve-out exists.
  ci_concl=""
  if [ "$docs_only" = "1" ]; then
    echo "    docs-only: CI not applicable, approval waived (change-requests and threads still apply)"
  else
    ci_concl=$(gh api "repos/$REPO/commits/$head/check-runs" \
      --jq "[.check_runs[] | select(.name==\"$CI_CHECK\")] | last | .conclusion // \"\"" 2>/dev/null || echo "")
    [ "$ci_concl" != "success" ] && add "CI check '$CI_CHECK' is not green (conclusion=${ci_concl:-none}) on $head"
    if [ "$REQUIRE_APPROVAL" = "true" ] && [ "$approvals_fresh" -lt 1 ]; then
      if [ "$stale_approvals" -gt 0 ]; then
        add "no CURRENT approval — $stale_approvals approval(s) exist but were given for an earlier commit; new commits void an approval"
      else
        add "no approval (need at least 1)"
      fi
    fi
  fi

  # Most-restrictive-wins: these bind even on the docs-only fast path.
  [ "$change_requests" -gt 0 ] && add "$change_requests open change-request(s) from: $cr_authors — a request-changes outlives an approval until its own author or a human clears it"
  [ "$unresolved" -gt 0 ] && add "$unresolved unresolved review thread(s) — approve-with-comments is a comment, not consent to merge with threads open"

  # ---- GitHub's own opinion, as a tiebreak --------------------------------
  case "$gh_decision" in
    CHANGES_REQUESTED) add "GitHub reviewDecision=CHANGES_REQUESTED — GitHub wins over any local count" ;;
    REVIEW_REQUIRED)   add "GitHub reviewDecision=REVIEW_REQUIRED — branch protection wants a review this engine cannot see" ;;
  esac
  case "$gh_mergestate" in
    BLOCKED) add "GitHub mergeStateStatus=BLOCKED — a required check or protection rule says no" ;;
    DIRTY)   add "GitHub mergeStateStatus=DIRTY — the branch has conflicts" ;;
    BEHIND)  add "GitHub mergeStateStatus=BEHIND — the base moved and this repo requires up-to-date branches" ;;
    DRAFT)   add "GitHub mergeStateStatus=DRAFT" ;;
    UNKNOWN) echo "    note: mergeStateStatus=UNKNOWN (GitHub still computing) — not treated as disagreement" ;;
  esac

  n_reasons=$(jq 'length' <<<"$reasons")
  if [ "$n_reasons" = "0" ]; then decision="merge"; else decision="hold"; fi

  # THE CAP, decided here rather than in the workflow, so the number that stops
  # the loop and the number the merge gate reports are the same number. A round
  # AT the cap still gets worked; the request-changes PAST it escalates.
  if [ "$rounds" -gt "${CAP:-2}" ]; then rework_decision="escalate"; else rework_decision="rework"; fi

  facts=$(jq -nc \
    --arg state "$state" --arg draft "$draft" --arg head "$head" --arg author "$author" \
    --arg labels "$labels" --arg issue_labels "${issue_labels#,}" \
    --arg gh_decision "$gh_decision" --arg gh_mergestate "$gh_mergestate" \
    --arg ci "$ci_concl" --arg approvers "$approvers" --arg cr_authors "$cr_authors" \
    --argjson docs_only "$docs_only" --argjson guardrail "$sensitive" \
    --argjson file_count "${file_count:-0}" --argjson truncated "$files_truncated" \
    --argjson approvals_fresh "$approvals_fresh" --argjson stale_approvals "$stale_approvals" \
    --argjson change_requests "$change_requests" --argjson unresolved "$unresolved" \
    --argjson rounds "$rounds" --argjson cap "${CAP:-2}" --arg rework "$rework_decision" \
    --arg linked "$(echo $linked)" \
    '{state:$state,draft:($draft=="true"),head:$head,author:$author,labels:$labels,
      issue_labels:$issue_labels,linked:$linked,docs_only:($docs_only==1),
      guardrail:($guardrail==1),file_count:$file_count,
      files_truncated:($truncated==1),ci:$ci,approvals_fresh:$approvals_fresh,
      approvers:$approvers,stale_approvals:$stale_approvals,
      change_requests:$change_requests,change_request_authors:$cr_authors,
      unresolved_threads:$unresolved,rounds:$rounds,cap:$cap,
      rework_decision:$rework,
      github_review_decision:$gh_decision,github_merge_state:$gh_mergestate}')

  verdicts=$(jq -c --argjson v "$(jq -nc --arg pr "$pr" --arg d "$decision" \
    --argjson rs "$reasons" --argjson f "$facts" \
    '{pr:($pr|tonumber),decision:$d,reasons:$rs,facts:$f}')" '. + [$v]' <<<"$verdicts")

  # The check log. This is the artefact an operator reads when a PR did not
  # merge, so it prints the facts even when the verdict is `merge`.
  echo "  #$pr [$decision] head=${head:0:7} draft=$draft docs_only=$docs_only ci=${ci_concl:-n/a}"
  echo "      approvals(current)=$approvals_fresh stale=$stale_approvals change_requests=$change_requests unresolved_threads=$unresolved"
  echo "      rounds=$rounds cap=${CAP:-2} → $rework_decision"
  echo "      github: reviewDecision=$gh_decision mergeStateStatus=$gh_mergestate"
  jq -r '.[] | "      hold: " + .' <<<"$reasons"
done

{
  echo "verdicts<<REVIEW_STATE_EOF"
  printf '%s\n' "$verdicts"
  echo "REVIEW_STATE_EOF"
  echo "mergeable=$(jq -r '[.[] | select(.decision=="merge") | .pr] | join(" ")' <<<"$verdicts")"
  echo "held=$(jq -r '[.[] | select(.decision=="hold") | .pr] | join(" ")' <<<"$verdicts")"
} >> "${GITHUB_OUTPUT:-/dev/stdout}"
