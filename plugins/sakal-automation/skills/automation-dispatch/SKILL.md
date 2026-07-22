---
name: automation-dispatch
description: Hand one task to a push-only cloud executor — Claude Code on the web (method 1) or Codex cloud (method 2). Use when the user says "dispatch this issue to Claude Code on the web", "send this task to a cloud session", "push this to Codex", or wants a queued task run on a hosted VM instead of CI. Also handles "check on my dispatch".
---

# automation-dispatch

Methods 1–2 cannot poll a queue, so this skill performs SOURCE + BRIEF on
their behalf (`docs/task-contract.md` §Push-only executors) and hands over a
complete brief. The result returns as a PR into the exact same gate as every
other method — dispatch adds no second judgement path and NEVER merges.

Surfaces move fast — on first use in a while, sanity-check the target's
current session-creation flow (method 1: claude.ai/code with the GitHub app
connected; method 2: the Codex surface in ChatGPT with its GitHub connector)
before promising the user a shape.

## Dispatch procedure

1. **Source the task** — one of:
   - a GitHub issue number: `gh issue view <n> --json title,body,labels`.
     Must be a TYPED issue (`type:*` label present); refuse blanks — fix the
     issue first (see `ISSUE-SKELETONS.md`).
   - integrated mode: a SakalMaster task via the sakalmaster MCP
     (`sakal_get_brief` for its story). Claim it first (`claim_next_task`) —
     never hand out unclaimed work.
2. **Assemble the dispatch brief** — the issue/brief body verbatim, plus repo
   pointers (repo URL, default branch), plus this standing block, always,
   word for word:

   > Work ONLY on this task, in <owner/repo>, on a branch
   > `claude/issue-<n>-<slug>`. First run `./tool/setup.sh`; treat
   > `./tool/verify.sh` as the merge gate — it MUST exit 0 before you open a
   > PR. Never touch `.github/**`, `tool/**`, gradle/keystore files, or
   > `.env*`. Respect the issue's Out-of-scope section literally. Open ONE
   > PR whose body begins `Closes #<n>`; do NOT merge it — a label-gated
   > automerge workflow judges it. Do not take or scan for any other work.

3. **Mark the claim** — add `claude-working` to the issue and comment:
   `Dispatched to <method 1|2> — <session link>`. A cloud session cannot
   release the label itself; `claude-done.yml` flips it when the PR opens,
   and the sweep's release-all heals any abandoned dispatch — a stale label
   here is self-healing, not an incident.
4. **Hand off** — open the target with the repo selected and submit the
   brief:
   - Method 1: claude.ai/code → the repo → new session → paste the brief.
   - Method 2: the Codex cloud surface → the repo → new task → paste.
   The HUMAN confirms the session started (it runs on their account and
   quota); record method + link in the issue comment (attribution). The
   skill's dispatch job ends there.
5. **On return** — the PR enters the standard pipeline unchanged: CI runs
   `./tool/verify.sh`, `claude-done.yml` relabels, automerge only on the
   opted-in label. Nothing about the origin changes the judging.

## "Check on my dispatch"

1. Find the PR by branch: `gh pr list --head claude/issue-<n>` (or search
   the session link's comment thread).
2. No PR and the session ended → the dispatch died: remove `claude-working`,
   report what the session log says, requeue or re-dispatch.
3. PR exists → report CI state (`analyze-and-test`) and remind the human of
   the label decision: review by default, `auto-merge` label to land it
   hands-off.

## Conformance (from the contract — do not drift)

- One dispatch = one issue = one PR; the brief is the ENTIRE instruction.
- The dispatched agent never verifies its own claims — the gate does.
- No path to merge from the cloud side; attribution recorded on the issue.
- Dispatches spend the human's cloud quota — say so before dispatching many.
