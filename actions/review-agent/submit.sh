#!/usr/bin/env bash
# =============================================================================
# review-agent / submit (SKA-011). Turns the reviewer's findings into a REAL
# GitHub review — approve / comment / request-changes — and nothing else. It
# does not push, does not edit the PR, does not resolve threads.
#
# ATOMIC BY CONSTRUCTION. The whole review (line comments AND the verdict) goes
# in ONE `POST /pulls/{n}/reviews` call. The brief asked for verdict-last so a
# crash leaves an obviously-incomplete review; one atomic call is strictly
# better — a crash leaves NOTHING, so there is no incomplete state to
# reconcile. Where the API forces a second call (an invalid comment position),
# the retry drops only the comments GitHub refused and folds them into the
# body, so a finding is never silently lost.
#
# A REVIEW WITHOUT A VERDICT IS NOT A REVIEW. If the model returns findings and
# no verdict, that is an invalid review and this script refuses to post it —
# the run fails loudly instead of leaving comments that look like a verdict.
#
# EVERY FAILURE MODE IS NAMED. A 403 here almost always means the App's updated
# permissions have not been accepted on the installation; "GitHub Actions is
# not permitted to approve" means an org setting, not a bug. Both are reported
# as themselves, because a generic failure sends the operator hunting.
# =============================================================================
set -uo pipefail

OWNER="${REPO%%/*}"; NAME="${REPO##*/}"
body() { printf '%s\n' "$@"; }

# --- The degraded paths: preflight already decided, we only speak ------------
if [ "${STOP_MODE:-}" = "too-large" ] || [ "${STOP_MODE:-}" = "escalate" ]; then
  case "$STOP_MODE" in
    too-large)
      text=$(body \
        "## Automated review: **comment** — not a verdict on the code" \
        "" \
        "$STOP_REASON." \
        "" \
        "Past this size an automated review stops being judgement and becomes pattern-matching, and a rubber stamp on a diff this big is worse than no review at all — it launders the diff as \"reviewed\". **A human reviewer is requested.**" \
        "" \
        "Nothing here says the change is wrong. It says nobody has checked it." \
        "" \
        "<!-- sakal-reviewer: verdict=comment reason=too-large sha=$HEAD -->")
      ;;
    escalate)
      text=$(body \
        "## Automated review: **comment** — this PR cannot be reviewed by the platform" \
        "" \
        "$STOP_REASON." \
        "" \
        "GitHub does not allow an identity to review its own pull request, so no automated verdict is possible here. **A human must review this PR.**" \
        "" \
        "<!-- sakal-reviewer: verdict=comment reason=unreviewable sha=$HEAD -->")
      ;;
  esac
  if gh api -X POST "repos/$REPO/pulls/$PR/reviews" -f event=COMMENT -f body="$text" >/dev/null 2>&1; then
    echo "::notice::review-agent: posted the degraded COMMENT verdict on #$PR ($STOP_MODE)"
  else
    # Falling back to an issue comment keeps the human informed even when the
    # review API is closed to us; it is explicitly NOT a review and says so.
    gh api -X POST "repos/$REPO/issues/$PR/comments" -f body="$text" >/dev/null 2>&1 \
      && echo "::warning::review-agent: could not POST a review; left the same text as an issue comment on #$PR" \
      || echo "::error::review-agent: could not post anything on #$PR"
  fi
  # Escalation also wants a human at the merge, not just at the thread.
  [ "$STOP_MODE" = "escalate" ] && gh api -X POST "repos/$REPO/issues/$PR/labels" -f 'labels[]=needs-human-merge' >/dev/null 2>&1 || true
  exit 0
fi

# --- The real review ---------------------------------------------------------
[ -f "$FINDINGS_FILE" ] || { echo "::error::review-agent: the reviewer produced no findings file ($FINDINGS_FILE) — there is nothing to submit, and an empty review is not an approval"; exit 1; }

if ! jq -e . "$FINDINGS_FILE" >/dev/null 2>&1; then
  echo "::error::review-agent: $FINDINGS_FILE is not valid JSON — refusing to guess a verdict from it"
  head -c 2000 "$FINDINGS_FILE"; exit 1
fi

verdict=$(jq -r '.verdict // ""' "$FINDINGS_FILE" | tr '[:upper:]' '[:lower:]')
summary=$(jq -r '.summary // ""' "$FINDINGS_FILE")
to_approve=$(jq -r '.what_would_flip_it // ""' "$FINDINGS_FILE")

