---
name: automation-operate
description: Operate a repo's sakal agent automation day to day. Use when the user says "why didn't the sweep run", "the agent is stuck", "unblock the queue", "diagnose automation", "upgrade the automation version", "queue this issue for the agent", or anything about automation behaving oddly.
---

# automation-operate

**STATUS: DRAFT STUB — outline only. Written for real after the garage
extraction.**

The operations manual as a skill. Carries the GitHub-constraints knowledge
(`docs/github-constraints.md`) so diagnosis starts from the known sharp edges
instead of rediscovering them.

## Body outline

1. **Queue** — make an issue eligible (labels, AC shape), check what's queued,
   in flight, blocked; integrated mode: read the queue via the sakalmaster MCP.
2. **Diagnose** — the checklist, mapped to the constraints doc:
   - sweep didn't run → cron is UTC + best-effort; new cron only exists on the
     default branch; check off-peak minute.
   - PR has no CI → opened with the built-in `GITHUB_TOKEN` instead of the
     app token (inert PR).
   - issue didn't close → `Closes #n` parsed from the PR body, check format.
   - task stuck claimed → the always() release failed or (integrated) the
     lease hasn't expired yet.
   - @claude ignored a comment → the ~1s guard path; check the trigger guard.
3. **Unblock** — answer a blocked run's question (integrated: Needs-me;
   standalone: the labelled issue comment), then requeue.
4. **Upgrade** — move callers to a new engine tag (`@v1` → `@v2`); never point
   at `@main`; what to re-check after (denylist, labels, secrets).
5. **Invariant guard** — anything the user asks for that would regress a
   contract invariant (auto-merge default-on, denylist holes, CLAUDE.md in
   docs-only) gets flagged, not silently done.
