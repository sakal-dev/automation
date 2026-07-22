# Method 6 — OpenClaw

**Status: recipe written; not yet run (no OpenClaw install exists). No code
in this repo, by design — it is an interface, not an executor.**

## What it is for us

A phone/chat front door (Telegram → self-hosted gateway → agent) that
DISPATCHES work — via the `automation-dispatch` skill or the sakalmaster
MCP — and never works a queue itself. "Work on issue #52 from my phone" is
a normal dispatch; the PR lands in the standard gate.

## Setup recipe (verify against current OpenClaw docs on install day)

1. Small VPS (1–2 vCPU) or the existing worker host; install OpenClaw
   per its current docs; pair Telegram.
2. **Never expose the gateway publicly** — bind to localhost/VPN, firewall
   everything else. A chat gateway is an auth boundary; treat it like one.
3. Wire its agent to: the `sakal-automation` plugin (dispatch skill) and the
   sakalmaster MCP with a **read-mostly PAT**.
4. **Permission stance (a rule, not a preference): the OpenClaw agent gets
   `read` + `dispatch`, never `write`.** One compromised chat gateway must
   not be able to modify repos, merge PRs, or close tasks. Dispatched work
   is judged by the same gate as everything else — that is the containment.

## Experiment log

*(not yet run — no install. Record pairing friction, dispatch round-trip
time, and whether the read-mostly boundary held, when one exists.)*
