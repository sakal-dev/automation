#!/usr/bin/env bash
# =============================================================================
# review-agent / preflight (SKA-011). PURE: it decides whether this PR may be
# reviewed by this identity, and assembles the facts a review needs. It posts
# nothing and submits nothing — submit.sh does that, with what this produced.
#
# Every refusal below is a refusal to REVIEW, not a refusal to speak: where the
# honest answer is "a human must look at this", preflight says so and submit.sh
# posts that as a real COMMENT verdict. A reviewer that silently skips is worse
# than no reviewer, because the PR looks reviewed.
#
# THE ORDER IS THE POINT. Identity is checked before anything else, because
# every other check is meaningless if the wrong account is about to speak.
# =============================================================================
set -uo pipefail

out() { echo "$1=$2" >> "${GITHUB_OUTPUT:-/dev/stdout}"; }
stop() { # $1=reason  $2=how the workflow should end: skip | escalate | comment
  echo "::notice::review-agent: not reviewing — $1"
  out go false; out stop_reason "$1"; out stop_mode "${2:-skip}"
  exit 0
}

OWNER="${REPO%%/*}"; NAME="${REPO##*/}"

# --- 1. IDENTITY. Never review as the author. --------------------------------
# The reviewer login is derived from the credential class, not configured
# alongside it — a config field could drift from the token it describes, and a
# drifted reviewer identity fails as SILENCE (GitHub answers self-review with
# 422), which is the one failure mode nobody notices.
case "$REVIEWER_KIND" in
  github-actions)  REVIEWER_LOGIN="github-actions[bot]" ;;
  sakalmaster-app) REVIEWER_LOGIN="$APP_BOT_LOGIN" ;;
  *) echo "::error::review-agent: unknown reviewer_kind '$REVIEWER_KIND'"; out go false; exit 1 ;;
esac
out reviewer_login "$REVIEWER_LOGIN"

PR_JSON=$(gh api "repos/$REPO/pulls/$PR" 2>/dev/null)
[ -z "$PR_JSON" ] && stop "cannot read PR #$PR" skip

author=$(jq -r '.user.login // ""' <<<"$PR_JSON")
state=$(jq -r '.state' <<<"$PR_JSON")
draft=$(jq -r '.draft' <<<"$PR_JSON")
head=$(jq -r '.head.sha' <<<"$PR_JSON")
base=$(jq -r '.base.ref' <<<"$PR_JSON")
title=$(jq -r '.title' <<<"$PR_JSON")
body=$(jq -r '.body // ""' <<<"$PR_JSON")
out head "$head"; out author "$author"; out title "$title"

if [ "$author" = "$REVIEWER_LOGIN" ]; then
  # NOT a skip. A PR authored by the reviewing identity is structurally
  # unreviewable by this platform — GitHub will not let it approve or request
  # changes on itself. Silently skipping would leave a PR that merely looks
  # unreviewed; a human has to be told the platform cannot cover it.
  echo "::error::review-agent: PR #$PR is AUTHORED BY THE REVIEWER IDENTITY ($REVIEWER_LOGIN). GitHub forbids self-review, so no automated review of this PR is possible. A human must review it."
  stop "author is the reviewer identity ($REVIEWER_LOGIN) — unreviewable by the platform" escalate
fi

# --- 2. ADMISSIBILITY --------------------------------------------------------
[ "$state" != "open" ]  && stop "PR is $state" skip
[ "$draft" = "true" ]   && stop "PR is a draft — a draft is not asking for review" skip

case ",$AGENT_AUTHORS," in
  *",$author,"*) : ;;
  *) stop "PR authored by $author, who is not an agent (agent_authors=$AGENT_AUTHORS) — humans review humans" skip ;;
esac

labels=$(gh api "repos/$REPO/issues/$PR" --jq '[.labels[].name] | join(",")' 2>/dev/null || echo "")
case ",$labels," in
  *",review:escalated,"*)      stop "review:escalated — this PR belongs to a human now" skip ;;
  *",review:broken-anchors,"*) stop "review:broken-anchors — thread anchors are unreliable; a human decides" skip ;;
esac

