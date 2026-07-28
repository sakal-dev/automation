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
  workflow **concurrency groups** serialize the claimants. The groups are
  per-workflow, not shared: the sweep runs as a repo-wide singleton (two
  sweeps never overlap), while on-demand serializes **per issue** — parallel
  across issues, but two near-simultaneous summons on the same issue queue
  behind each other, which is what closes the check-then-act claim race.
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
   exist, MUST exclude the **guardrail paths** — `CLAUDE.md`, the repo's
   rules doc (e.g. `docs/RULES.md`), and `.github/**`, extendable per repo —
   an agent must never be able to weaken its own guardrails or the gate via
   an auto-merged "docs" PR.
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

## Step 4b — REVIEW

*What happens between "a PR exists" and "a PR merges". Not every PR is right
the first time; this step is the whole back-and-forth, and it has rules.*

**Consumes:** an open PR from step 3, and the reviews humans and agents leave
on it.

**Produces:** either a PR that meets every merge precondition, or a PR handed
to a human with the reason written down. Never an open-ended loop.

### The roles

| Role | Who | Rule |
|---|---|---|
| **Coder** | the agent that authored the PR | answers reviews; never reviews its own work |
| **Reviewer** | an **independent identity** — a different agent, or a human | never the author, ever |
| **Judge** | CI | mechanical; a check is green or it is not |
| **Merger** | the automerge gate | merges only on the full precondition set below |
| **Operator** | the human with write access | final authority, always |

