# The task contract — SOURCE → BRIEF → EXECUTE → GATE

This is the specification every piece of SakalAutomation obeys. Reusable
workflows, composite actions, VPS workers, and dispatch skills are all
*implementations of this contract*; none of them may add to it or bypass it.
A new executor (an eighth method, a different runtime, someone else's agent)
is conformant if — and only if — it satisfies every MUST in this document.

Background and reasoning live in `NOTES.md`. Where this document is silent,
ask; do not invent.

```
1 SOURCE   where the task comes from      github issues | sakalmaster queue
2 BRIEF    what the agent is told         issue body + ACs | sakal_get_brief
3 EXECUTE  who does the work              methods 1–7 (NOTES.md §3)
4 GATE     how it is judged + reported    ./tool/verify.sh + PR → labels | agent_runs
```

## Modes

Every step runs in one of two modes, selected by a single input/env value that
threads through the whole pipeline:

```
source: github | sakalmaster
```

- **`github` (standalone)** — GitHub is the queue. Issues and labels carry
  state. No SakalMaster anywhere. This is the on-ramp: any repo can run it
  with nothing but this engine and two scripts.
- **`sakalmaster` (integrated)** — SakalMaster is the queue and the judge.
  Tasks are claimed via `claim_next_task`, briefs come from
  `sakal_get_brief`, runs are reported into `agent_runs`, and the citation
  verifier decides what the merged code actually *proved*.

The mode decides how steps 1, 2, and 4 talk to the outside world. **Step 3
never branches on it.** An executor receives a brief and produces a change;
it MUST NOT care where the task came from or who will judge it.

Transport rule (integrated mode): CI and non-interactive workers reach
SakalMaster via **REST** (token-exchange → PostgREST), per SakalMaster's
`docs/ci/agent-runs.md`. Interactive agents (Claude Code sessions, dispatch)
use the SakalMaster **MCP** server. Same operations, two doors.

## Vocabulary used below

- **Task** — one unit of claimable work: a GitHub issue (standalone) or a
  SakalMaster queue entry (integrated).
- **Run** — one attempt at one task by one executor. A task may have many
  runs; a run belongs to exactly one task.
- **Executor** — whatever performs step 3: any of the seven methods, or a
  future one.
- **Gate** — the machinery of step 4. The gate is *outside* the executor:
  different process, different trust domain.
- **App filter** — the SakalMaster granularity rule: automation installs per
  REPO; one repo = one SakalMaster APP; the queue lives per PROJECT. See
  step 1, integrated mode.

---

## Step 1 — SOURCE

*Where the task comes from, and the guarantee that no two runs work the same
task at the same time.*

**Consumes:** the mode; credentials for that mode; an identity for the
claimant (so claims and writes are attributable).

**Produces:** a **claimed task** — an exclusive, releasable lease on one unit
of work, plus the task's identifier and enough metadata to fetch its brief
(step 2). If there is no eligible work, SOURCE produces *nothing* and the
pipeline stops cheaply (an idle poll must cost approximately zero).

### `github` mode

- The queue is the set of issues in the target repo carrying the
  automation's "ready" label (exact label taxonomy is ported from
  sakalpos-garage during extraction; the contract requires only that
  *eligible*, *claimed*, and *done/blocked* are distinct, visible label
  states).
- **Claiming is done by label swap** (ready → claimed). The swap MUST be
  effectively atomic for the concurrency actually possible in this mode:
  workflow **concurrency groups** serialize runs so two sweeps cannot claim
  the same issue.
- **Release is mechanical.** The claim label MUST be removed by an `always()`
  step (or equivalent) that runs on success, failure, and cancellation. A
  crashed run MUST NOT leave a task claimed forever.
- Label operations MUST be unconditional and idempotent — label *reads* can
  hit rate limits, so never make a claim/release conditional on reading the
  current label state (see `docs/github-constraints.md`).

### `sakalmaster` mode

- The queue is SakalMaster's task queue, claimed with
  **`claim_next_task(project, app)`** — an **atomic, leased** claim.
- **The claim MUST be filtered by app.** A repo's automation may only claim
  tasks for the app that repo implements; an unfiltered claim would let (for
  example) garage's sweep grab Laravel-backend tasks it cannot build. If the
  claim RPC lacks the app filter, that is a SakalMaster change to request —
  never something to approximate on this side.
