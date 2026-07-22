# SakalAutomation — build brief for `sakal-dev/automation`

For the Claude Code session that creates this repo. It consolidates the
`sakalpos-garage` automation, makes it reusable across every sakal-dev / Thalias
project, supports **all seven execution methods**, and works in two modes:
**standalone** (GitHub is the queue — no SakalMaster needed) and **integrated**
(SakalMaster is the queue via `claim_next_task` / `report_run` REST).

Project name: **SakalAutomation**. GitHub repo: **`sakal-dev/automation`**.

## The one abstraction everything shares

Every method, standalone or integrated, decomposes into the same four steps:

```
1 SOURCE   where the task comes from      github issues | sakalmaster queue
2 BRIEF    what the agent is told         issue body+ACs | sakal_get_brief
3 EXECUTE  who does the work              methods 1–7 (see NOTES.md)
4 GATE     how it is judged + reported    ./tool/verify.sh + PR → labels | agent_runs
```

Write this contract down first, in `docs/task-contract.md`. Everything else
implements it. `source: github | sakalmaster` is an input/env everywhere; the
executor never cares which.

**Vocabulary guard:** the *seven methods* are execution runtimes (Claude Code on the
web, Codex cloud, claude-code-action, headless loop, Agent SDK worker, OpenClaw,
orchestrators). The *workflow files* below all belong to method 3 only — the other
methods are served by `workers/`, the dispatch skill, or plain recipes. Do not
conflate the two lists.

## Repo layout

```
sakal-dev/automation
├── .github/workflows/            REUSABLE WORKFLOWS (on: workflow_call) — method 3
│   ├── sweep.yml                 queue drain — dual-source
│   ├── on-demand.yml             @claude path, in-run gate before PR
│   ├── automerge.yml             label-gated merge; CLAUDE.md excluded from docs-only
│   ├── claude-done.yml           mechanical label transitions
│   └── verify.yml                sakal-verify in CI (integrated mode)
├── actions/                      COMPOSITE ACTIONS (shared steps)
│   ├── setup-project/            runs ./tool/setup.sh
│   ├── claim-github/             label claim + always() release
│   ├── claim-sakal/              claim_next_task via token-exchange + PostgREST
│   └── report-sakal/             heartbeat / outcome / block
├── workers/                      VPS EXECUTORS — methods 4 & 5
│   ├── headless-loop/            method 4: claude -p loop, systemd unit, dual-source
│   ├── sdk-worker/               method 5: Agent SDK + sakalmaster MCP (or gh CLI)
│   └── docker/                   sandbox image, non-root, egress firewall
├── .claude-plugin/marketplace.json     THIS REPO IS ALSO A PLUGIN MARKETPLACE
├── plugins/sakal-automation/
│   ├── skills/automation-install/  onboard any repo: detect stack → write
│   │                             tool/setup.sh + tool/verify.sh from templates →
│   │                             caller workflows → labels + issue template →
│   │                             CLAUDE.md section → secrets checklist. Asks
│   │                             standalone or integrated.
│   ├── skills/automation-operate/  queue / unblock / upgrade / diagnose. Carries the
│   │                             GitHub-constraints knowledge (cron=UTC+best-effort,
│   │                             token-opened PRs are inert, label-read rate limits…)
│   ├── skills/automation-dispatch/ methods 1–2: assemble the brief (from an issue or
│   │                             from SakalMaster MCP) and hand it to Claude Code on
│   │                             the web / Codex cloud; results return as PRs into
│   │                             the same gate pipeline
│   ├── templates/                per-stack setup.sh/verify.sh (flutter, laravel,
│   │                             node/react, electron/pnpm), caller ymls, issue
│   │                             template, CLAUDE.md block, denylist extras
│   └── .mcp.json                 optional sakalmaster MCP config (integrated mode)
├── docs/
│   ├── task-contract.md          the four-step contract — the spec everything obeys
│   ├── github-constraints.md     ported from garage §7, kept current
│   └── methods/01…07.md          the experiment lab notebook: setup, cost, verdict
│                                 per method
├── NOTES.md                      background: glossary, methods, decisions, FAQ
└── README.md
```

## How each of the seven methods plugs in

| # | Method | What this repo provides | Status |
|---|---|---|---|
| 1 | Claude Code on the web | `automation-dispatch` skill: brief → cloud session; PR returns into the same gate. Push-only by nature. | used ad-hoc; not yet wired |
| 2 | Codex cloud | Same dispatch skill, Codex flavour. | not started |
| 3 | claude-code-action | The reusable workflows — the hardened garage system, dual-source. **The default.** | live on garage |
| 4 | Headless loop (VPS) | `workers/headless-loop` + systemd unit + Docker sandbox; polls either source. | not started |
| 5 | Agent SDK worker (VPS) | `workers/sdk-worker`; sakalmaster MCP in integrated mode. The long-term worker. | not started |
| 6 | OpenClaw | Recipe in `docs/methods/06` only — a phone→dispatch *interface* reusing the dispatch skill + MCP. No code here. | not started |
| 7 | Orchestrators | Recipe running N copies of workers 4/5; the DB claim lease makes N workers safe. | later |

## Rules carried over from the garage hardening — do not regress

- Auto-merge is **opt-in per issue/task**; review is the default.
- The gate is `./tool/verify.sh` — the *repo* owns its stack; automation is stack-blind.
- Hard path denylist (`.github/**`, `tool/**`, gradle/keystores, `.env*`) enforced in
  workflow prompts; `CLAUDE.md` excluded from any docs-only fast path.
- Mechanical label release (`always()`), concurrency groups, app-token PRs.
- Agents cite/report; they never verify their own claims. In integrated mode the
  verifier and `agent_runs` are the judges; in standalone mode CI is.

## Migration plan

1. Create the repo; write `docs/task-contract.md` + port `github-constraints.md`.
2. Extract garage workflows → reusable, github-source mode; convert garage to caller
   #1; prove parity (same issues drain identically). Org-level secrets.
3. Build the plugin (install/operate skills + templates); onboard one Laravel or
   React repo with it as the acceptance test — target: under 30 minutes, no manual
   YAML.
4. Add the sakal source: `claim-sakal`/`report-sakal` actions wired per SakalMaster's
   `docs/ci/agent-runs.md`; flip garage to integrated once staging exists.
   **Granularity rule:** workflows install per REPO; a repo = one SakalMaster APP; the
   queue lives per PROJECT. Therefore a repo's claim must be **filtered by its app** —
   `claim_next_task(project, app)` — or garage's sweep would claim Laravel-backend
   tasks it cannot implement. If SakalMaster's claim RPC lacks the app filter, that is
   a small SakalMaster change to request before this step, not something to work
   around here. A useful consequence of the atomic lease: a CI sweep and a VPS worker
   may safely serve the same app concurrently — the claim prevents double work.
5. `workers/` as separate experiments, one method doc each, as Socheat runs them.

Stop for review after step 1's contract doc — the contract is the design; the rest
is filling it in.
