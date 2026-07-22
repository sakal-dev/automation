# Method 7 — Orchestrators (N parallel workers)

**Status: later — deliberately after methods 4/5 exist.**

## What it is

Running N agent workers in parallel under a scheduler/dashboard — amux,
tmux-orchestrator variants, agent teams. Throughput, not a new kind of
executor.

## How it plugs in here

A recipe running N copies of method 4 or 5. The enabling property is already
in the contract: the atomic claim lease (`claim_next_task`) makes N
concurrent claimants safe — no orchestrator-level coordination is needed to
prevent double work, only process supervision. Experiments should measure
where the real ceiling is (API rate limits, review bandwidth, queue depth)
rather than assuming more workers = more done.

## Experiment log

*(empty — record setup, cost, and verdict per run here)*