# --- 3. IDEMPOTENCY. Never review the same commit twice. ---------------------
# Two questions, because they have different answers:
#   a) have I already SUBMITTED a review of this exact head? → nothing to do.
#   b) do I have a PENDING review left over from a crash? → the previous run
#      died mid-flight; say so loudly rather than stacking a second draft that
#      a human would have to reconcile.
REVIEWS=$(gh api --paginate "repos/$REPO/pulls/$PR/reviews?per_page=100" 2>/dev/null || echo '[]')
already=$(jq -r --arg who "$REVIEWER_LOGIN" --arg sha "$head" \
  '[.[] | select(.user.login==$who) | select(.commit_id==$sha)
        | select(.state!="PENDING")] | length' <<<"$REVIEWS")
if [ "${already:-0}" -gt 0 ]; then
  stop "already reviewed $head as $REVIEWER_LOGIN — a re-review needs new commits, not a re-run" skip
fi
pending=$(jq -r --arg who "$REVIEWER_LOGIN" \
  '[.[] | select(.user.login==$who) | select(.state=="PENDING")] | length' <<<"$REVIEWS")
if [ "${pending:-0}" -gt 0 ]; then
  echo "::warning::review-agent: a PENDING review by $REVIEWER_LOGIN already exists on #$PR — a previous run died between drafting and submitting. This run submits a fresh review; the stale draft is visible only to that identity and must be discarded by hand."
fi
out prior_reviews "$(jq -r --arg who "$REVIEWER_LOGIN" '[.[] | select(.user.login==$who)] | length' <<<"$REVIEWS")"

# --- 4. THE DIFF, and how far it can honestly be reviewed --------------------
FILES=$(gh api --paginate "repos/$REPO/pulls/$PR/files?per_page=100" 2>/dev/null || echo '[]')
n_files=$(jq 'length' <<<"$FILES")
n_lines=$(jq '[.[] | .additions + .deletions] | add // 0' <<<"$FILES")
out files_count "$n_files"; out lines_count "$n_lines"
echo "::notice::review-agent: #$PR touches $n_files file(s), $n_lines changed line(s)"

# GENERATED FILES. Excluded from findings — but only after the file SAYS it is
# generated. Trusting the filename is how a hand-written file called
# `schema.g.dart` gets a free pass forever, and how someone hides a change in
# one on purpose. The marker is read from the file at THIS PR's head.
GENERATED="[]"; REVIEWABLE="[]"; UNMARKED="[]"
for f in $(jq -r '.[] | select(.status != "removed") | .filename' <<<"$FILES"); do
  looks_generated=0
  case "$f" in
    *.g.dart|*.freezed.dart|*.gen.ts|*routeTree.gen.ts|*.pb.go|*_pb2.py|*.generated.*) looks_generated=1 ;;
    *lock.json|*.lock|pnpm-lock.yaml|package-lock.json|yarn.lock|Podfile.lock|Cargo.lock|pubspec.lock) looks_generated=1 ;;
  esac
  if [ "$looks_generated" = "0" ]; then
    REVIEWABLE=$(jq -c --arg f "$f" '. + [$f]' <<<"$REVIEWABLE"); continue
  fi
  head_txt=$(gh api "repos/$REPO/contents/$f?ref=$head" --jq '.content' 2>/dev/null \
    | base64 -d 2>/dev/null | head -c 4000 || echo "")
  # Lockfiles are generated by definition and carry no marker; everything else
  # must say so in its own words.
  claims=0
  case "$f" in *lock.json|*.lock|pnpm-lock.yaml|package-lock.json|yarn.lock|Podfile.lock|Cargo.lock|pubspec.lock) claims=1 ;; esac
  if [ "$claims" = "0" ] && grep -qiE '@generated|DO NOT EDIT|code generated by|auto-?generated|GENERATED CODE' <<<"$head_txt"; then
    claims=1
  fi
  if [ "$claims" = "1" ]; then
    GENERATED=$(jq -c --arg f "$f" '. + [$f]' <<<"$GENERATED")
  else
    # Looks generated, does not say so. Reviewed AND named — the mismatch is
    # itself worth a reviewer's attention.
    REVIEWABLE=$(jq -c --arg f "$f" '. + [$f]' <<<"$REVIEWABLE")
    UNMARKED=$(jq -c --arg f "$f" '. + [$f]' <<<"$UNMARKED")
  fi
done
out generated "$GENERATED"; out unmarked_generated "$UNMARKED"
out reviewable "$REVIEWABLE"