case "$verdict" in
  approve|comment|request-changes) : ;;
  *) echo "::error::review-agent: invalid or missing verdict ('$verdict'). Findings without a verdict is not a review — refusing to post."; exit 1 ;;
esac
[ -z "$summary" ] && { echo "::error::review-agent: verdict '$verdict' carries no summary — refusing to post a bare stamp"; exit 1; }
if [ "$verdict" = "request-changes" ] && [ -z "$to_approve" ]; then
  echo "::error::review-agent: request-changes must state what would flip it to approve (the coder gets $CAP rounds; 'fix it' is not actionable)"; exit 1
fi

# The dangerous list outranks the verdict. An approval never auto-merges a
# cascade delete: the label is applied whatever the model concluded.
danger_block=""
if [ "${DANGEROUS_COUNT:-0}" -gt 0 ]; then
  gh label create "needs-human-merge" -R "$REPO" --color 0E0E0E \
    --description "Hard stop: this PR/area is merged by a human only" 2>/dev/null || true
  gh api -X POST "repos/$REPO/issues/$PR/labels" -f 'labels[]=needs-human-merge' >/dev/null 2>&1 \
    && echo "::warning::review-agent: applied needs-human-merge to #$PR — the diff touches the dangerous list"
  danger_block=$(printf '%s\n' \
    "" \
    "### ⚠ This PR touches the dangerous list — \`needs-human-merge\` applied" \
    "" \
    "Approval alone will not merge this. A human decides, whatever any bot concluded." \
    "" \
    "$(jq -r '.[] | "- **\(.kind)** — `\(.file)`: \(.evidence)"' <<<"${DANGEROUS:-[]}")")
fi

unmarked_block=""
if [ "$(jq 'length' <<<"${UNMARKED:-[]}")" -gt 0 ]; then
  unmarked_block=$(printf '%s\n' \
    "" \
    "### Files that look generated but do not say so" \
    "" \
    "These were **reviewed** rather than skipped — the filename claims generation, the file itself does not:" \
    "" \
    "$(jq -r '.[] | "- `" + . + "`"' <<<"$UNMARKED")")
fi

gen_note=""
[ "$(jq 'length' <<<"${GENERATED:-[]}")" -gt 0 ] && \
  gen_note="_Excluded as generated (verified by marker or lockfile): $(jq -r 'join(", ")' <<<"$GENERATED")._"

case "$verdict" in
  approve)         event=APPROVE;          heading="## Automated review: **approve**" ;;
  request-changes) event=REQUEST_CHANGES;  heading="## Automated review: **request changes**" ;;
  comment)         event=COMMENT;          heading="## Automated review: **comment**" ;;
esac

flip_block=""
[ -n "$to_approve" ] && flip_block=$(printf '%s\n' "" "**What would flip this to approve:** $to_approve")

REVIEW_BODY=$(printf '%s\n' \
  "$heading" \
  "" \
  "$summary" \
  "$flip_block" \
  "$danger_block" \
  "$unmarked_block" \
  "" \
  "---" \
  "$gen_note" \
  "_Reviewed by \`$REVIEWER_LOGIN\` at \`${HEAD:0:12}\` — $FILES_COUNT file(s), $LINES_COUNT changed line(s). ${COST_NOTE:-}_" \
  "" \
  "<!-- sakal-reviewer: verdict=$verdict sha=$HEAD -->")

