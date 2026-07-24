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
install).

**Smoke verify (2026-07-23, after the human's `/install-github-app`):
PASSED end to end.** The delayed cron sweep (queued from the secretless
night) claimed #2 at 02:55, verified the ACs, opened docs-only PR #4
(`Closes #2` + the RULES §9 changelog entry — honored unprompted),
`claude-done` flipped the labels, and the chain re-dispatch found the
empty queue and exited in seconds. Bonus proof: a manually dispatched run
queued behind the scheduled one in the singleton concurrency group — two
trigger sources, zero collision. PR #4 merged; #2 closed. The full
onboard→queue→drain loop is live on a second repo.

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

### 2026-07-24 — THE INTEGRATED FLIP (session 9) — VERDICT: the loop is closed

garage runs `source: sakalmaster` on engine v2 with **zero repo secrets and
zero repo variables**: OIDC (audience `sakalmaster`) maps the GitHub-signed
repository claim to project+app server-side — invariant 4 enforced by
signature, not configuration.

**The full both-products loop, proven on staging:** claim GR-T-001 (stale
lease auto-retired to `abandoned`) → step-fetched brief with DERIVED AC
statuses inlined → agent implements on the pinned toolchain → mechanical
judge re-runs `./tool/verify.sh`, detects PR #120, reports `succeeded`,
**parks the task** → merge at 08:18:31Z → **server-side verify-on-merge
(Dart resolver) flips AC-2 `broken → enforced` at 08:18:40Z — nine
seconds**. Nobody ticked a checkbox.

**Three findings, all fixed engine-side same-day:** (1) lifecycle-by-prompt
failed silently and invisibly (run 1: agent "success", nothing reported) —
v2.0.1 made BRIEF/GATE-report/park mechanical steps; the agent only
executes and signals endings (PR | `.sakal-outcome` evidence | blocked).
(2) A live lease correctly empties the queue — don't re-dispatch before
expiry (run 2, working as designed). (3) Schema-guessed REST selects — 
v2.0.3 + the rule: dry-run REST shapes locally before burning a run.

**Mirror rule:** structural — `Check for work` and the github agent step are
`skipped` in sakal mode (proven in every integrated run). **Block path:**
`block_run` → question raised (staging suite check 4). **Rollback drill:**
one line out → github run drained #119 (PR #122) → one line back →
confirmation run took the sakal path. Both directions proven.
