# docker — the VPS sandbox image (methods 4 & 5)

**Status: stub — not started.** Built alongside the first worker experiment.

## What it will be

The container both VPS workers run inside. The workers are untrusted
executors (contract step 3); this image is part of the trust boundary around
them.

## Requirements

- **Non-root** — the agent process runs as an unprivileged user; the repo
  checkout is the only writable surface it needs.
- **Egress firewall** — outbound network restricted to what an executor
  legitimately needs (Anthropic API, GitHub, the SakalMaster instance);
  everything else denied by default.
- **Nothing baked in** — no secrets in the image (contract invariant 8 /
  session rule: secrets arrive at runtime via the systemd env file), and no
  stack toolchains: the checked-out repo's `tool/setup.sh` installs what the
  project needs (invariant 6 — the sandbox is stack-blind too).
- One image serves both workers; the worker binary/script is mounted or
  copied in, so image rebuilds are rare.
