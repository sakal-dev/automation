---
name: automation-dispatch
description: Hand a task to a push-only cloud executor — Claude Code on the web (method 1) or Codex cloud (method 2). Use when the user says "dispatch this issue to Claude Code on the web", "send this task to a cloud session", "push this brief to Codex", or wants to run a queued task on a hosted VM instead of CI.
---

# automation-dispatch

**STATUS: DRAFT STUB — outline only.**

Methods 1–2 cannot poll a queue, so this skill performs the SOURCE and BRIEF
steps on their behalf (`docs/task-contract.md`, "push-only executors") and
hands over a complete brief. The result comes back as a PR into the exact
same gate as every other method — dispatch adds no second judgement path.

## Body outline

1. **Claim first, under the normal rules** — standalone: label swap on the
   issue; integrated: `claim_next_task(project, app)` via the sakalmaster
   MCP. Never hand out work that isn't claimed.
2. **Assemble the brief** — from the issue (standalone) or `sakal_get_brief`
   (integrated: story, ACs with derived status, citations, decisions,
   blockers) — plus the standing constraints: path denylist, repo CLAUDE.md,
   "verify locally but the gate judges".
3. **Hand off** — method 1: Claude Code on the web session; method 2: Codex
   cloud. Flavour differences live here and nowhere else.
4. **Track** — the run must end as PR / blocked / failed; report accordingly
   (integrated: agent_runs outcome or block) and release the claim if no PR
   materialises. A dispatched task may not simply evaporate.
5. **Judge nothing** — the PR enters the standard gate (verify in CI, opt-in
   merge, verifier in integrated mode). This skill never merges.
