# Method 1 — Claude Code on the web

**Status: dispatch procedure real (automation-dispatch skill); first logged
experiment PREPARED, awaiting a human dispatch — the session runs on the
human's account and quota, so the hand-off step is theirs by design.**

## What it is

An Anthropic-hosted VM per task: push a task at it, it works in its own
sandbox, a PR comes back. Push-only — it cannot poll a queue.

## How it plugs in here

The `automation-dispatch` skill performs SOURCE + BRIEF (claim under the
normal rules, assemble the brief + the verbatim standing block, mark the
issue `Dispatched to method 1 — <link>`), the human pastes the brief into a
claude.ai/code session on the repo, and the returning PR enters the standard
gate. No merge path exists from the cloud side.

## Experiment log

### 2026-07-22 — experiment 1 (prepared, not yet run)

- **Task**: pick the oldest actionable `claude-ready` issue in
  sakalpos-garage not already claimed by the sweep chain, run
  `automation-dispatch` step by step, paste the brief into claude.ai/code.
- **Record here after the run**: setup friction (minutes from "dispatch" to
  "session working"), wall time to PR, quota consumed (session view), PR
  quality vs the method-3 sweep's PRs on comparable issues (verify-first
  evidence present? gate run? scope respected?), verdict.
- Blocked on: a human at the browser. Everything up to the paste is done by
  the skill.
