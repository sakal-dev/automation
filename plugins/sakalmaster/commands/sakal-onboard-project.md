---
description: PREPARE the PROJECT layer (registry, journeys, epics) in the spec-home repo. Fully local — nothing leaves the machine.
---

## This phase is OFFLINE

It reads the repo and writes files. There is no server involved at any point —
never prompt for a connection, never retry, never fail waiting on one. Target
identity (`project:`, `app:`) is a DECLARATION written into `.sakal/config.yaml`
from the repo and what the user tells you.

## Then

Prepare this repo'"'"'s **project layer** — `registry/`, `journeys.yaml`,
`epics.yaml`, `decisions.md` — as `scope: project`. Run this in the
spec-home repo. **Nothing leaves this machine.**

1. **Validate the declaration before writing anything.** Read the project'"'"'s
   linked codebases from `registry/codebases.yaml` in this repo, format them as
   `[{"app":"…","repo":"owner/name"}]`, write that to a temp file, then:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-scope.mjs --declared project --apps <tmp> [--project-layer-empty]`
   - exit 1 → print the refusal as-is and stop.
   - exit 2 → it needs a human confirmation (this repo is also a linked
     codebase). Show the text and ask before writing.
2. Print the DECLARED target: project, app. Say it is a declaration.
3. Read the repo'"'"'s reality and draft the project layer from
   `${CLAUDE_PLUGIN_ROOT}/templates/sakal/`. Every journey and epic carries
   `source:`; anything drafted without a document says `source: none (drafted)`.
4. Do **not** write stories here — those belong to app repos (or to this one,
   run separately as `/sakal-onboard-app`, in a single-repo project).

**End by naming the next step:**

> Prepared the project layer.
> Next: **/sakal-verify**, then **/sakal-onboard-app** in each codebase repo
> (or in this one, for a single-repo project).
