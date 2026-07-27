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

## Verdict table — the eight agent PRs of 2026-07-27 (SKA-001 completion)

Owed since SKA-001, missed again in SKA-003; written **here** rather than in a
chat report so there is no fourth time. Verdicts are the reviewer's, stated
post-fix, against the merged heads. Read-only review; every PR had already been
merged by the operator when this table was produced, so the merge-order column
is what the order *should* have been and, where it differs, what actually
happened.

| PR | Repo | Title | Verdict | Top risk | Merge-order note |
|---|---|---|---|---|---|
| **#115** `aefe9c7` | garage | GR-12-06 · Honest offline wording + short lookup timeout | **approve** | None. A 4 s `.timeout()` on the plate lookup is a *new* failure mode only in that it converts a hang into a cache hit — the fallback path already existed and `TimeoutException` lands in the same `catch`. Timeout is constructor-injectable, so the test drives it rather than sleeping. | Independent. Any position. |
| **#116** `f363688` | garage | GR-12-04 · Unfinished draft for this vehicle | **approve** (was *request-changes* pre-fix) | **Was the one dangerous PR in the set**: `deleteDraft` forwarded straight to `deleteJobCascade` — an irreversible cascade delete of captured lines and photo rows, reachable from the UI, with no status check. Now guarded **in the repository** (not a controller), throwing `StateError` unless `status == 'draft'`, plus a null-job guard; 4 refusal tests assert the job *survives* a refused delete. Guard placement is right: it covers paths that do not exist yet. | Land **after** the guard, which is what happened (ruling 1a). Independent of the others. |
| **#117** `f0b9f92` | garage | GR-11-01a · Unified search: single-result direct nav + offline message | **approve** | None. Net −11 lines in the controller; the branching moves into a small `SearchOutcome` type that is unit-tested on its own. Behaviour change is navigational only. | Independent. Any position. |
| **#122** `9f90862` | garage | GR-DOC-1 · Record the SakalMaster integrated flip in the changelog | **approve** (was *request-changes* pre-fix) | Documentation that was **wrong in the dangerous direction**: the rollback clause named `source: sakalmaster` — the flip's own value — so anyone following it during an incident would have "rolled back" to the state they were escaping. Now reads `source: github`, verified in the merged diff. Zero code. | Last of the garage four (docs-only; no `analyze-and-test` by design — `paths-ignore`). |
| **#9** `0023d4c` | owner | OA-07-T1: unit tests for session variance-by-cashier math | **approve** | None. Tests only; money math, which is the right thing to lock. | **Before #10** — both prepend `docs/CHANGELOG-RECENT.md`; #9 first, then #10 rebased. |
| **#10** `5fe8381` | owner | OA-03-T1: unit tests for the alerts unread-badge count | **approve** | None. Tests only. | **After #9, rebased.** Conflict confirmed pre-merge and resolved by keeping *both* changelog entries (head `5fe8381`); landed via automerge on CI-green. |
| **#12** `b5e0bf5` | owner | test: add edge-case tests for location best/worst highlighting | **approve** — *with the caveat that was escalated and ruled on* | Not a defect but a **decision**: the tie-break tests pin "first shop wins" as a tested contract. Ruled **intended** (1b), so it is now load-bearing — changing the ordering later breaks a test on purpose, which is the point. Also covers negatives and zero-vs-positive. | Independent. |
| **#13** `227a26e` | owner | OA-08-T1: Unit tests for on-shift staff stats | **approve** | None. Tests only, no production code. | Independent. |

**Summary:** 8 reviewed → 6 approve outright, 2 that were **request-changes**
and became approve only after SKA-003's fixes (#116's cascade guard, #122's
inverted rollback clause). Both of those were found by reading the diff, not
the description — #116's PR body described a UI feature and #122's described a
changelog entry.

