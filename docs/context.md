# Context — how a fresh session knows enough

Every agent session starts empty. Context is not one file; it is **five layers
with different loading rules**. Confusing the layers produces either amnesiac
agents (too little always-loaded) or bloated, expensive, drifting sessions (too
much). The template implementing this is
`plugins/sakal-automation/templates/claude-md-section.md`.

## The five layers

| Layer | Lives in | Loaded | Rule |
|---|---|---|---|
| 1 Orientation | `CLAUDE.md` | always, automatically | a MAP, not an encyclopedia — target < 100 lines |
| 2 Binding rules | `docs/RULES.md` via `@import` in CLAUDE.md | always | safeguards only — things that must bind even when irrelevant to the task |
| 3 Reference truth | `docs/*` (spec, decisions, schema), pointed to from CLAUDE.md with one-line descriptions | on demand, when the task needs it | progressive disclosure — the pointer costs 1 line; the doc costs nothing until read |
| 4 Task context | the issue (standalone) / the brief (integrated) | per task | the ONLY place task-specific context lives |
| 5 Continuity | rotating changelog + git history | recent always, rest on demand | see protocol below |

The discipline that keeps this healthy: **before adding a line to CLAUDE.md, ask
"must every session know this, even sessions it's irrelevant to?"** If no, it's
layer 3 — add a pointer, not the content. `@import` is reserved for layer 2:
safeguards ride along always precisely because an agent doesn't get to decide
whether safety is relevant.

## Continuity — the rotating changelog protocol

A single ever-growing `changelogs.md` loaded every session works at first and
then quietly fails twice: the context tax grows without bound, and 95% of old
entries are irrelevant to today's task. The fix keeps the benefit and caps the
cost:

- `docs/CHANGELOG-RECENT.md` — **last 10 entries only**, imported via CLAUDE.md.
  Fixed entry format: `date · what changed · why · follow-ups` (3–6 lines).
- `docs/changelog/ARCHIVE.md` — everything older; read on demand only.
- **End-of-session duty** (in RULES.md): the session appends its entry and
  rotates the oldest out. Writing the log is part of done.
- Everything finer-grained already exists for free: `git log`, PR descriptions,
  issue threads. Teach sessions to *query* history (`git log --oneline -30`)
  rather than loading it.

Why 10: recent entries answer "what was just happening" (the continuity that
matters); anything older is research, and research should be pulled, not pushed.

## What each consumer sees

- **Claude Code (local)** — loads CLAUDE.md + its @imports automatically.
- **Cowork** — same, when the folder is connected.
- **@claude / sweep runs** — same via checkout; plus the issue as layer 4; plus
  `extra_instructions` from the caller for repo-specific prompt additions.
- **Codex / other agents** — read AGENTS.md; keep it a 3-line pointer to
  CLAUDE.md rather than a second copy (one source, two doors).

## The endgame (so we don't over-build the interim)

SakalMaster already generates per-repo context (`.sakal/context.md` — stories,
ACs, citations for the linked app) and records every run (`agent_runs`,
History). When a repo flips to integrated mode, layer 4 becomes `sakal_get_brief`
and layer 5's queryable history becomes SakalMaster itself — the hand-maintained
changelog shrinks to a courtesy. So: keep the changelog protocol cheap and
disposable; do not invest in tooling around it.

## Useful skills/plugins for maintaining context (Cowork side)

- **productivity : memory-management** — implements exactly this two-tier idea
  for Socheat's own Cowork memory (CLAUDE.md as working memory + `memory/` as
  knowledge base). Use it for personal/PM context; repos use this doc's pattern.
- **skill-creator** — when a repeated context ritual emerges (e.g. "summarise
  session and rotate the changelog"), package it as a skill instead of
  re-explaining it.
- The `sakal-automation` plugin's own skills (install/operate) install and
  maintain the repo-side pattern; `thalias-git-issue` (personal skill) should
  point at ISSUE-SKELETONS.md so filed issues match the forms.
