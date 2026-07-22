# Claude Code — SakalAutomation session 2: extract the garage, prove parity

Run in `/Users/admin/LIMSOCHEAT/Projects/SakalAutomation`. Send everything below the
line.

---

Session 1 built the skeleton and the contract; the repo is pushed as
`sakal-dev/automation`. This session makes the engine real: extract the hardened
automation from `sakal-dev/sakalpos-garage` into the five reusable workflows,
convert garage into **caller #1**, and prove parity. The measure of success is
boring: **garage behaves exactly as it does today**, with 90% less YAML in it.

## Read first

- `docs/task-contract.md` — the spec. Every extraction decision must conform;
  the conformance checklist at the end is your acceptance test.
- `CLAUDE.md`, `BRIEF.md`, `NOTES.md` — rules and vocabulary.
- Clone `sakal-dev/sakalpos-garage` into a sibling or temp directory (`gh repo
  clone`) as the **source of truth for behaviour**. Its workflows embody months of
  hardening — extract, don't reinvent. Where its logic and this brief differ in
  detail, its logic wins; tell me about the difference.

## STEP 1 — Implement the five reusable workflows (github mode)

Port garage's workflow logic into `.github/workflows/` here as real
`workflow_call` implementations:

- `sweep.yml` — the queue drain: cheap check-for-work gate, claim via
  `claude-working`, VERIFY-FIRST prompt, merge gate = `./tool/setup.sh` +
  `./tool/verify.sh` (replacing the inlined Flutter commands — this is the
  stack-blind change), self-redispatch with the progress condition, `always()`
  release, concurrency group.
- `on-demand.yml` — the `@claude` path with its in-run gate before any PR.
- `automerge.yml` — label-gated merge + explicit issue close; **docs-only fast
  path must exclude `CLAUDE.md`**.
- `claude-done.yml` — mechanical label transitions, PR-body `Closes #n` parsing.
- `verify.yml` — stays a stub (integrated mode, later session).

Inputs to expose (keep the list small; defaults = garage's current behaviour):
model string, max issues per sweep, extra denylist paths, runner label. Secrets
via `secrets: inherit`. Everything repo-specific that is *not* an input comes from
the repo's own `tool/setup.sh` / `tool/verify.sh` — the workflows must contain no
Flutter, no Laravel, no stack anything.

Implement `actions/setup-project` and `actions/claim-github` for real;
`claim-sakal` / `report-sakal` remain stubs.

**Stop for review**: show me the implemented `sweep.yml`, the garage caller you
intend to write, and garage's new `tool/verify.sh` side by side, before touching
the garage repo.

## STEP 2 — Convert garage to caller #1

On a **branch + PR** in sakalpos-garage (never direct to main; its autonomous-run
denylist does not bind this supervised session, but review discipline does):

1. Add `tool/verify.sh`: `dart run build_runner build` + committed-`*.g.dart`
   sync check + `flutter analyze` + `flutter test` — exactly what ci.yaml and the
   sweep gate verify today, in one place. `ci.yaml` and the sweep both call it.
2. Replace each extracted workflow with its ~10-line caller
   (`uses: sakal-dev/automation/.github/workflows/<name>.yml@v1`,
   `secrets: inherit`). Cron schedules stay in the callers.
3. Labels, issue template, `CLAUDE.md`, `docs/` stay as they are.

## STEP 3 — Owner setup (list precisely, then wait)

Tell me the exact clicks/commands for the steps only I can do, then pause:

- `sakal-dev/automation` → Settings → Actions → Access: allow repositories in the
  organization to use its workflows.
- Move `CLAUDE_CODE_OAUTH_TOKEN` to an **org-level secret** shared to garage (and
  future repos); remove the repo-level copy after parity passes.
- Tag `v1` on the automation repo (after parity, not before).

## STEP 4 — Parity test

With the garage PR merged and `@v1` tagged:

- File one real `claude-ready` issue; run the sweep via `workflow_dispatch`; it
  must claim, gate, open a PR — identically to before extraction.
- `@claude` on an issue → on-demand run works through the caller.
- The `auto-merge` label path merges on green CI; without it, the PR waits.
- The `always()` release still clears `claude-working` on a killed run.
- Confirm CI fires on the app-token PR exactly as before.

Any behavioural difference from pre-extraction is a bug in the extraction —
fix the engine, never patch the caller.

## Known gotchas (check, don't discover)

- Reusable workflows run in the **caller's** repo context — checkout, `gh`, and
  labels all act on garage. Good; that is the design.
- Composite actions are referenced cross-repo as
  `sakal-dev/automation/actions/<name>@v1` — same access setting governs them.
- A `workflow_call` cannot carry `schedule:` — crons live only in callers.
- Consume by tag; if you must iterate during testing, use a `v1-rc` tag and
  retag, never `@main`.

## Definition of done

- The five workflows (four real + one stub) implement the contract; conformance
  checklist answered in the PR description.
- Garage runs entirely on callers + two `tool/` scripts; parity demonstrated on a
  real issue end to end.
- `v1` tagged; org secret in place; repo-level secret removed.
- `docs/methods/03-claude-code-action.md` updated with the extraction verdict and
  first experiment-log entry; README's consumption section shows the real caller.

Start with STEP 1 and stop at its review gate.