- The lease is the mutual-exclusion primitive. Because it is atomic, **N
  claimants are safe**: a CI sweep and a VPS worker (or N orchestrated
  workers, method 7) may poll the same app concurrently without double work.
- The lease MUST expire. A claimant that dies without reporting loses its
  lease and the task returns to the queue; the heartbeat (step 4) is what
  keeps a live run's lease alive.

### Push-only executors

Methods 1–2 (Claude Code on the web, Codex cloud) cannot poll a queue. For
them, SOURCE is performed *by the dispatch skill on their behalf*: dispatch
claims the task (in either mode, under the same rules above), then hands the
brief to the cloud session. The claim/lease semantics are unchanged — only
who executes them moves.

---

## Step 2 — BRIEF

*What the agent is told. The brief is the entire task interface: an executor
that needs information not in the brief is evidence the brief is incomplete —
fix the brief, not the executor.*

**Consumes:** a claimed task (step 1's output).

**Produces:** a **brief** — the full statement of work handed to the
executor. Whatever the mode, a brief MUST contain:

1. what to do (the goal),
2. how success is judged (acceptance criteria — the same criteria the gate
   will use),
3. where to do it (repo, and branch/base if not the default),
4. the standing constraints (the path denylist and the repo's own rules,
   e.g. its `CLAUDE.md`).

### `github` mode

The brief is assembled from the issue: title + body, with acceptance
criteria as part of the issue body (the issue template installed by the
plugin gives them a stable shape). The issue IS the brief; there is no
richer source to consult.

### `sakalmaster` mode

The brief comes from **`sakal_get_brief`** and is strictly richer: the story,
its acceptance criteria **with derived status** (so the executor knows which
ACs are already proven and which are open), existing citations, decisions
with rationale, and known blockers. Derived status is read-only context —
nothing in the brief is ever writable by the executor (see GATE invariants).

---

## Step 3 — EXECUTE

*Who does the work. The only step where the seven methods differ — and the
step with the fewest contract obligations, because executors are untrusted.*

**Consumes:** a brief.

**Produces:** a **proposed change** — a branch/PR with the work, plus the
executor's *claims* about what it did (PR description, cited files, and in
integrated mode, citations for ACs it believes it satisfied). Claims are
input to the gate, never conclusions.

Requirements on every executor, regardless of method:

