# The methods lab — index & cost seed

One file per execution method (01–07), each with setup / how-it-plugs-in /
an experiment log with honest verdicts. `VERDICT.md` (session 11) will turn
this into the recommendation matrix; this paragraph is its seed.

**Cost per task, observed (2026-07-23, sakalpos-owner test-debt chores,
Flutter):** method 3 (CI sweep) ≈ **$1.8/issue** within a batched run;
method 4 (headless loop) **$1.31–$2.64**, 15–19 min wall; method 5 (SDK
worker) comparable wall, cost capture pending. All three produce the same
gated PR quality — the differentiators are latency (workers poll; CI
queues), control (method 5's hook denylist is enforced code — proven live),
and ops surface (workers own a sandbox; CI owns nothing). Methods 1–2 spend
human cloud quota instead of API tokens (1: prepared, awaiting a run;
2: no account). Fleets: run integrated (the DB lease); github-mode label
claims raced at N=2 on first try.