# Line comments, mapped to the review-comment shape. `line`+`side` anchor to the
# PR's current diff; a finding whose line is not in the diff cannot be anchored
# and is folded into the body below rather than dropped.
COMMENTS=$(jq -c '[.findings[]? | select(.file != null and .line != null)
                   | {path: .file, line: (.line|tonumber), side: "RIGHT",
                      body: ("**" + (.severity // "note") + "** — " + .body)}]' "$FINDINGS_FILE")
UNANCHORED=$(jq -r '[.findings[]? | select(.file == null or .line == null)
                     | "- **" + (.severity // "note") + "** " + ((.file // "(no file)")) + ": " + .body] | join("\n")' "$FINDINGS_FILE")
[ -n "$UNANCHORED" ] && REVIEW_BODY=$(printf '%s\n\n%s\n\n%s\n' "$REVIEW_BODY" "### Findings without a diff anchor" "$UNANCHORED")

post() { # $1 = comments json
  jq -nc --arg body "$REVIEW_BODY" --arg event "$event" --arg sha "$HEAD" --argjson c "$1" \
    '{body:$body, event:$event, commit_id:$sha, comments:$c}' \
  | gh api -X POST "repos/$REPO/pulls/$PR/reviews" --input - 2>&1
}

resp=$(post "$COMMENTS"); rc=$?
if [ $rc -eq 0 ]; then
  url=$(jq -r '.html_url // empty' <<<"$resp" 2>/dev/null)
  echo "::notice::review-agent: submitted $event on #$PR — ${url:-(no url returned)}"
  echo "review_url=${url:-}" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  echo "verdict=$verdict" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  exit 0
fi

echo "::warning::review-agent: first submit failed — $(head -c 500 <<<"$resp")"

# --- Named failure modes ------------------------------------------------------
case "$resp" in
  *"not permitted to approve"*|*"Actions is not permitted"*)
    echo "::warning::review-agent: this org/repo has 'Allow GitHub Actions to approve pull requests' OFF, so github-actions[bot] can comment but never approve. Downgrading this APPROVE to a COMMENT that says so — the verdict is preserved in the text, not faked in the API."
    REVIEW_BODY=$(printf '%s\n\n%s\n' "$REVIEW_BODY" \
      "> **Note:** the verdict above is **approve**, but this repository does not allow GitHub Actions to approve pull requests, so it is recorded as a comment. Auto-merge will still wait for a human approval. Turn on Settings → Actions → General → *Allow GitHub Actions to approve pull requests* to let this count.")
    event=COMMENT
    resp=$(post "$COMMENTS") && { echo "::notice::review-agent: posted as COMMENT (approve downgraded)"; echo "verdict=comment-downgraded" >> "${GITHUB_OUTPUT:-/dev/stdout}"; exit 0; }
    ;;
  *"on your own pull request"*)
    # Invariant 13, arriving as a 422. This is the failure the whole reviewer
    # role exists to make impossible, so it must never be reported as anything
    # vaguer than itself. (Caught live: without this case the self-review 422
    # fell through to the bad-line-anchor retry below and blamed the anchors.)
    echo "::error::review-agent: GitHub refused the review because the reviewing identity ($REVIEWER_LOGIN) IS the author of #$PR. An identity cannot review its own pull request. This is a credential wiring error, not a code problem — the reviewer must be a different GitHub identity from the coder (docs/task-contract.md invariant 13)."
    exit 1 ;;
  *"Resource not accessible by integration"*|*403*)
    echo "::error::review-agent: 403 from the reviews API as $REVIEWER_LOGIN. If the reviewer is the SakalMaster App, this is almost certainly THE PERMISSION UPDATE NOT YET ACCEPTED on this installation — an org admin must accept the updated permissions banner (Pull requests: Read & write). It is a one-time click, not a bug. Verify with: gh api orgs/<org>/installations --jq '.installations[]|select(.app_slug==\"sakal-master\").permissions'"
    exit 1 ;;
esac

# 422 from an unanchorable comment: retry with NO line comments and every
# finding in the body. Losing the anchor is acceptable; losing the finding is not.
case "$resp" in
  *"pull_request_review_thread"*|*422*|*"is not part of the pull request"*|*"line must be part of the diff"*)
    echo "::warning::review-agent: GitHub refused one or more line anchors — resubmitting with every finding in the body instead. No finding is dropped."
    ALL=$(jq -r '[.findings[]? | "- **" + (.severity // "note") + "** `" + ((.file // "(no file)")) + (if .line then ":" + (.line|tostring) else "" end) + "` — " + .body] | join("\n")' "$FINDINGS_FILE")
    REVIEW_BODY=$(printf '%s\n\n%s\n\n%s\n' "$REVIEW_BODY" "### Findings (line anchors refused by GitHub)" "$ALL")
    resp=$(post '[]') && {
      url=$(jq -r '.html_url // empty' <<<"$resp" 2>/dev/null)
      echo "::notice::review-agent: submitted $event on #$PR without anchors — ${url:-}"
      echo "review_url=${url:-}" >> "${GITHUB_OUTPUT:-/dev/stdout}"
      echo "verdict=$verdict" >> "${GITHUB_OUTPUT:-/dev/stdout}"; exit 0; }
    ;;
esac

echo "::error::review-agent: could not submit the review on #$PR — $(head -c 800 <<<"$resp")"
exit 1
