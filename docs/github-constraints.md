# GitHub constraints that shaped this system

Ported from the sakalpos-garage hardening (NOTES.md §5). These are platform
facts, not preferences — every workflow, action, and skill is designed around
them. Keep this file current: when a new constraint bites, add it here with
the same shape (the fact → what we do about it).

## 1. Scheduled cron is UTC and best-effort

**The fact.** `schedule:` crons are interpreted in UTC and run on a
best-effort basis: minutes late normally, up to ~an hour late under GitHub
load, occasionally skipped entirely.

**What we do.** Pick off-peak minutes (never `:00`/`:30` — the crowded
slots); buy *frequency* instead of punctuality — the check-for-work gate
makes idle runs ~free, so a frequent sweep that is often late still drains
the queue; never build anything that depends on a sweep firing at a
particular time.

## 2. A cron only exists on the default branch

**The fact.** A new or changed `schedule:` trigger has no effect until the
workflow file with it is on the repository's default branch. Testing a cron
from a feature branch silently does nothing.

**What we do.** Treat cron changes as landing-on-main events; the operate
skill's "sweep never ran" checklist starts here.

## 3. PRs opened by the built-in `GITHUB_TOKEN` are inert

**The fact.** A PR created with the workflow's own `GITHUB_TOKEN` does not
trigger CI (`pull_request` workflows don't fire) — GitHub's recursion guard.
For us that means the gate would silently never run on the PR.

**What we do.** Open all PRs (and perform merges) with the **app token**.
This is contract-level (`docs/task-contract.md`, gate rule 3), not a
workflow detail.

## 4. `Closes #n` linkage lags in the API

**The fact.** The API field linking a PR to the issue it closes updates
late — reading it right after PR creation often returns nothing.

**What we do.** Parse the `Closes #n` reference out of the **PR body** text
ourselves (claude-done does this for its label transitions).

## 5. Label reads can hit rate limits

**The fact.** Reading label state before writing (read-modify-write) burns
API calls and fails under rate limiting exactly when the system is busiest.

**What we do.** Label swaps are **unconditional and idempotent**: add/remove
without reading first; design every transition so applying it twice is
harmless.

## 6. Comment triggers fire on every comment

**The fact.** `issue_comment` fires for *every* comment in the repo — every
human reply, every bot note — not just `@claude` mentions.

**What we do.** Guard cheaply: an outer `if:` on the caller plus a first-step
guard so a non-matching comment decides and exits in ~1 second, before any
checkout or setup spends minutes of runner time.

## 7. Events made with `GITHUB_TOKEN` do not trigger workflows — except `workflow_dispatch`

**The fact.** The recursion guard behind constraint #3 is broader than PRs: a
comment, label, or push created with the workflow's own `GITHUB_TOKEN` fires no
`issue_comment`, `labeled`, or `push` workflow at all. The API call succeeds;
nothing downstream ever runs.

**The exception, and the engine depends on it:** `workflow_dispatch` and
`repository_dispatch` are explicitly carved out of the guard. That is why the
sweep's mechanical self-redispatch (`gh workflow run <caller>` with
`GITHUB_TOKEN`, v2.1.0) works at all. Do not "fix" it by adding a PAT.

**Reading the evidence:** a chain-fired run is indistinguishable from a human
one by actor — a `workflow_dispatch` run created by `GITHUB_TOKEN` is
attributed to the actor of the run that dispatched it, and for a scheduled run
that is whoever last touched the workflow file. **The only reliable proof the
chain fired is the `Continue the chain` step's own `::notice::` in the
PRECEDING run.** Never infer it from the event type or the actor.

**What we do.** No engine step ever hands work to another workflow by writing an
event and hoping. The review loop needed exactly that — "post `@claude` on the
PR and let on-demand pick it up" — and it would have been silently dead on
arrival; `review-loop.yml` runs the coder itself instead. Same lesson as
v2.0.1: an instruction is not a mechanism, and neither is an event nobody
delivers.

## 8. You cannot review your own pull request

**The fact.** `POST /pulls/{n}/reviews` with `event=APPROVE` or
`REQUEST_CHANGES` on a PR you authored returns **422** — *"Can not request
changes on your own pull request"*. Only `COMMENT` is allowed. This applies to
bot identities exactly as it does to humans.

**What we do.** The reviewer is a GitHub identity distinct from the coder
(contract step 4b, invariant 13), and the engine **asserts** the difference in
code rather than trusting configuration: a mis-wired reviewer would not error
in any place an operator looks — the review path would simply go quiet. It also
means no single-identity test can produce a live `changes_requested`, which is
why `tool/test-review-loop.sh` replays those events.

## 9. Review-thread resolution exists only in GraphQL

**The fact.** REST can list review comments but cannot tell you whether a
*thread* is resolved. `isResolved` lives on `reviewThreads`, which is GraphQL
only — as is `mergeStateStatus`.

**What we do.** `actions/review-state` reads the PR through one GraphQL query
that carries threads, per-reviewer latest verdicts, `reviewDecision`, and
`mergeStateStatus` together — one round-trip for facts REST cannot supply at
all. `mergeStateStatus: UNKNOWN` means "still computing" and is deliberately
NOT treated as disagreement; treating it as a block makes merges flaky.

## 10. A GraphQL connection past `first: 100` comes back **null**, not an error you notice

**The fact.** Connections cap `first:` at 100. Ask for more and the response
carries an `errors` array while that one connection resolves to `null` — its
siblings still return normal data, so the query *looks* like it worked.

**What we do.** Every connection is requested within the cap, and the file list
additionally carries `totalCount` so truncation is visible. Both ways of not
seeing the changed files — a null connection, or a PR with more than 100 of
them — **fail closed**, because an empty file list makes the guardrail check
pass vacuously and that is precisely the auto-merge of `CLAUDE.md` the
guardrail exists to prevent. *(Found live during SKA-010 with
`files(first:300)`, which had been returning no files at all.)*
