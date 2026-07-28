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

### 2026-07-28 — experiment 1, dispatch ATTEMPTED: no work to dispatch

Not a run, and deliberately not a verdict. Recorded because "we tried and the
queue was empty" is a fact a future session should not have to rediscover.

**Queue state at 04:31 UTC**, both production repos:

| Repo | Mode | Actionable `claude-ready` | Evidence |
|---|---|---|---|
| sakalpos-garage | `sakalmaster` (integrated) | **0** | 15 open issues, *every one* carries `claude-blocked` |
| sakalpos-garage | — SakalMaster queue | **0** | sweep run `30308739096` (21:54 UTC): `SakalMaster queue empty for app 'sakalpos-garage'` |
| sakalpos-owner | `github` (standalone) | **0** | zero open issues at all |

Four garage issues (#48, #49, #51, #58) carry **both** `claude-ready` and
`claude-blocked` — the contradictory pair invariant 8's corollary forbids. The
authority gate is passive by design (v2.4.0): it warns, it does not clear
labels. Cosmetic here, because the blocks are real.

**The blocks are genuine, and that is the actual finding.** All four were
blocked by the coder on 2026-07-22 with verify-first evidence, and the last
comment on each is still the bot's — no maintainer has answered. Every one
needs a backend endpoint that does not exist or a product decision the sweep is
forbidden to guess (#48 AC-3 backend-dependent; #49 four ACs need endpoints or
a security decision; #51 one AC needs a product decision; #58 the check-in flow
keys on a plate). The queue is not empty through neglect. It is empty because
everything left needs a human first.

**Why we did not simply clear a block to feed the experiment.** Channel 1 spends
the *operator's personal quota*. Dispatching a task whose block is documented
and unanswered would spend that quota re-deriving the same block — and it would
poison the very comparison the experiment exists to make, which needs a task a
channel-2 sweep could actually have completed. A manufactured experiment is
worse than no experiment.

**A mode tension worth settling before the run.** The prepared experiment says
"the oldest actionable `claude-ready` issue in sakalpos-garage" — github-mode
framing. Garage runs `source: sakalmaster`, where GitHub issues are a **mirror**
and the SakalMaster queue is the source. A dispatch taken from the mirror
produces a PR with no claimed task and no `agent_runs` row, so the first Cloud
dispatch run would be **unrecorded on the SakalMaster side** — for a task whose
whole point is "an unlogged run doesn't exist". Either dispatch from the
SakalMaster queue via `sakal_get_brief` (the skill already supports it), or run
the experiment in a github-mode repo.

**What unblocks this, cheapest first:**

1. **The garage import (SKA-002)** fills the SakalMaster queue with real tasks →
   dispatch integrated, properly attributed. The route that matches garage's
   actual mode.
2. **The operator answers one of the four product questions** → that issue
   becomes genuinely actionable, and the block clears for a real reason.
3. **A new typed issue** with agent-completable ACs in either repo.