**The reviewer is a different GitHub identity from the author, and this is
asserted in code, not assumed from configuration.** GitHub refuses `APPROVE`
and `REQUEST_CHANGES` on your own pull request (verified: HTTP 422, *"Can not
request changes on your own pull request"*), so a mis-wired reviewer identity
does not fail loudly — the review path simply goes quiet, which is the worst
way for a safety mechanism to break. Humans may review at any time, in any
role, without configuration.

**Which identity — and no new install for it.** A dedicated reviewer App would
mean a second installation in every customer org, which `ZERO-CONFIG` forbids:
one install per customer, ever. The reviewer therefore reuses an identity that
already exists and already is not the coder — the **SakalMaster App** in
integrated mode (its token minted server-side from an OIDC proof, so the private
key never reaches a runner or a repo secret), and **`github-actions[bot]`** in
standalone mode. Full reasoning, the accepted key-concentration trade, and the
two things that must land before the integrated path works: `docs/REVIEWER.md`.

**The reviewer cannot merge, structurally.** Merging a PR requires
`contents: write`; the reviewer job grants `contents: read` and the SakalMaster
App installation is granted `contents: read`. *The SakalMaster App must never be
granted `Contents: Write`* — that single rider is what keeps "judges the work"
and "lands the work" apart, on both paths.

**A review always ends in a verdict.** Findings without a verdict is not a
review; it is a pile of comments that decides nothing. An `approve` carries a
summary (no bare stamps), and a `request-changes` states **what would flip it**
— the coder has two rounds, and "fix it" spends one on nothing. Where an honest
verdict is impossible — a diff too large to have been read, or a PR the platform
cannot review because the reviewer authored it — the reviewer says exactly that
as a `comment` verdict and asks for a human. It never skips silently: a PR
nobody reviewed must not look reviewed.

### Merge preconditions — all of them, every time

A PR merges automatically only when **all** of these hold:

1. the PR is open and not a draft;
2. `auto-merge` is on the PR or a linked issue (merge stays opt-in, invariant 2);
3. no guardrail path is touched;
4. no hard-stop label: `needs-human-merge`, `review:escalated`,
   `review:broken-anchors`, `priority:urgent`;
5. the named CI check is green;
6. at least **one current approval** — an approval given for a commit that is
   no longer the head is void;
7. **zero open change-requests** (latest review per reviewer);
8. **zero unresolved review threads**;
9. GitHub's own `reviewDecision` / `mergeStateStatus` does not disagree;
10. the full changed-file list is readable — a list too large to see is a list
    whose guardrail check cannot be trusted.

**Docs-only PRs keep their reviewless fast path**, deliberately: a PR whose
every file the repo's CI path-ignores waives (5) and (6), because CI produces
no check for it and requiring an approval would deadlock the fast path that
exists to move documentation quickly. It waives nothing else. An open
change-request or an unresolved thread stops a docs PR exactly as it stops a
code PR — a human who said "no" to a docs change said no.

**Approve-with-comments is a comment, not consent.** An approval alongside
open threads does not satisfy (8). If the reviewer meant "ship it", they
resolve the threads.

### The rework cycle

```
changes_requested → rework brief (the review, verbatim) → coder appends commits
                  → gate re-runs → same reviewer re-requested → …
```

- The brief carries the review body and **every unresolved thread**, verbatim,
  including threads from earlier rounds the coder never answered. Summarising a
  review is the engine deciding which of the reviewer's points matter, and that
  is not the engine's decision to make.
- **Commits are APPEND-ONLY.** After the first review, force-push, rebase, and
  amend are forbidden: review comments anchor to commits, and rewriting history
  points every thread at code that is no longer in the branch. The engine
  detects a rewrite (commit lineage, from GitHub's own compare) and **stops the
  automation loop for that PR loudly** rather than working from anchors that
  mean nothing.
- The coder **replies** to every thread it addressed, naming the fixing commit.
  It never **resolves** a thread — only the reviewer or a human resolves.
  Disagreeing in the thread is allowed; silently ignoring is not.
- The engine re-requests the **same** reviewer. The reviewer who raised the
  points is the one who can say whether they were met.
- Every rework round is a normal engine run: same gate, same measured cost,
  same reporting as any other.

### The cap

**Two rework rounds per PR.** The request-changes *after* the cap does not
start another round: it escalates to a human with a comment and the
`review:escalated` label, and the loop stops. Past round two a coder and a
reviewer are negotiating with each other on the operator's money, and a human
reading the thread is both cheaper and more likely to be right.

The round count is durable, and deliberately has two sources: GitHub's review
history (the count of `changes_requested` reviews) and a marker in the PR body.
The engine takes the **higher** of the two. Neither alone survives contact with
reality — dismissing a review rewrites its state and erases it from history,
and a PR body can be edited — so lowering the count requires defeating both,
which is a deliberate act by someone entitled to perform it.

### Disagreement

**Most-restrictive-wins.** A `changes_requested` outlives an approval until its
own author, or a human, dismisses or resolves it. A human requesting changes
while an agent approves means the PR does not merge; the reverse is equally
true. When GitHub's own view disagrees with the engine's count, **GitHub
wins** — branch protection, CODEOWNERS, and required reviewers are rules the
engine cannot see.

### Reviewer silence

A re-review requested and unanswered gets **one** nudge comment, then a
`review:stale` marker, then nothing. Re-requesting on a timer is spam with a
cron attached.

### CI-red is not a review event

A failed check is not a change-request. The coder fixes and re-pushes; **no
rework round is consumed**. A flaky test must never spend a repo's rework
budget.

### The operator's override

An operator may merge over any bot's open change-request, at any time, and that
is final. The engine records it in exactly one comment and does nothing else:
it does not reopen, does not queue rework, and no bot raises those points again
on that PR. This is invariant 8 (a maintainer's answer is authoritative and
durable) applied one layer up — from questions to reviews.

### Workflow labels

Review-loop state lives in its **own namespace**: `review:rework`,
`review:escalated`, `review:stale`, `review:broken-anchors`, plus
`needs-human-merge`. `claude-ready` and `claude-blocked` are the operator's
steering wheel and stay human-steered (v2.4.0) — the review loop never touches
them.

---

## Invariants

These hold across every method, both modes, forever. A change that violates
one is a regression, not a redesign.

1. **Gate before PR.** No proposed change is mergeable without
   `./tool/verify.sh` passing in the gate's own environment.
2. **Merge is opt-in.** Review is the default; auto-merge requires an
   explicit per-task signal; the guardrail paths (`CLAUDE.md`, the repo's
   rules doc, `.github/**`, extendable per repo) are excluded from any
   docs-only fast path.
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
8. **A maintainer's answer is authoritative and durable.** When a human with
   write access answers a blocked question, that answer outranks any amount of
   the executor's own re-derivation — forever, not until the next run. An
   executor may re-raise a settled question ONLY when the facts it derives
   from have actually changed, and must say what changed; "I reached the same
   conclusion again" is not new evidence. The symmetry holds both ways: a
   maintainer re-applying the block is equally authoritative. Corollary: the
   block state and the queue state are mutually exclusive — an item is never
   both blocked and queued, and any executor that sees both repairs it.
   *(Enforced mechanically by `actions/authority-gate`; earned by garage#22,
   where the sweep re-asked a question the maintainer had answered and left
   the issue carrying both labels.)*

9. **Every write is attributed.** Claims, runs, PRs, and reports carry the
   identity of the actor (app token on GitHub; PAT-attributed writes in
   SakalMaster).

10. **Merge requires the whole precondition set, and any one of them is a hard
    stop.** Not draft · opted in · no guardrail path · no hard-stop label · CI
    green · ≥1 current approval · zero open change-requests · zero unresolved
    threads · GitHub does not disagree · the changed-file list is readable. The
    docs-only fast path waives only CI and the approval, and nothing else, ever.
    Where the engine cannot see the truth — an unreadable PR, a file list past
    the page cap — it holds. A gate that fails open is not a gate.

11. **A reviewed branch is append-only.** After the first review, history is not
    rewritten: review comments anchor to commits, and a rewrite points every
    thread at code that is no longer there. The engine detects a rewrite and
    stops the loop for that PR rather than acting on broken anchors. *(Before
    the first review there is nothing to break, and a rebase is ordinary
    hygiene.)*

12. **A review conversation is bounded.** Two rework rounds per PR, counted
    durably (review history and a PR-body marker, whichever is higher); the
    request-changes past the cap escalates to a human and the loop stops. An
    agent pair that can talk forever will.

13. **The reviewer is never the author.** Independence is asserted in code, not
    configured — GitHub refuses self-review by returning 422, so a mis-wired
    identity makes the review path go silent instead of failing loudly.

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
- [ ] When a review requests changes on its PR, it appends commits — it never
      force-pushes, rebases, or amends a reviewed branch (step 4b).
- [ ] It replies to review threads and never resolves them.
- [ ] It cannot review or approve its own PR, and it cannot merge one.

To add a **reviewer** (a review agent, a second provider, a service), you must
additionally be able to answer yes to all of:

- [ ] It authenticates as a GitHub identity distinct from every coder identity
      in the repo.
- [ ] Its verdicts are `APPROVE` / `REQUEST_CHANGES` / `COMMENT` on the PR —
      it has no path to merge, label, or status that bypasses step 4.
- [ ] It resolves only threads it owns, and it never edits the branch.
- [ ] It accepts that the operator can merge over it, and it does not re-raise
      a point on a PR that was merged over its objection.
