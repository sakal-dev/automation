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

### 2026-07-23 — live drain, iteration 1 (local Docker): ENGINE DEFECT FOUND & FIXED

First real autonomous task (owner #5, tests chore). The agent behaved
textbook under failure: verified first (confirmed the tests genuinely don't
exist), hit the blocker, REFUSED to open a gateless PR (RULES §3), blocked
with a precise diagnosis on the issue, cleaned its branch. 12.4 min wall,
$1.82, 57 turns — an honest failure, cheaper than a dishonest success.

**The defect (the whole point of live drains):** firewall v1 resolved the
allowlist ONCE at container start into a static ipset. Anycast CDNs
(`storage.googleapis.com`, the Dart SDK host) rotate IPs between that
resolve and the actual connections → Flutter install timed out despite the
domain being "allowed". **Fix (v2): dnsmasq is the container's only
resolver with `ipset=/domain/allowed` — every DNS answer enters the set at
resolution time, so a connection can never race its own DNS.** Verified:
repeated CDN fetches all pass; non-allowlisted still dropped; agent DNS only
via loopback (upstream :53 is root/dnsmasq-only).

### 2026-07-23 — live drain, iterations 1–2 (v2 sandbox): see below
