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

## If the fleet is revived: federated identity, not minted PATs

The per-replica identity rule stands (it is a correctness rule, not just
attribution — see the experiment below). But *how* those identities are
obtained must change. Hand-minting a PAT per replica is the same
per-tenant-manual-setup smell that OIDC removed for Actions: it does not
scale past the builder's own org, and it leaves standing credentials whose
only justification is "a worker might need one someday" (the exact habit
that retired the `garage sweep` PAT on 2026-07-24).

**Requirement for any future fleet:** replica identity comes from a
federated mechanism — per-replica OIDC where the runtime can mint it (any
Actions-hosted replica), or a signed installation token exchanged at start-up
otherwise. Hand-minted PATs are the fallback of last resort, per
`docs/CREDENTIALS_REQUIRED_CHECKLIST.md` rule 2. SakalMaster already derives
`agent_runs.method` from the credential, so a federated worker identity also
makes each replica's runtime *provable* rather than asserted.

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
