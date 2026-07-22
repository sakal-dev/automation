# SakalAutomation — background notes

Everything discussed and decided before this repo existed, so any session (or
Socheat in three months) can reconstruct the reasoning. `BRIEF.md` is what to build;
this file is why.

## 1. Vocabulary — these are layers, not competing options

| Word | What it actually is | Here |
|---|---|---|
| Repo | a box that holds things | `sakal-dev/automation` |
| Reusable workflow | a GitHub Actions *engine* other repos call with a ~10-line "caller" (`uses: sakal-dev/automation/.github/workflows/sweep.yml@v1`) | sweep, on-demand, automerge, claude-done, verify |
| Composite action | a reusable *step block* used inside workflows | claim, report, setup |
| Worker | a program running on a VPS | headless-loop, sdk-worker |
| Skill | *knowledge* Claude loads when relevant — procedures, not running code | install / operate / dispatch |
| Plugin | the installable package that delivers skills (+ optional MCP config) to Claude Code / Cowork | `sakal-automation` |
| MCP server | the API door agents call | SakalMaster's (built, 82+ tools) |
| Template | a file a skill copies into a repo | tool/setup.sh, callers, issue template |

Key rule of thumb: **knowledge in skills, enforcement in workflows, truth in
SakalMaster.** A skill can be ignored by a confused agent; a workflow gate cannot.

## 2. The four-step contract

Every automation, whatever runs it, is: **SOURCE → BRIEF → EXECUTE → GATE**.

- SOURCE: `github` (issues + labels — standalone) or `sakalmaster`
  (`claim_next_task` — integrated). One switch, everywhere.
- BRIEF: issue body + ACs, or `sakal_get_brief` (story, ACs with derived status,
  citations, decisions with rationale, blockers).
- EXECUTE: any of the seven methods below.
- GATE: `./tool/verify.sh` must pass before a PR; merge is opt-in (`auto-merge`
  label / flag); in integrated mode the SakalMaster verifier additionally judges
  what the merged code *proved* (citations → AC status). Agents never verify their
  own claims.

## 3. The seven execution METHODS (runtimes) — not workflow names

The workflows in this repo (`sweep.yml`, `on-demand.yml`, `automerge.yml`,
`claude-done.yml`, `verify.yml`) are **files implementing method 3 only**. The seven
methods are *where/how the agent runs*:

| # | Method | What it is | What trying it looks like | Status |
|---|---|---|---|---|
| 1 | Claude Code on the web | Anthropic-hosted VM per task; push a task, it works, PR comes back | use `automation-dispatch` to hand it a brief; judge the PR with the same gate | dispatch skill ready; experiment pending human |
| 2 | Codex cloud | Same shape, OpenAI side, via ChatGPT | same dispatch skill, Codex flavour | procedure written; blocked: no account |
| 3 | claude-code-action | Claude inside GitHub Actions: `@claude` on-demand + scheduled sweep | **the current experiment on sakalpos-garage** — the hardened system | live as engine @v1 (garage + owner callers) |
| 4 | Headless loop | `claude -p` in a loop on a VPS (cron/systemd), polling a queue | deploy `workers/headless-loop` in the Docker sandbox against one repo | built + kill-tested; drain pending worker token |
| 5 | Agent SDK worker | Same engine as a library; job queue + MCP; the long-term worker | deploy `workers/sdk-worker` with the sakalmaster MCP | built (hook denylist); drain pending worker token |
| 6 | OpenClaw | Self-hosted chat gateway (Telegram → agent); an *interface*, not an executor | recipe only: point its agent at the dispatch skill + MCP | recipe written; not run |
| 7 | Orchestrators | Run N workers in parallel (amux, tmux-orchestrator, agent teams) | N copies of method 4/5; the atomic claim lease makes N safe | compose + mock experiment run (see methods/07) |

Methods 1–2 are push-only (they cannot poll a queue); the dispatch skill bridges
them. Methods 4–5 are pull (they poll). Method 3 is both (`@claude` push, sweep
pull). `docs/methods/01…07.md` is the lab notebook: record setup, cost, and verdict
per experiment so the learning accumulates.

## 4. Decisions already made (with reasons)

- **One repo, not many.** The contract is the shared asset; splitting fragments it.
  One repo can simultaneously be a reusable-workflow source, a plugin marketplace,
  and a worker home — these are just files.
