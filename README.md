# SakalAutomation

The central home for agent automation reused across every sakal-dev / Thalias
project. It consolidates the hardened `sakalpos-garage` system, supports all
seven execution methods, and runs in two modes: **standalone** (GitHub is the
queue — nothing else needed) and **integrated** (SakalMaster is the queue and
the judge).

> **Current state: skeleton.** The contract and every stub are real; the
> implementation arrives session by session (garage extraction next). Every
> file documents what it will become.

## The contract, in five lines

```
1 SOURCE   where the task comes from      github issues | sakalmaster queue
2 BRIEF    what the agent is told         issue body + ACs | sakal_get_brief
3 EXECUTE  who does the work              methods 1–7 (NOTES.md §3)
4 GATE     how it is judged + reported    ./tool/verify.sh + PR → labels | agent_runs
           gate before PR · merge opt-in · agents never verify their own claims
```

The full spec is [`docs/task-contract.md`](docs/task-contract.md) — everything
in this repo implements it, and a new executor is conformant iff it passes
that document's checklist.

## Layout

```
.github/workflows/    reusable workflows (workflow_call) — method 3 engines:
                      sweep, on-demand, automerge, claude-done, verify
actions/              composite actions: setup-project, claim-github,
                      claim-sakal, report-sakal
workers/              VPS executors — headless-loop (m4), sdk-worker (m5),
                      docker sandbox
.claude-plugin/       this repo is also a plugin marketplace
plugins/sakal-automation/
  skills/             automation-install · automation-operate · automation-dispatch
  templates/          per-stack setup.sh / verify.sh, caller ymls, issue
                      template, CLAUDE.md block
docs/
  task-contract.md    the spec everything obeys
  github-constraints.md  the platform facts that shaped the design
  methods/01…07.md    the experiment lab notebook, one file per method
```

## How a project consumes this

Three pieces, all installed by the `automation-install` skill (<30 min, no
manual YAML):

1. **Callers** — ~10-line workflows `uses:`-ing the engines here, pinned to a
   tag, never `@main`. Versioning follows the actions-ecosystem convention:
   **`v1` is a floating major tag** — it always points at the latest
   compatible engine and is moved on each release; **immutable `v1.x.y` tags**
   mark the releases themselves (first cut: `v1.0.0` at garage parity).
   Callers ride `@v1`; pin `@v1.x.y` only if a repo needs to freeze.
2. **Two scripts** — `tool/setup.sh` and `tool/verify.sh`, owned by the
   project repo. They are the only place stack knowledge lives; the engine is
   stack-blind. This is the whole Flutter/Laravel/React/Electron answer.
3. **The plugin** — install this repo as a Claude Code plugin marketplace and
   the install/operate/dispatch skills come along.

### Secrets — per repo today (Free plan), org-level if we upgrade

`secrets: inherit` in every caller passes whatever secrets the calling repo
can see — repo-level or org-level, the engine doesn't care.

**Current layout: repo-level `CLAUDE_CODE_OAUTH_TOKEN` in each consumer
repo.** The `sakal-dev` org is on the GitHub Free plan, and org secrets are
not visible to private repos on Free — so the "one org secret" design
(NOTES.md §4) is parked until/unless the org upgrades to Team. In practice
this costs nothing at onboarding time:

- **New repo:** run `/install-github-app` from Claude Code in that repo — it
  installs the GitHub App AND creates the repo's `CLAUDE_CODE_OAUTH_TOKEN`
  secret automatically. No manual secret handling at all.
- **Manual alternative:** `claude setup-token` (browser login, prints
  `sk-ant-oat01-…`), then
  `gh secret set CLAUDE_CODE_OAUTH_TOKEN -R sakal-dev/<repo>`.
- **Rotation** is per-repo: re-run either of the above in each consumer repo
  (`gh secret list -R <repo>` to audit which repos carry it).

**If the org ever upgrades to Team:** create the secret once at org level
with *Selected repositories* visibility (workflows in agent-worked repos are
semi-trusted — grant read access explicitly, never `all`), grant each
consumer repo access, then delete the repo-level copies. A repo-level secret
with the same name overrides the org one, so the migration is zero-downtime:
the org secret takes over the moment a repo copy is deleted. The token value
itself is never written down anywhere but the secret store.

## Background

[`NOTES.md`](NOTES.md) is why everything is the way it is: the vocabulary
(methods are runtimes, not workflow files), the seven methods and their
status, the decisions already made with their reasons, and the FAQ from the
design discussion. Read it before proposing changes.
