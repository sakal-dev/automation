# Method 4 — Headless loop (VPS)

**Status: LIVE-PROVEN (2026-07-23, local Docker host): 2/2 real issues
drained end to end — PRs #9 and #10 on sakalpos-owner, gate run by the
loop, claims released. Three engine defects found and fixed on the way
(the point of live drains). VPS deployment: recipe below, unchanged.**

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

### 2026-07-23 — live drain complete (v3 sandbox): 2/2 SUCCEEDED

Real queue: sakalpos-owner test-debt chores (#7, #5 — real, decision-free).

| | iter 1 (#7 → PR #9) | iter 2 (#5 → PR #10) |
|---|---|---|
| wall time | 18.7 min | 14.9 min |
| cost | $1.31 | $2.64 |
| turns | 49 | 70 |
| outcome | PR, gate green | PR, gate green |

Two more defects found live before the successes (both fixed + committed):
**(2) dnsmasq privilege-drop** silently killed post-TTL re-resolution (the
uid-scoped :53 rule) — the Anthropic API vanished mid-run once the seed
cache expired; fix: `user=root` + real upstreams. **(3) GraphQL-pool label
releases**: `gh issue edit` is GraphQL; a heavy sweep day drained the shared
PAT's pool and a release retried 4× into it — worker lifecycle label ops
now REST end to end. Also observed: `claude-done` heals a stuck claim at
PR-open (designed redundancy paying off), and worker PRs author as the PAT
owner — use a dedicated machine-account PAT per worker on the VPS.

**Verdict vs method 3:** same engine, same gate, same PR quality; the loop
adds ~zero runner-queue latency and full host control, at the cost of
owning the sandbox (three of three defects found were sandbox/limits, not
agent behaviour). For steady queues it complements the cron sweep;
per-task agent cost is the same order (~$1.3–2.6 vs the sweep's ~$1.8/issue
observed).
