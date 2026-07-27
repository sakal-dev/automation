# SakalAutomation

The central home for agent automation reused across every sakal-dev / Thalias
project. It consolidates the hardened `sakalpos-garage` system, supports every
execution channel, and runs in two modes: **standalone** (GitHub is the
queue — nothing else needed) and **integrated** (SakalMaster is the queue and
the judge).

> **Naming (2026-07-27).** The lab's numbered "methods" are **channels** —
> where/how an agent executes; SakalMaster's enforceable `exec_method` values
> are **credential classes** — what a run proves at the claim chokepoint.
> Channels 1+2 are merged into one push-only channel, **Cloud dispatch**,
> parameterized by provider (Claude Code on the web · Codex cloud). SakalMaster
> now teaches Cloud dispatch in-product (Execution page: informational card +
> flow dialog) as of 2026-07-27. Its first LOGGED run is still pending the
> human browser dispatch — see the prepared experiment in `docs/methods/01`.
> The numbered files 01…07 keep their names as the historical lab notebook.

> **Current state: LIVE.** Engine v2 (OIDC, zero repo secrets) runs two
> production repos; the integrated loop is proven end to end (a merged agent
> PR flipped a SakalMaster AC to `enforced` in 9 seconds — see
> `docs/methods/03`). The lab notebook (`docs/methods/`) records every
> experiment behind it.

## The contract, in five lines

```
1 SOURCE   where the task comes from      github issues | sakalmaster queue
2 BRIEF    what the agent is told         issue body + ACs | sakal_get_brief
3 EXECUTE  who does the work              channels 1–7, 1+2 = Cloud dispatch (NOTES.md §3)
4 GATE     how it is judged + reported    ./tool/verify.sh + PR → labels | agent_runs
           gate before PR · merge opt-in · agents never verify their own claims
4b REVIEW  the back-and-forth before merge  request-changes → rework (cap 2) → escalate
           reviewer ≠ author · reviewed branches are append-only · operator overrides, recorded
```

The full spec is [`docs/task-contract.md`](docs/task-contract.md) — everything
in this repo implements it, and a new executor is conformant iff it passes
that document's checklist.

## Layout

```
.github/workflows/    reusable workflows (workflow_call) — method 3 engines:
                      sweep, on-demand, automerge, claude-done, review-loop,
                      verify
actions/              composite actions: setup-project, claim-github,
                      claim-sakal, report-sakal, authority-gate,
                      review-state, review-brief, review-anchors
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

## Onboarding, in one sentence

Install the plugin, open the repo in Claude Code (or connect the folder in
Cowork), and say **"set up agent automation here"** — the `automation-install`
skill does the rest (<30 min, no hand-written YAML) and prints what it
changed plus the secrets checklist:

```
/plugin marketplace add sakal-dev/automation
/plugin install sakal-automation@sakal-automation
```

## How a project consumes this

Three pieces, all installed by the `automation-install` skill (<30 min, no
manual YAML):

1. **Callers** — small workflows `uses:`-ing the engines here, pinned to a
   tag, never `@main`. The real thing, from sakalpos-garage (caller #1):

   ```yaml
   name: Claude daily task sweep
   on:
     schedule:
       - cron: "0 15,21 * * *"   # off-peak minutes; cron is UTC + best-effort
     workflow_dispatch:           # required: self-redispatch targets this file
   permissions:                   # the engine cannot raise beyond this grant
     contents: write
     pull-requests: write
     issues: write
     id-token: write
     actions: write
   jobs:
     sweep:
       uses: sakal-dev/automation/.github/workflows/sweep.yml@v2
       secrets: inherit
   ```

   Versioning follows the actions-ecosystem convention: **`v2` is the
   floating major tag** (moved on each release; internal action refs ride
   with it); immutable `v2.x.y` tags mark releases. The v1 line is frozen at
   `v1.1.0` (last release accepting the deprecated input names). Callers
   ride `@v2`; pin `@v2.x.y` only to freeze.
2. **Two scripts** — `tool/setup.sh` and `tool/verify.sh`, owned by the
   project repo. They are the only place stack knowledge lives; the engine is
   stack-blind. This is the whole Flutter/Laravel/React/Electron answer.
3. **The plugin** — install this repo as a Claude Code plugin marketplace and
   the install/operate/dispatch skills come along.

### Secrets — org-level (live since the Team upgrade, 2026-07-23)

`secrets: inherit` in every caller passes whatever secrets the calling repo
can see — repo-level or org-level, the engine doesn't care.

**Current layout: ONE org-level `CLAUDE_CODE_OAUTH_TOKEN`** (NOTES.md §4's
one-rotation-point design, live), currently visible to **all private
repos**. Repo-level copies were deleted at cutover — a repo-level secret
with the same name would OVERRIDE the org one, so don't recreate them
(`/install-github-app` in a new repo may add one; delete it after, or skip
that step of the flow since the org secret already covers the repo).

- **New repo:** nothing to do for this secret (all-private visibility). If
  visibility is ever tightened to *Selected repositories* — the safer
  posture, since workflows in agent-worked repos are semi-trusted — then
  onboarding = tick the repo in the org secret's access list (or the
  `gh api -X PUT orgs/sakal-dev/actions/secrets/.../repositories/<id>`
  one-liner).
- **Rotation:** `claude setup-token` → paste into the org secret. One place.
- **Separate identities stay separate:** VPS worker / fleet tokens are
  per-host, per-replica credentials (a correctness rule — see
  `docs/methods/07`), not this org secret.
- **Integrated mode needs NO secret at all**: CI authenticates to SakalMaster
  via GitHub OIDC (`permissions: id-token: write`); the exchange maps the
  signed repository claim to project + app server-side. `SAKAL_TOKEN` PATs
  exist only as the non-Actions fallback (VPS workers).

The token value is never written down anywhere but the secret store.

## Background

[`NOTES.md`](NOTES.md) is why everything is the way it is: the vocabulary
(methods are runtimes, not workflow files), the seven methods and their
status, the decisions already made with their reasons, and the FAQ from the
design discussion. Read it before proposing changes.
