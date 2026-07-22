---
name: automation-install
description: Onboard a repo to sakal agent automation end to end — stack detection, tool/ gate scripts, caller workflows, labels, typed issues, CLAUDE.md context system — in under 30 minutes with no hand-written YAML. Use when the user says "set up agent automation here", "install sakal automation", "onboard this repo", or "add the agent workflows to this project".
---

# automation-install

Turns the current repo into a caller of `sakal-dev/automation`. Knowledge
lives in this skill; **enforcement lives in the engine** — nothing installed
here may weaken a workflow guardrail, and this skill never handles secret
values. Everything installed obeys `docs/task-contract.md` (in the automation
repo). Manuals this skill implements — where they disagree with this skill,
they win and this skill must be fixed: `docs/issues.md`, `docs/context.md`.

Templates: `plugins/sakal-automation/templates/` in `sakal-dev/automation`.
Clone/locate it first; call its path `$AUTO` below. Engine tag: `@v1`
(floating major; use `v1.0.0` in messages once it exists).

## Phase 0 — Preflight (refuse early)

1. **Dirty tree → refuse.** `git status --porcelain` must be empty. Do not
   stash, do not proceed; tell the user to commit or stash first.
2. **Identity**: `owner/name` from `git remote get-url origin`; verify access
   with `gh repo view <owner/name>`. Not a sakal-dev repo → confirm with the
   user before continuing.
3. **Detect the stack** (exactly one must match; two or none → ask, then stop
   guessing):
   - `pubspec.yaml` → **flutter** (read `.metadata` `revision:` → `FLUTTER_REV`)
   - `composer.json` → **laravel**
   - `package.json` + electron dep (any of: `electron` in deps/devDeps) → **electron-pnpm**
   - `package.json` otherwise → **node**
4. **Detect prior onboarding** — build a present/absent table for: `tool/setup.sh`,
   `tool/verify.sh`, each of the 5 callers (by filename), the label set
   (`gh label list` → is `claude-ready` there?), `.github/ISSUE_TEMPLATE/`
   (repo-own vs org default — check `gh api repos/sakal-dev/.github` exists),
   `CLAUDE.md`, `docs/RULES.md`, `docs/CHANGELOG-RECENT.md`. **Only absent
   items get installed** — a second run must be a no-op that prints "nothing
   to do". Never overwrite an existing file the repo owns; if one exists but
   diverges badly from the template, report it, don't replace it.

## Phase 1 — The two questions (everything else is derived)

- **Q1 — mode**: standalone (GitHub is the queue) or integrated (SakalMaster)?
  Integrated: also ask project + app slugs, record them in the CLAUDE.md
  section as `<!-- sakal: project=X app=Y -->`, and say honestly that
  integrated claiming lands with the sakal-source session — today's install
  runs standalone either way.
