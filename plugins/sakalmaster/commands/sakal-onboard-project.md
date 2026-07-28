---
description: PREPARE the PROJECT layer (registry, journeys, epics) in the spec-home repo. Writes nothing to SakalMaster.
---

## FIRST, before anything else

If the `sakal_*` MCP tools are not available in this session, print exactly this
and stop:

> **Restart Claude Code, then re-run this command.** The SakalMaster tools are
> not registered in this session yet. (Plugin commands, MCP registration and the
> tool registry after authentication each need a restart to appear.)

Do not list paths, do not read `~/.claude.json`, do not run `python3 -c`, do not
open config files. Check tool presence, and `claude mcp list` if you need more.
A customer's first interaction should not be an approval dialog about this
plugin's own internals.

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
2. Print the target: project, host, project id.
3. Read the repo'"'"'s reality and draft the project layer from
   `${CLAUDE_PLUGIN_ROOT}/templates/sakal/`. Every journey and epic carries
   `source:`; anything drafted without a document says `source: none (drafted)`.
4. Do **not** write stories here — those belong to app repos (or to this one,
   run separately as `/sakal-onboard-app`, in a single-repo project).

**End by naming the next step:**

> Prepared the project layer. Nothing sent.
> Next: **/sakal-verify**, then **/sakal-submit epics.yaml** (epics before the
> stories that reference them).
