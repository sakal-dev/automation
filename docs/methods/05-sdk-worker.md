# Method 5 — Agent SDK worker (VPS)

**Status: built (TypeScript service compiles + typechecks against the real
SDK; denylist logic probe 10/10). Live drain + in-run hook-fire proof ride
with method 4's deferred token. The long-term worker.**

## What it is

The same engine as a library (`@anthropic-ai/claude-agent-sdk`), which buys
what `claude -p` cannot give: **the hard path denylist enforced as a
PreToolUse hook — code, not prompt text** (the point of this method; it is
defence-in-depth ON TOP of the prompt denylist, both stay), explicit
allowed-tools policy, heartbeats while streaming, graceful AbortController
cancellation on SIGTERM.

## How it plugs in here

`workers/sdk-worker/` (Node 22 TS service) in the same sandbox image. ONE
lifecycle with method 4: `workers/lib/lifecycle.sh`, consumed via
`lifecycle-cli.sh` — no second implementation, no drift. Claim-path choice:
**REST (via the shared lifecycle), not the sakalmaster MCP**, decided
because (a) the lifecycle must stay identical across methods 4/5 — an
MCP-claiming worker would fork it; (b) CI and workers share the
token-exchange REST contract already; MCP remains the interactive door. The
SDK's `mcpServers` hook stays open for a later experiment (agent-driven
progress notes mid-task).

## Experiment log

### 2026-07-22 — build + probes — PASS (no live run yet)

- `tsc` clean against the installed SDK; `npm run build` green.
- Denylist probe: 10/10 (`.github/**`, `tool/**`, gradle, keystores,
  `key.properties`, `.env*` denied; `lib/`, `docs/`, `test/`,
  `environment.dart` allowed — no false positives on lookalikes).
- Deferred: the two-issue drain (same repo/issues as method 4 for a fair
  table) + the probe task that tries to touch `.github/**` live (hook must
  block it mid-run) + integrated-mode heartbeats visible in Team · Agents
  and `abandoned` after a mid-task SIGTERM past lease expiry.

## Comparison table (fill with method 4's numbers when both drains run)

| | method 4 (loop) | method 5 (SDK) |
|---|---|---|
| setup cost | | |
| per-task wall time | | |
| token cost | | |
| control quality (hook fired on probe?) | n/a (prompt only) | |
| verdict | | |
