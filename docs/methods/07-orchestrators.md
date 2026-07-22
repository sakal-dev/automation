# Method 7 — Orchestrators (N parallel workers)

**Status: fleet compose written; 2-replica mock experiment RUN with real
findings (below). Real-agent fleet rides with methods 4/5's deferred token.**

## What it is

Running N copies of methods 4/5 against one queue. Throughput, not a new
executor. `workers/fleet/docker-compose.yml` — one service per identity.

## The safety argument (honest version, updated by experiment)

- **github mode: the label claim is check-then-act, and the race is REAL —
  we hit it on the first try.** Two replicas cold-started together polled in
  lockstep and BOTH claimed the same issue before either label landed.
  Mitigations now in the loop: `CLAIM_JITTER` de-synchronises polls; still
  only *probabilistic*. Keep github-mode fleets at N≤2 with jitter, or
  don't.
- **sakalmaster mode: the DB lease (`FOR UPDATE SKIP LOCKED`) is exact — N
  safe by construction. This is the fleet mode.** Recommend integrated for
  any real fleet.
- **Per-replica identity is a CORRECTNESS requirement, not just
  attribution**: stopping two replicas in parallel produced two concurrent
  label-writes from one shared token; GitHub's secondary rate limiting ate
  both releases silently and the claim stuck. One token per replica (also
  what keeps Team · Agents attribution unblurred); the release path now
  verifies + retries with backoff regardless.

## Control planes evaluated (adopt / watch / skip)

- **amux** — dashboards + scheduling over parallel sessions. SKIP for now:
  our scheduling is the claim, our dashboard is Team · Agents; amux adds a
  second control plane to keep honest. WATCH if fleet size passes ~5.
- **tmux-orchestrator variants** — session babysitting we don't need
  (systemd + compose already supervise). SKIP.
- **Claude Code agent teams** — same-session parallelism, not queue
  workers; different problem. SKIP here.

## Experiment log

### 2026-07-22 — 2 mock replicas vs 2-issue queue — mechanics run

- Both replicas started, both claimed **the same issue** (the race, above) —
  the second issue sat unclaimed. Finding folded into the loop (jitter).
- Parallel `docker stop`: both traps fired, but both releases were eaten by
  secondary rate limiting on the shared token → stuck label (finding folded
  into lifecycle.sh: verify + retry; rule: per-replica tokens).
- Re-run of a single replica: claim → stop → clean release confirmed.
- **Verdict so far: the compose shape works; github-mode fleets are
  N≤2-with-jitter at best; do real fleets in integrated mode.** Re-run with
  2 real agents + 4 real issues when the worker token exists.