- **Stack-blind engine.** The executor learns how to build and check the
  project only through the repo's own two scripts: `tool/setup.sh` prepares
  the environment, `tool/verify.sh` checks the work. The engine MUST NOT
  hard-code stack knowledge (Flutter vs Laravel vs React vs Electron is the
  repo's business).
- **Path denylist.** The executor MUST NOT modify: `.github/**`, `tool/**`,
  gradle/keystore files, `.env*`. This list is enforced structurally in
  workflow prompts (and any executor's equivalent), because it is what stops
  an agent from weakening its own guardrails or the gate that judges it.
- **Self-verification is advisory only.** An executor SHOULD run
  `./tool/verify.sh` before proposing its change — that is cheap and
  catches failures early — but a local pass carries no authority. Only the
  gate's own execution of the check counts (invariant 3).
- **Reporting while running** (integrated mode): the executor's harness
  sends heartbeats to `agent_runs` so a live run is distinguishable from a
  dead one, and the lease stays held.
- **Blocking is an outcome, not a failure.** An executor that cannot proceed
  for want of a decision reports *blocked* with its question (integrated:
  `agent_runs` block → surfaces as a question in Needs-me; standalone: a
  labelled comment on the issue). It MUST NOT guess and proceed.

Push vs pull is a method property, not a contract difference: methods 4–5
poll (pull), methods 1–2 are handed work by dispatch (push), method 3 does
both (`@claude` push, scheduled sweep pull). After step 3, every method's
output converges on the same object — a PR — and enters the same gate.

---

## Step 4 — GATE

*How the work is judged and reported. The gate is the trust boundary: it runs
outside the executor and takes none of the executor's claims on faith.*

**Consumes:** a proposed change (PR + claims) for a claimed task.

**Produces:** a **judged outcome**, recorded where the mode's source of truth
lives:

- pass → PR ready for review, or merged if auto-merge was opted into;
- fail → PR held/rejected with the verify output, task state updated;
- blocked → the executor's question routed to a human;
- and in every case, the claim released (step 1's mechanical release).

### Both modes — the universal gate

1. **`./tool/verify.sh` MUST pass before a PR is (or remains) proposable.**
   In method 3 the gate runs in-run before the PR is opened; for other
   methods it runs in CI against the PR. Either way it executes in the
   gate's environment, not the executor's.
2. **Merge is opt-in, per issue/task** (`auto-merge` label / flag). The
   default for every task is human review. Docs-only fast paths, where they
   exist, MUST exclude `CLAUDE.md` — an agent must never be able to weaken
   its own guardrails via an auto-merged "docs" PR.
3. PRs MUST be opened with the **app token**, not the built-in
   `GITHUB_TOKEN` — token-opened PRs are inert (no CI fires), which would
   silently skip the gate (see `docs/github-constraints.md`).

### `github` mode

CI is the judge. Verify passing + human review (or opted-in auto-merge) is
the whole verdict, recorded as label transitions on the issue and the merged
PR. Label transitions are mechanical (`claude-done` behaviour): state moves
because an event happened, never because an agent asserted it.

### `sakalmaster` mode

CI is the *first* judge; the **SakalMaster verifier is the second and
final** one. After merge, `sakal-verify` resolves the change's citations
against real source files, and AC status is *derived* from that — the
executor's claim that an AC is satisfied has zero direct effect on status.
The run's lifecycle (heartbeat / outcome / block) is recorded in
`agent_runs`, attributed to the claimant's identity, and the Team · Agents
dashboard derives its view from those records at read time.

---

## Invariants

These hold across every method, both modes, forever. A change that violates
one is a regression, not a redesign.

1. **Gate before PR.** No proposed change is mergeable without
   `./tool/verify.sh` passing in the gate's own environment.
2. **Merge is opt-in.** Review is the default; auto-merge requires an
   explicit per-task signal; `CLAUDE.md` is excluded from any docs-only
   fast path.
3. **Agents never verify their own claims.** The executor reports and cites;
   judgment belongs to the gate (CI standalone; CI + the SakalMaster
   verifier integrated). Nothing an executor writes can set an AC's status.
4. **Claims are filtered by app in integrated mode.**
   `claim_next_task(project, app)` — a repo's automation claims only work
   for its own app. Missing filter = SakalMaster feature request, not a
   workaround.
5. **Claims are exclusive and always released.** Atomic claim (lease or
   serialized label swap), mechanical release on every exit path, expiring
   lease so a dead claimant cannot wedge the queue.
6. **The executor is mode-blind and stack-blind.** Step 3 never branches on
   `source`; stack knowledge lives only in the repo's `tool/setup.sh` and
   `tool/verify.sh`.
7. **The denylist is structural.** `.github/**`, `tool/**`,
   gradle/keystores, `.env*` are untouchable by executors, enforced in the
   gate-side prompt/config an executor cannot edit (see invariant 3's
   trust boundary and the denylist itself, which protects it).
8. **Every write is attributed.** Claims, runs, PRs, and reports carry the
   identity of the actor (app token on GitHub; PAT-attributed writes in
   SakalMaster).

## Conformance checklist for a new executor

To add an executor (a new method, or a variant of an existing one), you must
be able to answer yes to all of:

- [ ] It receives its task through step 1's claim semantics (itself if it
      can poll; via dispatch if push-only) — never by scanning for work
      outside the queue.
- [ ] It takes its entire instruction from the step 2 brief.
- [ ] It runs `tool/setup.sh` to prepare and treats `tool/verify.sh` as the
      definition of "checks pass"; it contains no stack-specific logic.
- [ ] It cannot modify the denylisted paths.
- [ ] It does not branch on `source`.
- [ ] Its output is a PR + claims into the standard gate; it has no path to
      merge, label, or status that bypasses step 4.
- [ ] It reports liveness and outcome (heartbeat/outcome/block in integrated
      mode; issue/PR state in standalone), and its claim is released on
      every exit path.
- [ ] Its credentials are the org-level secrets; every action it takes is
      attributable to that identity.
