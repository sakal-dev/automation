# Method 5 — Agent SDK worker (VPS)

**Status: not started. The long-term worker.**

## What it is

The same engine as method 4 but as a library: a long-running process on the
Claude Agent SDK with a real job queue, structured error handling, and per-run
telemetry — the executor you'd actually operate at scale.

## How it plugs in here

`workers/sdk-worker/`, in the same Docker sandbox. Integrated mode uses the
sakalmaster MCP server directly (a long-lived worker can hold an MCP session;
CI cannot). Standalone mode uses the `gh` CLI. Built after method 4 has
taught its lessons; it is also the unit method 7 (orchestrators) runs N
copies of.

## Experiment log

*(empty — record setup, cost, and verdict per run here)*
