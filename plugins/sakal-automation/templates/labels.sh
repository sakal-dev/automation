#!/usr/bin/env bash
# Create/update the standard label set in a repo. Idempotent (--force updates
# colour/description on existing labels; never deletes).
# Usage: ./labels.sh <owner/repo>
set -euo pipefail
REPO="${1:?usage: labels.sh <owner/repo>}"

l() { gh label create "$1" -R "$REPO" --force --color "$2" --description "$3"; }

# ── Queue (machine-read by the automation engine) ────────────────────────────
l claude-ready    "1D76DB" "Queued for an agent"
l claude-working  "FBCA04" "An agent run has claimed this; removed mechanically at run end"
l claude-blocked  "D93F0B" "Agent stopped — needs a human answer; remove to re-queue"
l claude-done     "0E8A16" "PR open and ready for review"
# ── Merge & model control (machine-read) ─────────────────────────────────────
l auto-merge      "5319E7" "Opt-in: merge automatically once EVERY precondition holds"
l review          "C2E0C6" "Request a Claude code review on the PR"
# ── Review loop (machine-read; own namespace, never mixed with claude-*) ──────
# claude-ready / claude-blocked stay the MAINTAINER's steering wheel; these are
# the engine's own state and it is the only thing that sets them.
l needs-human-merge      "0E0E0E" "Hard stop: this PR/area is merged by a human only"
l "review:rework"        "FBCA04" "A rework round is in flight for this PR"
l "review:escalated"     "B60205" "Rework cap reached — a human owns this PR now"
l "review:stale"         "BFBFBF" "Re-review requested and unanswered past the stale window"
l "review:broken-anchors" "D93F0B" "History rewritten after a review — thread anchors broken; automation stopped"
l opus            "BFD4F2" "Model override for on-demand runs"
l sonnet          "BFD4F2" "Model override for on-demand runs"
l fable           "BFD4F2" "Model override for on-demand runs"
# ── Type (one per issue; forms apply these) ──────────────────────────────────
l type:feature    "A2EEEF" "New capability"
l type:bug        "D73A4A" "Behaviour deviates from intent (falsification)"
l type:chore      "FEF2C0" "Maintenance; behaviour unchanged"
l type:refactor   "E4C5F9" "Restructure; behaviour preserved"
l type:docs       "0075CA" "Documentation only"
l type:spike      "8250DF" "Investigation; output is knowledge, no production code"
l type:epic       "3E4B9E" "Container; children are worked, never the epic"
l type:question   "D876E3" "Discussion; never enters the agent queue"
l type:security   "B60205" "Security defect/hardening; always human-reviewed"
# ── Priority ─────────────────────────────────────────────────────────────────
l priority:urgent "B60205" "Worked first; NEVER auto-merged"
# ── Area (EDIT PER REPO: one label per module; these become SakalMaster facets)
# l area:reports  "C5DEF5" "Reports module"
# l area:sync     "C5DEF5" "Sync engine"
echo "Labels ensured on $REPO. Add area:* labels for this repo's modules."
