# templates — what the install skill copies into a repo

> **Manual: [`docs/issues.md`](../../../docs/issues.md)** — the ten issue types,
> the three distribution paths (incl. the org-wide `sakal-dev/.github` defaults
> trick), the per-repo label step, and how agents learn the format. Read it
> before onboarding a repo.

**STATUS: built** (session 3) — the per-stack scripts distilled from real
repos (garage's proven `tool/` pair for Flutter), the callers from garage's
parity-tested caller #1. `automation-install` copies them; each copy becomes
the target repo's own property.

Contents:

| Template | Becomes | Notes |
|---|---|---|
| `setup-flutter.sh`, `setup-laravel.sh`, `setup-node.sh`, `setup-electron-pnpm.sh` (**built**) | `tool/setup.sh` | prepare the environment; the ONLY home of stack knowledge. Flutter pin `<FLUTTER_REV>` filled from `.metadata` |
| `verify-flutter.sh`, `verify-laravel.sh`, `verify-node.sh`, `verify-electron-pnpm.sh` (**built**) | `tool/verify.sh` | the gate: presence-conditional checks, but at least one real check MUST exist — exit non-zero on any failure |
| `caller-sweep.yml`, `caller-on-demand.yml`, `caller-automerge.yml`, `caller-claude-done.yml`, `caller-ci.yml` (**built**) | `.github/workflows/*.yml` | callers pinned `@v1` with full `permissions:` blocks; sweep cron on a derived off-peak minute; `caller-verify.yml` arrives with integrated mode (session 4) |
| `caller-review-loop.yml` (**built**, v2.5.0) | `.github/workflows/review-loop.yml` | the PR review loop: rework rounds, the cap, append-only enforcement, the one-nudge policy. **Needs a reviewer identity distinct from the coder** — see `docs/branch-protection.md` and the contract's step 4b |
| `rules-template.md` (**built**) | `docs/RULES.md` | binding safeguards (@imported via CLAUDE.md): verify-first, escalation, the verify.sh gate, denylist, issue process rules, **the rework loop (append-only, reply-don't-resolve, the cap)**, changelog duty |
| `changelog-recent-template.md`, `changelog-archive-template.md` (**built**) | `docs/CHANGELOG-RECENT.md`, `docs/changelog/ARCHIVE.md` | the rotating session log (context layer 5) |
| `issue-templates/*.yml` (**built** — 10 typed forms + `config.yml`) | `.github/ISSUE_TEMPLATE/` | feature · bug · hotfix · chore · refactor · docs · spike · epic · question · security. Forms auto-apply `type:*` + queue labels; blank issues disabled. Best served org-wide from a `sakal-dev/.github` repo; copy per-repo only to customise (e.g. `area:*` dropdowns) |
| `labels.sh` (**built**) | run once per repo | idempotent `gh label create --force` for the full label set (queue, merge/model, `type:*`, `priority:urgent`); `area:*` added per repo |
| `ISSUE-SKELETONS.md` (**built**) | referenced, not copied | markdown twins of the 10 forms — the shape agents/CLI use with `gh issue create`; forms guard the web UI, skeletons guard everything else |
| `claude-md-issues-section.md` (**built**) | appended to repo `CLAUDE.md` | teaches any Claude in the repo the types, skeletons, labels, and process rules (urgent never auto-merges; spikes merge no code; epics/questions/security never auto-queued) |
| `claude-md-section.md` (**built**) | the repo's `CLAUDE.md` | the five-layer context map (see `docs/context.md`): @imports for RULES + recent changelog, on-demand truth pointers, commands, issues section |
| ~~`denylist-extras.md`~~ | — | superseded: per-repo denylist additions are DATA — the sweep caller's `extra_denylist_paths` input — not a file (gradle/keystores are already in the base denylist) |

Rules for every template: no secrets, no `@main` references, nothing that
weakens a contract invariant (`docs/task-contract.md`).
