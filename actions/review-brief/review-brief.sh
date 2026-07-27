#!/usr/bin/env bash
# =============================================================================
# review-brief implementation (SKA-010). PURE: it reads the review and prints a
# brief. It posts nothing, labels nothing, and runs nothing — the workflow does
# that with what this returns.
#
# The brief IS the task interface (contract step 2). A coder that needs
# something not in here is evidence the brief is incomplete — fix the brief.
#
# It carries the review VERBATIM. Not a summary: a summary is the engine
# deciding which of the reviewer's points matter, which is exactly the decision
# the engine is not qualified to make. Every unresolved thread rides along too,
# including ones from earlier rounds the coder never answered — otherwise the
# reviewer re-raises them and a whole round is burned re-learning them.
# =============================================================================
set -uo pipefail

OWNER="${REPO%%/*}"; NAME="${REPO##*/}"

# Thread state is GraphQL-only (docs/github-constraints.md #9).
THREADS="${THREADS_JSON:-}"
if [ -z "$THREADS" ]; then
  THREADS=$(gh api graphql -f query='
    query($owner:String!,$name:String!,$number:Int!){
      repository(owner:$owner,name:$name){ pullRequest(number:$number){
        reviewThreads(first:100){ nodes{
          isResolved isOutdated path line originalLine
          comments(first:30){ nodes{ author{login} body diffHunk createdAt } } } } } } }' \
    -F owner="$OWNER" -F name="$NAME" -F number="$PR" 2>/dev/null || echo '{}')
fi

open_threads=$(jq -r '[.data.repository.pullRequest.reviewThreads.nodes[]? | select(.isResolved == false)] | length' <<<"$THREADS" 2>/dev/null || echo 0)

cat <<BRIEF_HEADER
# REWORK BRIEF — PR #$PR, round $ROUNDS of $CAP

A reviewer requested changes. Your task is to ADDRESS THIS REVIEW on the
existing branch \`$BRANCH\`. This is not a new feature and it is not a fresh PR.

## The review, verbatim (by @$REVIEWER)

BRIEF_HEADER

if [ -n "${REVIEW_BODY:-}" ]; then
  printf '%s\n' "$REVIEW_BODY" | sed 's/^/> /'
else
  echo "> (no summary text — the reviewer's points are the line comments below)"
fi

echo
echo "## Open threads — $open_threads to address or answer"
echo

if [ "${open_threads:-0}" -eq 0 ]; then
  echo "_No line-level threads. Everything the reviewer asked for is in the review text above._"
else
  jq -r '.data.repository.pullRequest.reviewThreads.nodes[]?
         | select(.isResolved == false)
         | "### \(.path // "(no file)"):\(.line // .originalLine // "?")"
           + (if .isOutdated then "  _(outdated — the line moved since; the point may still stand)_" else "" end)
           + "\n\n"
           + ( [ .comments.nodes[]? | "**@\(.author.login // "?")**: \(.body)" ] | join("\n\n") )
           + "\n"' <<<"$THREADS" 2>/dev/null
fi

cat <<'BRIEF_RULES'

## How to work this round — binding

1. **APPEND-ONLY.** Add commits on top of the current branch head. You MUST NOT
   `git push --force`, `git rebase`, `git commit --amend`, or `git reset` this
   branch. Rewriting history detaches every review comment from the code it
   points at, and the reviewer loses the thread they are mid-conversation in.
   The engine checks this after you: a rewritten head stops the loop for this PR
   and hands it to a human.
2. **Reply to every thread you addressed**, naming the commit that fixes it.
   Do NOT resolve threads — only the reviewer or a human resolves a thread. If
   you disagree with a point, say so in the thread with your reasoning and leave
   it open. Disagreeing is allowed; silently ignoring is not.
3. **Run `./tool/verify.sh`** from the repo root. It MUST exit 0 before you stop.
   The engine re-runs it in its own environment afterwards; your local pass
   carries no authority.
4. Do NOT open a new PR. Do NOT merge. Do NOT close anything. Do NOT re-request
   the review — the engine does that.
5. If the review asks for something you must not do (a denylisted path, a
   product decision, weakening the gate), do NOT do it: reply in the thread with
   exactly why, and stop. A blocked round is a valid outcome.

## Guardrails — unchanged, and nothing above or below relaxes them

Hard path denylist: `.github/**`, `tool/**`, any Gradle file (`**/*.gradle`,
`**/*.gradle.kts`, `gradle/**`, `**/gradle-wrapper.*`), any keystore or signing
material (`**/*.keystore`, `**/*.jks`, `**/key.properties`), `.env*`.
BRIEF_RULES

[ -n "${EXTRA_DENYLIST:-}" ] && echo "Additional paths for this repo: $EXTRA_DENYLIST"
echo "Never commit secrets. Keep the change minimal and idiomatic to the surrounding code."
