# Method 1 — Claude Code on the web

**Status: used ad-hoc for building; not yet wired into the contract.**

## What it is

An Anthropic-hosted VM per task: push a task at it, it works in its own
sandbox, a PR comes back. Push-only by nature — it cannot poll a queue.

## How it plugs in here

Via the `automation-dispatch` skill, which performs SOURCE + BRIEF on its
behalf (claim under the normal rules, assemble the brief, hand it to a cloud
session). The returning PR enters the standard gate — same verify, same
opt-in merge, same verifier in integrated mode. No code in this repo; the
skill is the whole integration.

## Experiment log

*(empty — record setup, cost, and verdict per run here)*
