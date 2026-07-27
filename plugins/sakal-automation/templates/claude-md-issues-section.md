<!-- Installed into each repo's CLAUDE.md by automation-install. Teaches any
     Claude working in this repo (Cowork, Claude Code, autonomous runs) how
     issues work here. -->

## Filing and reading issues

Issues in this repo follow ten typed forms (`.github/ISSUE_TEMPLATE/`). When you
create an issue — via `gh issue create` or any tool — you MUST use the matching
skeleton and label set from
`sakal-dev/automation → plugins/sakal-automation/templates/ISSUE-SKELETONS.md`.
Never create an untyped/blank issue.

- Title: `<STORY-ID>: <outcome>` (outcome, not activity).
- One issue = one PR = one agent run; >~5 ACs or >1 module → split, under an epic.
- `claude-ready` queues an issue for agents. Epics, questions, and security issues
  are never queued by default. `priority:urgent` is worked first and **never
  auto-merges**. Spikes merge **no production code**.
- When working an issue: the issue is your brief. VERIFY-FIRST against the code,
  respect `Out of scope` literally, and treat `./tool/verify.sh` as the definition
  of "checks pass".
- When *filing* a bug you discovered: fill `Violates` honestly — naming the spec
  line it falsifies, or stating "no written claim exists" (that is a finding).

## When your PR gets a review

A PR here does not merge just because CI is green: it needs an approval, zero
open change-requests, and zero unresolved threads (RULES §7). If a reviewer asks
for changes you get another round on the **same branch**, and the rules of that
round are binding (RULES §10):

- **Append-only.** Never force-push, rebase, or amend a branch that has been
  reviewed — review comments anchor to commits, and rewriting history detaches
  every thread from the code it is about. The engine detects it and stops.
- **Reply to threads, never resolve them.** Name the commit that fixes each
  point. Only the reviewer or a human resolves a thread. Disagree in the thread
  if you think a point is wrong; do not silently skip it.
- **Two rework rounds, then a human** takes over (`review:escalated`).
- **A red CI check is not a review round** — fix it and push.
- You never review or approve your own PR, and you never merge.
