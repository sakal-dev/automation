# Method 4 — Headless loop (VPS)

**Status: built and locally verified (image, firewall, kill test). The
two-real-issue drain is deferred until a worker host holds a
`CLAUDE_CODE_OAUTH_TOKEN` (human-minted via `claude setup-token`).**

## What it is

`claude -p` in a loop inside the sandbox: claim → fresh clone → brief →
agent → gate (`tool/setup.sh` + `tool/verify.sh` in the LOOP's environment,
never trusted from the agent) → PR/report → release. One task per iteration.

## How it plugs in here

`workers/headless-loop/` (loop.sh + worker.service + env.example) over
`workers/lib/lifecycle.sh` — the single claim/brief/report/release
implementation shared with method 5; the SOURCE switch lives there only.
Sandbox: `workers/docker/` — non-root, no stack toolchains,
`--dangerously-skip-permissions` is only sane because the firewall and the
container are the actual permission system.

## VPS recipe

2 vCPU / 4 GB. Install Docker → clone sakal-dev/automation to
`/opt/sakal-automation` → `docker build -t sakal-sandbox workers/docker` →
`cp workers/headless-loop/env.example /etc/sakal-worker.env` + fill (chmod
600) → `cp worker.service /etc/systemd/system/sakal-worker.service` →
`systemctl enable --now sakal-worker`. Logs: `journalctl -u sakal-worker -f`.

## Experiment log

### 2026-07-22 — local Docker host: build + firewall + kill test — PASS

- Image builds (node22-slim + Claude Code + gh; no stack toolchains).
- Firewall: default-deny egress; allowlisted host 200, `example.com` and
  `pub.dev` dropped. Per-repo registries enter via `EXTRA_ALLOW_DOMAINS` —
  stack knowledge stays config.
- Kill test on a REAL claim (owner smoke issue): SIGTERM mid-agent → trap
  released the claim, issue back to clean `claude-ready`. **Design finding:**
  bash defers traps during foreground commands — the agent must run
  backgrounded under an interruptible `wait`, or SIGTERM rides through to
  SIGKILL and the release never fires. (The loop now does this.)
- Cost notes + per-task wall time: pending the real drain.

### Deferred — the two-issue drain

Needs `CLAUDE_CODE_OAUTH_TOKEN` in `/etc/sakal-worker.env` (or the local
test env). Then: point at a repo queue with 2 small real issues, one
iteration each, record wall time + token cost + failure modes vs method 3.
