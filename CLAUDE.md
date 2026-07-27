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
`review-loop`, `verify`) all belong to **method 3 only**. Do not conflate the
lists; do not call a workflow a "method".

Review vocabulary (contract step 4b): **coder** = the agent that authored the
PR, **reviewer** = an independent identity, **judge** = CI, **merger** =
automerge, **operator** = the human, and final. A *rework round* is one
`changes_requested` answered; a red CI check is not one.

## Do-not-regress rules (from the garage hardening)

- Auto-merge is **opt-in per task**; review is the default. Since v2.5.0 the
  full precondition set applies (contract step 4b + invariant 10) — CI green,
  one *current* approval, zero open change-requests, zero unresolved threads,
  not draft, no hard-stop label. **Where the engine cannot see the truth it
  holds**: an unreadable PR or a file list past GraphQL's 100-item page cap
  fails CLOSED, because an empty file list makes the guardrail check pass
  vacuously.
- **A reviewed branch is append-only** and the **reviewer is never the author**
  (contract invariants 11 and 13). Both are enforced in code, not asked for in
  a prompt — GitHub returns 422 on self-review, which is a silence, not an
  error anyone would notice.
- **Two rework rounds per PR**, counted from review history AND a PR-body
  marker, whichever is higher. The engine may never gain a path that keeps a
  coder/reviewer pair talking past the cap.
- Review-loop state lives in the `review:*` namespace plus
  `needs-human-merge`. `claude-ready` / `claude-blocked` stay human-steered
  (v2.4.0) — nothing in the review loop touches them.
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
- Engine consumed by tag, never `@main`. `v1` is a floating major tag (moved
  to each compatible release); immutable `v1.x.y` tags mark the releases
  (first: `v1.0.0` at garage parity). The engine's internal action refs
  (`sakal-dev/automation/actions/*@v1`) ride the same floating tag — moving
  `v1` moves workflows and actions together.

## Session rules

- **No secrets or tokens in this repo, ever** — not in stubs, templates,
  examples, or tests.
- **Need a credential? Consult `docs/CREDENTIALS_REQUIRED_CHECKLIST.md` first.**
  Before asking the user for ANY password/token/key, run its three zero-config
  tests; only ask for genuinely irreducible ones, and hand the user the exact
  "how to create" steps from that file — never improvise a per-repo secret setup,
  never conflate the GitHub App (read) with a worker `GH_TOKEN` (write) with the
  SakalMaster `SAKAL_TOKEN` (Supabase agent account). If a needed credential is
  missing from the checklist, stop and have the user add it there first.
- Stub workflows stay **inert**: `workflow_call` only; a trigger that could
  fire (`push`, `schedule`) must not exist until the implementation session
  that owns it.
- Garage implementation is **extracted deliberately with parity testing**
  (same issues drain identically) — never copied casually.
- License is undecided (`LICENSE.todo`) — do not add one.
