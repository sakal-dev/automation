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