- **Two scripts own the stack.** `tool/setup.sh` + `tool/verify.sh` live in each
  project repo; the engine is stack-blind. This is the whole Flutter/Laravel/React/
  Electron answer.
- **Auto-merge is opt-in; review is default.** Flipped during garage hardening; keep.
- **Hard path denylist is structural**, in workflow prompts: `.github/**`,
  `tool/**`, gradle/keystores, `.env*`; `CLAUDE.md` excluded from docs-only merges
  (an agent must never be able to weaken its own guardrails via an auto-merged
  "docs" PR).
- **Granularity:** install per REPO; repo = one SakalMaster APP; queue per PROJECT;
  claims filtered by app (`claim_next_task(project, app)` — requires a small
  SakalMaster addition; requested, not worked around). The atomic lease means a CI
  sweep and a VPS worker can serve the same app concurrently without double work.
- **CI talks to SakalMaster via REST** (token-exchange → PostgREST), not a published
  npm package; interactive agents use MCP. Documented in SakalMaster's
  `docs/ci/agent-runs.md`.
- **Org-level secrets** (`CLAUDE_CODE_OAUTH_TOKEN`, `SAKAL_TOKEN`) — one rotation
  point.
- Version the engine with tags (`@v1`), never `@main`.

## 5. FAQ from the design discussion

**How do I set up a new repo?** Best: install the plugin, say "set up agent
automation here" — the install skill does stack detection, scripts, callers,
labels, template, CLAUDE.md section, secrets checklist (<30 min target). Fallbacks:
copy templates manually; org workflow-templates UI; template repository for
brand-new projects.

**How does sakalpos-garage convert?** It already contains everything inline —
conversion is subtraction: extract its workflows into this repo as `workflow_call`
versions, replace garage's copies with ten-line callers, move the gate into
`tool/verify.sh`, org secrets, then prove parity with one labelled issue.

**Scheduled sweeps and timing:** GitHub cron is UTC and best-effort — minutes late
normally, up to ~an hour under load, occasionally skipped. Use off-peak minutes
(not :00/:30), buy frequency instead of punctuality (the check-for-work gate makes
idle runs ~free), and remember a new cron only exists once it's on the default
branch.

**GitHub constraints that shaped everything** (port to `docs/github-constraints.md`):
PRs opened by the built-in `GITHUB_TOKEN` are inert (no CI fires) — use the app
token; `Closes #n` API field lags — parse the PR body; label reads can hit rate
limits — make label swaps unconditional/idempotent; comment triggers fire on every
comment — guard cheaply and skip in ~1s.

## 6. Comparable open-source work (to study, not adopt wholesale)

- **OpenHands** + its **resolver** (GitHub-Actions issue-fixer) — closest full loop:
  github.com/All-Hands-AI/OpenHands
- **SWE-agent / mini-swe-agent** (Princeton) — the research lineage; mini scores
  >74% SWE-bench in ~100 lines: github.com/swe-agent/swe-agent
- **claude-code-action** (Anthropic, official) — what method 3 is built on:
  github.com/anthropics/claude-code-action
- **awesome-claude-code-toolkit** — community index incl. autonomous queue loops
  (claude-loop, ralph-claude-code): github.com/rohitg00/awesome-claude-code-toolkit
- **amux** — dashboard/scheduler over parallel Claude/Codex sessions (method 7):
  github.com/mixpeek/amux
- **tmux-orchestrator variants** (method 7): github.com/primeline-ai/claude-tmux-orchestration
- **Claude Code Routines** — Anthropic-hosted scheduled runs; effectively a managed
  method 3; worth an experiment as "method 8".

None of these has SakalMaster's verification layer (derived status from citations);
they all trust agent PR + CI. That layer is the differentiator, not a gap.

## 7. Relationship to SakalMaster

SakalMaster (repo: `SakalMaster`, staging: `master-staging.sakal.dev`) provides in
integrated mode: the task queue (`claim_next_task`, leased, atomic), the brief
(`sakal_get_brief`), run reporting (`agent_runs`: heartbeat, outcome, block→question
in Needs-me), the Team · Agents dashboard (derived at read time), the citation
verifier (`sakal-verify` in CI), and identity/attribution (PATs, `sakal_pat_…`,
every write attributed). Standalone mode needs none of it. The long-term direction:
standalone is the on-ramp; integrated is the destination; this plugin is,
eventually, how SakalMaster customers onboard their repos.
