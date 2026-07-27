#!/usr/bin/env bash
# =============================================================================
# review-anchors implementation (SKA-010). PURE: it decides whether a push kept
# the review threads anchored. It writes no labels and posts no comments.
#
# THE PROBLEM IT SOLVES. A review comment anchors to a commit. Force-push,
# rebase, or amend a reviewed branch and the anchor points at a commit that is
# no longer in the branch: the thread still renders, but it is discussing code
# that does not exist. An automation that keeps working such a PR is producing
# fixes for a review it cannot correctly read. Stopping is the safe answer; the
# loud part is the point.
#
# VERDICTS (stdout + $GITHUB_OUTPUT `verdict`):
#   no-reviews   the PR has never been reviewed → nothing to break; rebasing an
#                unreviewed branch is ordinary hygiene, not damage.
#   append-only  `before` is an ancestor of `after` (compare: ahead|identical).
#   rewritten    compare says behind/diverged, or `before` is gone entirely
#                (404 → the commit is unreachable, which IS a rewrite).
#   unknown      the comparison itself failed. NOT treated as a violation —
#                a flaky API call must not brand a PR as broken.
#
# Two callers, one rule: the `anchors` job (reacting to a synchronize event,
# where GitHub hands us before/after) and the rework job's post-run check
# (where the engine recorded `before` itself). Same script, so an engine push
# and a human push are judged identically.
# =============================================================================
set -uo pipefail

verdict() { echo "$1"; echo "verdict=$1" >> "${GITHUB_OUTPUT:-/dev/null}"; }

reviews=$(gh api "repos/$REPO/pulls/$PR/reviews" --jq 'length' 2>/dev/null || echo "err")
if [ "$reviews" = "err" ]; then
  echo "::warning::review-anchors: cannot read reviews on #$PR — no verdict"
  verdict unknown; exit 0
fi
if [ "${reviews:-0}" -lt 1 ] && [ "${FORCE_CHECK:-false}" != "true" ]; then
  echo "::notice::review-anchors: #$PR has no reviews yet — no anchors to break"
  verdict no-reviews; exit 0
fi

if [ -z "${BEFORE:-}" ] || [ -z "${AFTER:-}" ]; then
  echo "::warning::review-anchors: missing before/after sha — no verdict"
  verdict unknown; exit 0
fi
if [ "$BEFORE" = "$AFTER" ]; then
  echo "::notice::review-anchors: head unchanged"
  verdict append-only; exit 0
fi

# Lineage from GitHub rather than a checkout: cheaper, and it still works when
# the old commit is already unreachable in a clone.
raw=$(gh api "repos/$REPO/compare/$BEFORE...$AFTER" --jq '.status' 2>/dev/null)
rc=$?
status="${raw:-}"
echo "compare $BEFORE...$AFTER → status=${status:-<none>} rc=$rc"

if [ $rc -ne 0 ] || [ -z "$status" ]; then
  # A 404 here means `before` is unreachable — the rewrite already happened and
  # took the old commit with it. Distinguish it from a transport failure by
  # asking whether the commit resolves at all.
  if gh api "repos/$REPO/commits/$BEFORE" --jq '.sha' >/dev/null 2>&1; then
    echo "::warning::review-anchors: compare failed but $BEFORE still resolves — treating as unknown, not a violation"
    verdict unknown; exit 0
  fi
  echo "::error::review-anchors: $BEFORE is unreachable in $REPO — the branch history was rewritten"
  verdict rewritten; exit 0
fi

case "$status" in
  ahead|identical)
    echo "::notice::review-anchors: append-only ($status) — thread anchors intact"
    verdict append-only ;;
  behind|diverged)
    echo "::error::review-anchors: FORCE-PUSH DETECTED on reviewed PR #$PR (compare status=$status)"
    verdict rewritten ;;
  *)
    echo "::warning::review-anchors: unexpected compare status '$status' — no verdict"
    verdict unknown ;;
esac