# THE DANGEROUS LIST (SKA-001's standard). This is a SIGNAL, never a verdict:
# it forces needs-human-merge and a loud finding, and the model still has to
# say what it actually thinks. Patterns are matched against the PATCH — added
# lines only, since a removed `DROP TABLE` is the opposite of dangerous.
DANGER="[]"
add_danger() { DANGER=$(jq -c --arg k "$1" --arg f "$2" --arg e "$3" '. + [{kind:$k,file:$f,evidence:$e}]' <<<"$DANGER"); }
while IFS= read -r row; do
  f=$(jq -r '.filename' <<<"$row")
  st=$(jq -r '.status' <<<"$row")
  patch=$(jq -r '.patch // ""' <<<"$row")
  added=$(printf '%s\n' "$patch" | grep '^+' | grep -v '^+++' || true)

  [ "$st" = "removed" ] && add_danger "file-deletion" "$f" "the file is deleted by this PR"
  hit() { printf '%s\n' "$added" | grep -inE "$1" | head -1 | cut -c1-200; }
  e=$(hit 'drop[[:space:]]+(table|column|index|constraint)|truncate[[:space:]]+table'); [ -n "$e" ] && add_danger "schema-destruction" "$f" "$e"
  # `delete…cascade` with anything in between: the real garage defect was
  # `deleteJobCascade`, which an adjacent-words pattern walks straight past.
  e=$(hit 'delete[[:space:]]+from|on[[:space:]]+delete[[:space:]]+cascade|delete[a-z_]*cascade|rm[[:space:]]+-rf'); [ -n "$e" ] && add_danger "delete-cascade" "$f" "$e"
  e=$(hit 'price|amount|total|payment|refund|charge|invoice|idempot|currency'); [ -n "$e" ] && add_danger "money-or-idempotency" "$f" "$e"
  e=$(hit 'service_role|secret|api[_-]?key|private[_-]?key|password|token[[:space:]]*='); [ -n "$e" ] && add_danger "credential" "$f" "$e"
  case "$f" in
    .env*|*/.env*|*production*|*prod.*|*.tfvars|*/migrations/*|*migration*)
      add_danger "prod-config-or-migration" "$f" "path matches the production/migration list" ;;
  esac
done < <(jq -c '.[]' <<<"$FILES")
n_danger=$(jq 'length' <<<"$DANGER")
out dangerous "$DANGER"; out dangerous_count "$n_danger"
[ "$n_danger" -gt 0 ] && echo "::warning::review-agent: #$PR touches the dangerous list ($n_danger signal(s)) — needs-human-merge will be applied whatever the verdict"

# SIZE. Past a threshold an automated review degrades from judgement to
# pattern-matching, and a rubber stamp on a 4000-line diff is worse than no
# review: it launders the diff as "reviewed". Say so, in a real COMMENT verdict.
if [ "$n_files" -gt "$MAX_FILES" ] || [ "$n_lines" -gt "$MAX_LINES" ]; then
  echo "::warning::review-agent: #$PR is too large for a reliable automated review ($n_files files / $n_lines lines; limits $MAX_FILES / $MAX_LINES)"
  out go false; out stop_mode too-large
  out stop_reason "too large for a reliable automated review ($n_files files, $n_lines changed lines; limits $MAX_FILES/$MAX_LINES)"
  exit 0
fi

# --- 5. What the PR CLAIMS, so the review can check it against the code ------
linked=$(printf '%s\n' "$body" \
  | grep -oiE '(close[sd]?|fix(e[sd])?|resolve[sd]?)[[:space:]]+#[0-9]+' \
  | grep -oE '[0-9]+' | sort -u | tr '\n' ' ' || true)
out linked "$(echo $linked)"
{
  echo "acs<<REVIEW_ACS_EOF"
  for iss in $linked; do
    echo "### Linked issue #$iss"
    gh api "repos/$REPO/issues/$iss" --jq '.title, .body' 2>/dev/null | head -c 6000
    echo
  done
  echo "REVIEW_ACS_EOF"
} >> "${GITHUB_OUTPUT:-/dev/stdout}"

out go true
out base "$base"
echo "::notice::review-agent: #$PR admissible — reviewing as $REVIEWER_LOGIN (author=$author, head=${head:0:12})"
