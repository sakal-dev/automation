# templates — what the install skill copies into a repo

**STATUS: stub — files land with the plugin build (migration step 3), the
per-stack scripts distilled from real repos (garage first).**

Planned contents:

| Template | Becomes | Notes |
|---|---|---|
| `setup-flutter.sh`, `setup-laravel.sh`, `setup-node.sh`, `setup-electron-pnpm.sh` | `tool/setup.sh` | prepare the environment; the ONLY home of stack knowledge |
| `verify-flutter.sh`, `verify-laravel.sh`, `verify-node.sh`, `verify-electron-pnpm.sh` | `tool/verify.sh` | the gate: analyze/lint + tests + build, exit non-zero on any failure |
| `caller-sweep.yml`, `caller-on-demand.yml`, `caller-automerge.yml`, `caller-claude-done.yml`, `caller-verify.yml` | `.github/workflows/*.yml` | ~10-line callers pinned `@v1`; sweep cron on an off-peak minute |
| `issue-templates/*.yml` (**built** — 10 typed forms + `config.yml`) | `.github/ISSUE_TEMPLATE/` | feature · bug · hotfix · chore · refactor · docs · spike · epic · question · security. Forms auto-apply `type:*` + queue labels; blank issues disabled. Best served org-wide from a `sakal-dev/.github` repo; copy per-repo only to customise (e.g. `area:*` dropdowns) |
| `labels.sh` (**built**) | run once per repo | idempotent `gh label create --force` for the full label set (queue, merge/model, `type:*`, `priority:urgent`); `area:*` added per repo |
| `ISSUE-SKELETONS.md` (**built**) | referenced, not copied | markdown twins of the 10 forms — the shape agents/CLI use with `gh issue create`; forms guard the web UI, skeletons guard everything else |
| `claude-md-issues-section.md` (**built**) | appended to repo `CLAUDE.md` | teaches any Claude in the repo the types, skeletons, labels, and process rules (urgent never auto-merges; spikes merge no code; epics/questions/security never auto-queued) |
| `claude-md-section.md` | appended to repo `CLAUDE.md` | denylist, gate rules, how to summon @claude |
| `denylist-extras.md` | merged into workflow prompts | per-stack additions to the hard denylist (e.g. gradle/keystores for Flutter/Android) |

Rules for every template: no secrets, no `@main` references, nothing that
weakens a contract invariant (`docs/task-contract.md`).
