# SakalAutomation — orientation for sessions in this repo

Agent automation for all sakal-dev / Thalias projects: reusable workflows +
composite actions + VPS workers + a Claude Code plugin, all implementing one
contract. Currently a **documented skeleton** — stubs describe intent;
implementation lands session by session (garage extraction next).

## Where truth lives

- **`BRIEF.md` + `NOTES.md` are design truth.** Prompts and sessions may not
  contradict them; where they are silent, **ask rather than invent**.
- **`docs/task-contract.md` is the spec.** Approved. Every workflow, action,
  worker, and skill implements it; a change that can't satisfy its
  conformance checklist is wrong by definition.
- `docs/github-constraints.md` holds the platform facts — check it before
  "fixing" timing, tokens, labels, or comment-trigger behaviour.
- `docs/methods/01…07.md` is the lab notebook — record setup, cost, verdict
  for every experiment.

## Vocabulary guard

The **seven methods are execution runtimes** (Claude Code web, Codex cloud,
claude-code-action, headless loop, SDK worker, OpenClaw, orchestrators). The
**workflow files** (`sweep`, `on-demand`, `automerge`, `claude-done`,
`verify`) all belong to **method 3 only**. Do not conflate the lists; do not
call a workflow a "method".

## Do-not-regress rules (from the garage hardening)

- Auto-merge is **opt-in per task**; review is the default.
- The gate is the repo's own `./tool/verify.sh`; the engine stays
  **stack-blind** (and **mode-blind**: EXECUTE never branches on `source`).
- Hard path denylist in workflow prompts: `.github/**`, `tool/**`,
  gradle/keystores, `.env*`; `CLAUDE.md` excluded from any docs-only fast
  path.
- Mechanical label release (`always()`), concurrency groups, app-token PRs
  (built-in `GITHUB_TOKEN` PRs are inert).
- **Agents never verify their own claims** — CI judges standalone; CI + the
  SakalMaster verifier judge integrated.
- Integrated claims are **filtered by app**: `claim_next_task(project, app)`.
  If SakalMaster lacks something, request it there — never work around it here.
- Engine consumed by tag (`@v1`), never `@main`.

## Session rules

- **No secrets or tokens in this repo, ever** — not in stubs, templates,
  examples, or tests.
- Stub workflows stay **inert**: `workflow_call` only; a trigger that could
  fire (`push`, `schedule`) must not exist until the implementation session
  that owns it.
- Garage implementation is **extracted deliberately with parity testing**
  (same issues drain identically) — never copied casually.
- License is undecided (`LICENSE.todo`) — do not add one.
