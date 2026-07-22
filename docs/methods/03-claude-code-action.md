# Method 3 — claude-code-action (GitHub Actions)

**Status: LIVE — the default method, now running as the extracted engine
(`sakal-dev/automation@v1`) with two caller repos: sakalpos-garage
(caller #1, converted) and sakalpos-owner (caller #2, onboarded by the
install skill).**

## What it is

Claude inside GitHub Actions via Anthropic's `claude-code-action`: `@claude`
on-demand (push) + scheduled sweep (pull) — the only method that is both.

## How it plugs in here

The five reusable workflows (`sweep`, `on-demand`, `automerge`,
`claude-done`, `verify`) + the composite actions are the engine; repos hold
~30-line callers. `tool/setup.sh`/`tool/verify.sh` own all stack knowledge.
The sweep is dual-source: `source: github` (default) or `sakalmaster`.

## Experiment log

### 2026-07-22 — extraction parity (session 2) — VERDICT: parity holds

Garage converted from 578 lines of inline workflow YAML to 102 caller lines.
Evidence, all on real queue items:

- Sweep run 29915349033: 5 issues oldest-first — #40/#43/#44/#46 blocked
  with reasoned comments, #45 implemented → PR #105 (`Closes #45`,
  verify-first evidence in body). `workflow_ref`-derived redispatch target
  confirmed in logs (`claude-daily-sweep.yml`).
- App-token PR: CI (`analyze-and-test` = setup-project + `./tool/verify.sh`)
  ran and passed on PR #105 — the inert-GITHUB_TOKEN trap avoided.
- `claude-done`: #45 flipped to `claude-done`, both in-progress markers
  cleared at PR-open.
- Review-default: automerge ran on the unlabelled PR and correctly did
  nothing. (Label-and-merge leg: issue labelled; the PR-side click is the
  human's by design.)
- Killed-run release: sweep #2 cancelled mid-claim on #47 — `always()`
  release ran under cancellation, label cleared, task requeued clean.
- On-demand: @claude summon answered in 35s of agent wall time through the
  caller; the two non-@claude comments skipped in ~1s each (the guard).
- Observation (not a defect): run 1 chose not to self-redispatch despite 13
  actionable issues remaining — same prompt text as pre-extraction, so
  model judgment; the crons cover it. Watch across future runs.

### 2026-07-22 — install-skill acceptance (session 3) — VERDICT: pass

sakalpos-owner onboarded by the `automation-install` procedure:
**14m11s** from preflight to merged onboarding PR (budget: 30m), no
hand-written YAML. Pre-flight local gate: analyze clean, 58/58 tests.
Pinned-toolchain gate proven on the PR's own CI (cold `setup-project`
install). Smoke issue #2 queued; **the sweep dispatch waits on the repo's
`CLAUDE_CODE_OAUTH_TOKEN`** (run `/install-github-app` there — the one step
only a human can do).

### 2026-07-22 — sakal source (session 4) — integrated seams verified locally

`tool/test-sakal-source.sh` against the local SakalMaster stack: 10/10
(exchange, atomic claim, heartbeat/progress, succeeded + park, block →
Needs-me, empty-queue none, runs visible). **Two findings**: (1)
`claim_next_task` lacks the app filter — formal request filed as
sakal-dev/sakalmaster#1; until it lands, only single-app projects may claim
filterless (contract invariant 4). (2) A `succeeded` run does NOT retire its
task — executors must park it (`set_task_agent_ready false`) or a chained
sweep re-claims the task it just finished; the sweep prompt and the worker
lifecycle both encode this now.

**Live flip procedure (deferred until staging + the app filter):** add
`SAKAL_URL`/`SAKAL_ANON_KEY`/`PROJECT`/`APP` inputs + `SAKAL_TOKEN` secret to
garage's sweep caller, set `source: sakalmaster`, seed one agent-ready task
for the garage app, `gh workflow run claude-daily-sweep.yml`, watch
Team · Agents show claim → heartbeats → succeeded with the PR ref.
