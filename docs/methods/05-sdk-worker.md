# Method 5 — Agent SDK worker (VPS)

**Status: LIVE-PROVEN (2026-07-23, local Docker host): 2/2 real issues
drained (PRs #12, #13 on sakalpos-owner), live kill test passed
(SIGTERM fast-release), and the hook denylist FIRED LIVE on a real agent's
`.github/` edit attempt. The long-term worker, now with evidence.**

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

### 2026-07-22 — build + probes — PASS

`tsc` clean against the installed SDK; denylist regex probe 10/10.

### 2026-07-23 — live drain (v4 wrapper): 2/2 + kill test + hook proof

Real queue: sakalpos-owner test-debt chores, same repo class as method 4.

- **#6 → PR #12** and **#8 → PR #13**, both gate-verified. (Per-task cost
  not captured — the container logs rotated during the fix cycle; capture
  on the next run. Wall time comparable to method 4's 15–19 min.)
- **Kill test on live work: PASS** — SIGTERM mid-agent → instant release
  (the fast-release path, added after the SDK's abort was observed to
  outlive a 30s stop grace and get SIGKILLed before the finally).
- **Hook denylist, both layers proven separately:** the QUEUE probe (#11 —
  a real task demanding a `.github/` edit) was refused at layer 1: the
  agent read the repo rules and never attempted the edit (success, no PR,
  hook untouched — the right outcome). The CONTROLLED probe (bare
  workspace, no repo rules, explicit instruction) forced layer 2:
  `[hook] BLOCKED Edit -> .github/workflows/x.yml` — the denylist held as
  CODE against a live agent (`probe-hook.mjs`, kept for re-runs).
- **Four wrapper findings fixed live** (see git log): hook
  execute/read false positives → write-tools only; redirect-token false
  positive → write-verb args + redirect targets only; SIGKILL vs finally →
  SIGTERM fast-release; late `error_during_execution` after a `success`
  result (a recurring SDK CLI quirk) must not override reality → sawSuccess
  falls through to gate + PR verification.

## Comparison table (real-run data)

| | method 4 (loop) | method 5 (SDK) |
|---|---|---|
| setup cost | image + env file | same + npm build |
| per-task wall time | 14.9–18.7 min | comparable (2 tasks) |
| token cost | $1.31–$2.64 | not captured (next run) |
| control quality | prompt denylist only | prompt + **hook fired live** |
| shutdown | trap release (proven) | fast-release (proven) |
| verdict | fine for steady drains | **the worker to grow**: same lifecycle, strictly more control; the hook is real defence, not theatre |
