# sdk-worker — METHOD 5 (VPS executor, the long-term worker)

**Status: stub — not started.** Built as a separate experiment
(migration step 5); findings go to `docs/methods/05-sdk-worker.md`.

## What it will be

The same engine as method 4 but as a **library**: a long-running process built
on the Claude Agent SDK, with a proper job queue instead of a shell loop.
This is the destination worker — method 4 exists to learn cheaply on the way
here.

## Shape

- **Agent SDK process** — programmatic sessions, structured tool access,
  real error handling and per-run telemetry (cost, duration, outcome) for the
  method lab notebook.
- **Integrated mode**: talks to SakalMaster via the **sakalmaster MCP server**
  (the interactive door — unlike CI, a long-lived worker can hold an MCP
  session). Claim/report still obey the exact same contract semantics.
- **Standalone mode**: `gh` CLI against issues + labels, same as method 4.
- **Concurrency-ready**: N copies of this worker are safe because the claim
  lease is atomic — that is what method 7 (orchestrators) runs N of.
- **Runs inside the Docker sandbox** (`workers/docker/`), same rules.

## Contract obligations

Identical to every executor — see `workers/headless-loop/README.md` and
`docs/task-contract.md`'s conformance checklist.
