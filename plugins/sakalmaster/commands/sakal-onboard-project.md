---
description: PREPARE the PROJECT layer (registry, journeys, epics) in the spec-home repo. Writes nothing to SakalMaster.
---

## This phase is OFFLINE

It reads the repo and writes files. It does **not** need the SakalMaster MCP and
must never block on it. If the tools happen to be present you MAY read the
server back and print the delta as enrichment; if they are absent, or the user
denies the call, print one line and carry on:

> offline — server state unknown; delta will be shown at submit.

Never prompt for a connection, never retry, never fail. Target identity is a
DECLARATION written into `.sakal/config.yaml` from the repo and what the user
tells you; **submit** is where that claim is checked against the server.

## Then

Prepare this repo'"'"'s **project layer** — `registry/`, `journeys.yaml`,
`epics.yaml`, `decisions.md` — as `scope: project`. Run this in the
spec-home repo. **Nothing is sent to SakalMaster.**

1. **Validate the declaration before writing anything.** Read the project'"'"'s
   codebases from the server, write them to a temp file as
   `[{"app":"…","repo":"owner/name"}]`, then:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-scope.mjs --declared project --apps <tmp> [--project-layer-empty]`
   - exit 1 → print the refusal as-is and stop.
   - exit 2 → it needs a human confirmation (this repo is also a linked
     codebase). Show the text and ask before writing.
2. Print the DECLARED target: project, app, host. Say it is a declaration.
3. Read the repo'"'"'s reality and draft the project layer from
   `${CLAUDE_PLUGIN_ROOT}/templates/sakal/`. Every journey and epic carries
   `source:`; anything drafted without a document says `source: none (drafted)`.
4. Do **not** write stories here — those belong to app repos (or to this one,
   run separately as `/sakal-onboard-app`, in a single-repo project).

**End by naming the next step:**

> Prepared the project layer. Nothing sent.
> Next: **/sakal-verify**, then **/sakal-submit epics.yaml** (epics before the
> stories that reference them).
