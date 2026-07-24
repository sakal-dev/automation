# VERDICT — which method for which repo (2026-07-24)

The lab notebook's payout. Sources: real runs only — methods/01–07 logs,
sessions 2–10 drains, the session-9 integrated flip. Consult this before
onboarding repo #4; update it when a new real run changes a number.

## Per-method observed data

| Method | Setup cost | Per-task wall | Per-task cost | Guardrails | Failure modes seen |
|---|---|---|---|---|---|
| 3 · CI sweep/on-demand (**default**) | ~14 min/repo (install skill) | in-batch; ~5 issues/run | ≈$1.8/issue | prompt denylist + engine gates + guardrail-paths | delayed crons (by design); silent-403 if caller perms drift |
| 4 · headless loop | image + env file (~30 min first host) | 15–19 min | $1.31–$2.64 | prompt denylist; sandbox + firewall | 3 sandbox defects found+fixed (CDN ipset, DNS uid, GraphQL pool); none agent-side |
| 5 · SDK worker | method 4 + npm build | comparable (2 tasks) | not yet captured | prompt + **hook-as-code (fired live)**; fast-release proven | 4 wrapper defects found+fixed (hook FPs ×2, SIGKILL race, late-stream-error) |
| 1 · Claude Code web | none (browser) | — | human cloud quota | same gate on return | not yet run (needs the human's browser; prepared) |
| 2 · Codex cloud | — | — | — | — | **blocked: no account** — no verdict |
| 6 · OpenClaw | recipe only | — | — | read+dispatch, never write | not run |
| 7 · fleet (N×4/5) | compose file | n/a | n/a | per-replica identity = correctness | double-claim at N=2 (github mode); shared-token release collisions — both hardened |

**Integrated mode (any method) adds the differentiator**: derived AC truth.
The flip run: merge → server-side Dart verifier → AC `broken→enforced` in
**9 seconds**, zero repo secrets (OIDC). This is the layer none of the
comparable open-source systems have (NOTES.md §6).

## The recommendation matrix

| Repo class | Method | Why |
|---|---|---|
| **Active product repo** (garage, owner) | **3, integrated** | zero-config (OIDC), crons + @claude cover push and pull, engine gates are structural, Team·Agents is the dashboard. Cost ≈$1.8/issue is the baseline to beat |
| **Steady deep queue** (long backlogs, big refactors) | **3 + 4 side-by-side** | the DB lease makes CI sweep + VPS loop safe concurrently; the loop dodges runner queues and cron delay for ~the same per-task cost |
| **Where guardrails must be code** (payment-adjacent, security-sensitive) | **5** | the PreToolUse hook is the only executor where the denylist is enforced mechanically — proven live on a real block |
| **Occasional-maintenance repo** | **3, standalone** | one install, crons idle for ~free (check-for-work ≈ seconds), zero infra owned |
| **Ad-hoc "just do this one"** | **1 via dispatch skill** | no queue needed; human quota; same gate on return |
| **Fleets** | **integrated only**, one identity per replica | github-mode label claims raced at N=2 on the first try; the DB lease is exact |

## Honest gaps (named, not hidden)

Method 1: procedure ready, first logged run still needs the human's browser
session. Method 2: no account — no verdict will be invented. **Fleet real
run: DEFERRED by decision (2026-07-24)** — completeness, not capability; the
mock caught the real findings and the mechanics are proven. If the N-worker
verdict is ever genuinely needed, run it INTEGRATED with one SakalMaster
agent PAT per replica (VPS can't mint OIDC). Method 5: token cost
uncapturable from the rotated logs — capture next drain. Mechanical chain
(v2.1.0): fire-path not yet observed live (queues were empty at release) —
watch the next multi-task drain. **Method 8 (Claude Code
Routines)**: worth one experiment as a managed method-3 replacement for the
cron half — revisit after a month of steady-state cost data.
