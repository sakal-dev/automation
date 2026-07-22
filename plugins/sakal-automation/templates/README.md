# templates — what the install skill copies into a repo

**STATUS: stub — files land with the plugin build (migration step 3), the
per-stack scripts distilled from real repos (garage first).**

Planned contents:

| Template | Becomes | Notes |
|---|---|---|
| `setup-flutter.sh`, `setup-laravel.sh`, `setup-node.sh`, `setup-electron-pnpm.sh` | `tool/setup.sh` | prepare the environment; the ONLY home of stack knowledge |
| `verify-flutter.sh`, `verify-laravel.sh`, `verify-node.sh`, `verify-electron-pnpm.sh` | `tool/verify.sh` | the gate: analyze/lint + tests + build, exit non-zero on any failure |
| `caller-sweep.yml`, `caller-on-demand.yml`, `caller-automerge.yml`, `caller-claude-done.yml`, `caller-verify.yml` | `.github/workflows/*.yml` | ~10-line callers pinned `@v1`; sweep cron on an off-peak minute |
| `issue-template.md` | `.github/ISSUE_TEMPLATE/` | the standalone brief's stable shape: goal + acceptance criteria |
| `claude-md-section.md` | appended to repo `CLAUDE.md` | denylist, gate rules, how to summon @claude |
| `denylist-extras.md` | merged into workflow prompts | per-stack additions to the hard denylist (e.g. gradle/keystores for Flutter/Android) |

Rules for every template: no secrets, no `@main` references, nothing that
weakens a contract invariant (`docs/task-contract.md`).
