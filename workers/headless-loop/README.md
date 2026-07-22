# headless-loop — METHOD 4 (VPS executor)

**Status: stub — not started.** Built as a separate experiment
(migration step 5); findings go to `docs/methods/04-headless-loop.md`.

## What it will be

`claude -p` in a loop on a VPS: poll the source, and when a task is claimed —
brief → execute → gate → report, then poll again. The simplest possible pull
executor; the stepping stone to the SDK worker (method 5).

## Shape

- **Loop script** — one iteration = one full pass through the contract
  (`docs/task-contract.md`). Idle polls must be ~free.
- **Dual-source**, like everything else: `source=github` polls ready-labelled
  issues via `gh`; `source=sakalmaster` calls `claim_next_task(project, app)`
  over REST. The executor step itself never branches on the source.
- **systemd unit** — restart-on-failure, environment (secrets) from a root-only
  env file, journald logs. A dead loop's SakalMaster lease simply expires;
  no cleanup handler needed.
- **Runs inside the Docker sandbox** (`workers/docker/`) — non-root, egress
  firewall. The loop never runs bare on the host.

## Contract obligations (same as every executor)

`tool/setup.sh` / `tool/verify.sh` only — no stack knowledge here; hard path
denylist in the prompt; verify before PR is advisory locally, judged by the
gate; heartbeat while running (integrated); PRs via the app identity.
