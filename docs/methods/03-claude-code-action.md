# Method 3 — claude-code-action (GitHub Actions)

**Status: LIVE on sakalpos-garage — the current experiment, the hardened
system, and the default method.**

## What it is

Claude running inside GitHub Actions via Anthropic's official
`claude-code-action`: `@claude` mentions for on-demand work (push) plus a
scheduled sweep that drains the queue (pull) — the only method that is both.

## How it plugs in here

This is the method the `.github/workflows/` reusable workflows serve: sweep,
on-demand, automerge, claude-done, verify. Today they live inline in
sakalpos-garage; the next session extracts them into this repo as
`workflow_call` engines and converts garage into caller #1, proving parity
(the same issues must drain identically). The garage hardening rules — opt-in
merge, denylist, mechanical release, app-token PRs — are already contract
invariants.

## Experiment log

*(empty here — the garage learnings to date live in NOTES.md §5 and
`docs/github-constraints.md`; new entries go here)*
