# Runbook — the failures we have actually seen, and the drill for each

Session-11 close-out. Entries are earned: each one happened live, with run
ids. The operate skill points here; keep entries in symptom → diagnosis →
fix → prevention shape.

## 1. The silent lifecycle failure (the ugliest one)

**Symptom.** An integrated sweep run shows green everywhere; SakalMaster
shows the run still `queued`/`running`, no heartbeat movement, no PR, task
still agent-ready. Nothing failed — and nothing happened.

**Seen live:** garage run 30075931979 (2026-07-24). Agent "success" in 14
turns; every lifecycle duty (heartbeat, report, PR, park) silently skipped;
the action hides agent output, so there was no way to even see why.

**Diagnosis drill.**
1. `gh run view <id>` — did the *sakal agent* step run and "succeed"
   suspiciously fast (<3 min)?
2. Ledger: `agent_runs` row unchanged since claim (`heartbeat_at` = claim
   time) → the agent never spoke to SakalMaster.
3. If on engine <v2.0.1: that IS the bug — upgrade.

**Fix.** Engine v2.0.1+ made lifecycle mechanical (step-fetched brief,
judge step re-runs the gate, reports, parks; `always()`). The stale run
self-heals: the lease expires and the next claim retires it `abandoned`.
Nothing to clean by hand.

**Prevention (the rule).** *A model-prompt instruction is not a mechanism.*
Anything that MUST happen lives in a step; the agent only executes and
signals. (First learned in the garage hardening; relearned here.)

## 2. Stuck `claude-working` label

**Symptom.** An issue is skipped by every sweep; label present; no live run.

**Seen live:** three distinct causes, all 2026-07-23: (a) foreground-trap —
SIGTERM never handled because bash defers traps during a foreground agent
(fixed: backgrounded agent + interruptible wait); (b) SIGKILL beat the SDK
worker's finally (fixed: SIGTERM fast-release); (c) label release retried
4× into a drained GraphQL pool (fixed: REST label ops everywhere).

**Drill.** Remove by REST (`gh api -X DELETE
repos/<r>/issues/<n>/labels/claude-working`), then check the run log for
which of (a)–(c) signatures it was; if the engine/worker is current, file it
— that's a new entry.

**Prevention.** Per-replica tokens (fleet rule); REST for label ops; the
retry-with-verify release. `claude-done` also heals claims at PR-open.

## 3. Engine tag moved / callers broken mid-run (simulated, not yet seen)

**Symptom.** Callers fail at workflow resolution or with input errors right
after an engine release.

**Drill.** `git log --oneline` on sakal-dev/automation tags: did floating
`v2` move? Pin the repo to the last immutable `v2.x.y` in one commit
(operate-skill upgrade procedure, reversed), file the engine issue.

**Prevention.** Immutable tags exist for exactly this; the floating tag only
moves on releases with notes; deprecations get one full release of overlap
(v1.1.0 → v2 was the template).

## 4. SakalMaster staging down mid-claim (simulated, not yet seen)

**Symptom.** Sakal-mode sweeps fail at the claim step (exchange/RPC errors).

**Drill.** Confirm with `curl -s <supabase>/functions/v1/token-exchange`
(expect 401 on a dummy token, not connection failure). While staging is
down: flip the caller to `source: github` (one line — the drilled rollback)
if there is mirrored work, else let crons idle (claim failure = failed run,
nothing stuck; leases expire).

**Recovery.** Re-flip; the first claim retires any stale runs as
`abandoned`. Proven in the 2026-07-24 rollback drill (#119 / PR #122).

## 5. A PR meets every precondition but never merges (v2.5.0+)

**Symptom.** Agent PRs stop auto-merging after the engine upgrade. CI is
green, the `auto-merge` label is on, nothing looks wrong, and nothing happens.

**Seen live:** predicted, not yet observed in production — this is the known
consequence of shipping `require_approval: true` into repos that have no
reviewer identity, so it is written down before it bites rather than after.

**Diagnosis drill.**
1. Read the automerge run's check log — `actions/review-state` prints every
   failed precondition per PR. "no approval (need at least 1)" is the tell.
2. `gh api repos/<r>/pulls/<n>/reviews --jq length` and
   `gh api repos/<r>/pulls/<n>/requested_reviewers` — both zero means nothing
   in the repo can ever approve this PR.
3. The engine also comments once on the PR saying exactly this. If that
   comment is there, stop diagnosing; it is this.

**Fix.** Either give the repo a reviewer identity (SKA-011) and request it, or
set `require_approval: false` on the automerge caller until you have one. A
human approving works too, and is the honest interim answer for a repo with
one maintainer.

**Prevention (the rule).** *A precondition nothing can satisfy is a stall, not
a gate.* Any new required condition ships with an answer to "what in this repo
can satisfy it today?", and the engine says so on the PR rather than sitting
silent.

## 6. `review:broken-anchors` on a PR nobody force-pushed

**Symptom.** A PR is labelled `review:broken-anchors`; the engine refuses to
rework or merge it; the author swears they only pushed normally.

**Diagnosis drill.**
1. `gh api repos/<r>/compare/<before>...<after> --jq .status` with the two
   shas from the workflow log. `diverged`/`behind` = history really was
   rewritten; `ahead` = the engine was wrong and that is a bug worth a report.
2. The usual innocent cause is a **rebase to satisfy "require branches to be
   up to date"** in branch protection. That setting and append-only fight each
   other — see `docs/branch-protection.md`.
3. `git reflog` on the branch, or the PR's force-push timeline entry, names
   who did it.

**Fix.** A human's call, deliberately: either re-review from scratch (remove
the label, ask the reviewer to look again — the old threads are unreliable) or
close the PR and open a fresh one. The engine will not clear this label
itself; a stale thread anchor is not something automation can judge.

**Prevention (the rule).** Turn OFF *require branches to be up to date*, turn
OFF *allow force pushes*. Merging main into the branch is append-only and
fine; rebasing is not.
