# Method 6 — OpenClaw

**Status: not started. Recipe only — no code in this repo, ever.**

## What it is

A self-hosted chat gateway (e.g. Telegram → agent). An *interface*, not an
executor: it is how a task gets dispatched from a phone, not where the work
runs.

## How it plugs in here

Recipe: point OpenClaw's agent at the `automation-dispatch` skill and the
sakalmaster MCP. "Queue the login-bug task" from a phone becomes a normal
dispatch — claim, brief, hand-off — and the result is a PR in the standard
gate. Nothing about the contract changes because the request came from chat;
that is the point of writing it down as a recipe here.

## Experiment log

*(empty — record setup, cost, and verdict per run here)*
