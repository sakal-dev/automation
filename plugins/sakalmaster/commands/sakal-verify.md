---
description: The hard gate — lint .sakal/ and report problems in file:line words. Whole tree or a scope.
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

Run the gate over `.sakal/`. **This is the same verifier `/sakal-submit` runs —
there is exactly one implementation of these checks**, at
`${CLAUDE_PLUGIN_ROOT}/lib/sakal-verify.mjs`.

1. If the MCP is connected, read the server back first and write it to a temp
   file, so drift and readiness are live rather than remembered:
   `sakal_search_stories`, plus the project layer (`sakal_project_summary` and
   the registry reads) as `{stories:[…],epics:[…],journeys:[…],personas:[…],modules:[…],goals:[…]}`.
2. Run:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-verify.mjs [--server <tmp>] [--scope <sel>]`
3. Show the output as it is. Do not summarise away a `file:line`; that is the
   part the user acts on.

$ARGUMENTS is an optional scope — `stories/GR-03/`, `journeys.yaml`, one file.
A selector that matches nothing → say so and list what IS selectable (the
top-level entries of `.sakal/`). **Whole-tree drift is reported even when
scoped**, so a narrow check never hides a wider divergence.

**End by naming the next step**, always:

> Green → *Next: **/sakal-submit** to see what is ready to send.*
> Errors → *Fix the files above and run **/sakal-verify** again. Nothing has
> been sent anywhere.*
