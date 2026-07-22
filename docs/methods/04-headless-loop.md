# Method 4 — Headless loop (VPS)

**Status: not started.**

## What it is

`claude -p` in a loop on a VPS under cron/systemd, polling a queue: the
simplest pull executor. No GitHub Actions minutes, no runner cold starts,
full control of the environment.

## How it plugs in here

`workers/headless-loop/` (loop script + systemd unit), running inside the
`workers/docker/` sandbox (non-root, egress firewall), dual-source like
everything else. First experiment: deploy against one repo and compare cost
and latency against method 3 on the same tasks. Also the proving ground for
the claim lease: a VPS loop and the CI sweep serving the same app
concurrently without double work.

## Experiment log

*(empty — record setup, cost, and verdict per run here)*