**Attribution note worth keeping:** the garage four are authored by
`app/claude` (the GitHub App, channel 2); the owner four by `limsocheat` —
those came from a VPS worker using a per-host `GH_TOKEN`, which is the owner's
PAT (channels 3/4, per-replica credentials by design). "Agent PR" is not
readable from the author field alone; the branch prefix and the run record are
what identify one.

## Row 6 — the redispatch chain did NOT fire on 2026-07-27, and could not have

The close-out checklist assumed "≥2 merges arm the mechanical chain". **That
assumption is wrong**, and the run record says so plainly. Evidence, then the
correction.

**Every sweep run on 2026-07-27, both repos, step-by-step:**

| Run | Repo | Time (UTC) | Event | `Continue the chain` | Annotation |
|---|---|---|---|---|---|
| 30243958869 | garage | 06:48 | schedule | **skipped** | `PAUSED (project) — SakalMaster is withholding work deliberately` |
| 30251604537 | garage | 08:53 | schedule | **skipped** | `PAUSED (project)` |
| 30271883580 | garage | 13:46 | workflow_dispatch | **skipped** | `SakalMaster queue empty for app 'sakalpos-garage'` |
| 30273408198 | garage | 14:05 | workflow_dispatch | **skipped** | `SakalMaster queue empty for app 'sakalpos-garage'` |
| — | owner | — | — | — | **no sweep ran at all on 07-27** (last: 30223432509, 07-26 22:35, `No actionable claude-ready issues`) |

The merge wave itself was 14:26–15:09 UTC. No sweep ran inside it, and the two
`workflow_dispatch` runs that *look* like chain fires predate it — they cannot
be chain fires either, because **no run today reached the chain step at all**.
(Actor is no help here: a `GITHUB_TOKEN` dispatch inherits the actor of the run
that dispatched it — see `docs/github-constraints.md` #7. The `::notice::` in
the preceding run is the only proof.)

**Why it could not fire — two different reasons per repo:**

- **garage runs `source: sakalmaster`.** The chain's precondition there is *a
  task was claimed AND the run ended succeeded/blocked*. The SakalMaster queue
  was paused all morning and empty all afternoon, so nothing was ever claimed.
  Merging GitHub PRs does not enqueue SakalMaster tasks — in integrated mode
  GitHub issues are a **mirror**, so the merge wave was invisible to the queue
  that actually arms the chain.
- **owner runs `source: github`** (no `source:` in its caller) with cron
  `39 15,21`. Its queue held **zero** actionable `claude-ready` issues, and the
  15:39 slot had not produced a run by 16:01 — best-effort cron, constraint #1.

**The correction, and it is the useful part.** Merges *drain* a queue; they
never fill one. The chain fires when a sweep makes **partial** progress:

```
end_count > 0  AND  end_count < start_count
```

Both bounds matter. `end_count == 0` logs *"queue empty — done"* and stops;
`end_count >= start_count` logs *"no progress — stopping, not looping"*. So the
chain is unobservable unless a single sweep **cannot finish the queue** —
i.e. `actionable claude-ready > max_issues` (default 5). The queue has never
once been that deep, which is the whole reason this path is still unobserved.
It is not a latent bug; it has simply never been reachable.

**Cheapest deterministic drill** (operator's call — it spends real agent runs
at ≈$1.8/issue):

1. In **owner** (github mode — garage cannot do this without un-flipping it),
   label **6** genuinely ready backlog issues `claude-ready`.
2. Dispatch `claude-daily-sweep.yml` manually.
3. The sweep works 5, leaves 1 → `start=6, end=1` → chain fires.
4. Proof to capture: `::notice::chain: re-dispatched claude-daily-sweep.yml` in
   run *N*, and a `workflow_dispatch` run *N+1* starting within ~a minute.

Cost ≈ 5 issues. A cheaper variant — 2 issues with `max_issues: 1` — needs the
caller to expose that input, and the caller is the operator's file
(`.github/**` is denylisted for agents), so it is a one-line operator edit if
the cheaper drill is preferred.