- **Q2 — modules**: list this repo's real modules/areas (e.g. `reports, sync,
  auth`) → the `area:*` label set, and the story-id prefix (suggest from the
  repo name: sakalpos-owner → `OWN`; let the user override).

Derived, not asked: cron minute `M = 17 + (sum of repo-name bytes % 40)`,
skipping 30 (off-peak, stable per repo, never :00/:30); CI workflow name
(`CI`); check name (`analyze-and-test`); everything in the templates.

## Phase 2 — Install (on a branch)

Branch: `automation/onboard`. Order matters only for the approval pause.

1. **Gate scripts (approval pause).** Copy `$AUTO/setup-<stack>.sh` →
   `tool/setup.sh`, `$AUTO/verify-<stack>.sh` → `tool/verify.sh`; `chmod +x`;
   flutter: substitute `<FLUTTER_REV>`. **Show both files to the user and get
   an explicit OK before writing** — they are the repo's own gate, the one
   thing the human must own. Then RUN `./tool/setup.sh && ./tool/verify.sh`
   locally; if verify fails on a clean tree, STOP — the repo has pre-existing
   failures the human must see before any agent does.
2. **Callers.** Copy the five `caller-*.yml` → `.github/workflows/` with their
   proper names (`claude-daily-sweep.yml`, `claude.yml`, `automerge.yml`,
   `claude-done.yml`, `ci.yaml` — skip `ci.yaml` if the repo already has a CI
   workflow; instead tell the user to make its gate job run `./tool/verify.sh`
   and note the check-name input). Substitute `<M>`; `<CI_WORKFLOW_NAME>` =
   the CI workflow's `name:`; drop the sweep's `with:` block unless the repo
   has a status ledger to point at (`<EXTRA_INSTRUCTIONS>`).
3. **Labels** (idempotent): `bash $AUTO/labels.sh <owner/name>`, then
   `gh label create "area:<m>" -R <owner/name> --force --color C5DEF5` per Q2
   module.
4. **Issue forms**: org defaults exist (`sakal-dev/.github`) → install nothing
   per-repo (path A) unless the user asks for a customised `area:` dropdown —
   then copy the WHOLE `issue-templates/` folder (path B is all-or-nothing).
   No org defaults → offer to create them (once, org-wide) before falling
   back to a per-repo copy.
5. **Context system** (`docs/context.md`'s five layers):
   - `CLAUDE.md`: absent → from `$AUTO/claude-md-section.md`, placeholders
     filled (repo name, one-paragraph description — ask the user if you
     cannot write it honestly from the README, commands, truth pointers).
     Present → append ONLY missing sections (@imports, Issues, commands).
   - `docs/RULES.md` ← `rules-template.md` (as-is).
   - `docs/CHANGELOG-RECENT.md` ← `changelog-recent-template.md` (fill date);
     `docs/changelog/ARCHIVE.md` ← `changelog-archive-template.md`.
   - Issues section ← `claude-md-issues-section.md` into CLAUDE.md.
6. **Secrets — checklist only, never values.** Check presence:
   `gh secret list -R <owner/name>` for `CLAUDE_CODE_OAUTH_TOKEN`; the Claude
   GitHub App installed (`gh api repos/<owner/name>/installation` via app, or
   just ask). Missing → print the exact fix (run `/install-github-app` from
   Claude Code in this repo, or the README's Secrets section) and continue —
   the PR can merge before secrets exist; the queue just won't drain until
   they do.
7. **Commit + PR.** Conventional small commits (tool/, workflows, labels
   note, context). PR body: what was installed, the present/absent table from
   Phase 0, the secrets checklist result, and "merge = automation goes live
   on next event". **Never push to the default branch directly.**

## Phase 3 — Verify (after the human merges the PR)

Workflows only exist on the default branch — verification is post-merge.

1. File one smoke issue with the **feature skeleton**
   (`$AUTO/ISSUE-SKELETONS.md`), title `<PREFIX>-000: onboarding smoke test`,
   body ACs: "the sweep claims this issue; `./tool/verify.sh` runs; a PR or a
   reasoned block comment appears". Label `claude-ready` only (never
   `auto-merge` on a smoke test).
2. `gh workflow run claude-daily-sweep.yml -R <owner/name>` → watch:
   claim (`claude-working` appears) → gate → PR opened (CI fires on it) or a
   reasoned block. Any deviation = engine bug or install bug; fix at the
   source, never by patching the repo by hand.
3. **Clean up**: close the smoke issue and its PR (if any) with a comment
   `onboarding smoke test — discarding`, delete the branch, remove
   `claude-working` if stuck.

## Phase 4 — End report (always print)

- What was installed vs already present (the table).
- What the human still owes: secrets (if missing) · review the `area:*` set ·
  `sakal-dev/.github` creation if it was declined · the reminder that
  `auto-merge` is per-issue opt-in and `priority:urgent` never auto-merges.
- Timing: state minutes from Phase 0 start to Phase 3 done (the 30-minute
  budget is part of the product).

## Hard rules

- Dirty tree → refuse. Two stacks → ask. Existing file → never overwrite.
- Secrets: presence checks only; a secret VALUE must never pass through this
  skill, its output, or a commit.
- Everything lands via branch + PR; this skill writes `.github/**` precisely
  because it is human-supervised — autonomous agents still may not.
- If a template needs changing to make install work, change the template in
  `sakal-dev/automation` (and its skeleton twin in the same commit) — never
  keep a private patched copy in the target repo.
