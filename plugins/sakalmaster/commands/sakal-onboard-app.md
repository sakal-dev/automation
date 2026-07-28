---
description: PREPARE the APP layer (stories, ACs, tasks, bugs) for this codebase, referencing the project layer on the server.
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

Prepare this repo'"'"'s **app layer** — `stories/<EPIC>/<KEY>.md`, plus
`tasks/` and `bugs/` when the repo has issues — as `scope: app`.
**Nothing is sent to SakalMaster.**

1. **Validate the declaration before writing anything.** Read the project'"'"'s
   codebases from the server into a temp file, then:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-scope.mjs --declared app --apps <tmp>`
   - exit 1 → print the refusal as-is and stop. The usual cause is that this
     repo is not a linked codebase yet; the refusal says where to link it.
   - exit 2 → the codebase list was not supplied. Fetch it; do not write blind.
2. Print the target: project, app, host, project id.
3. **Read the project layer from the SERVER and reference its keys.** Never
   re-draft a persona, goal, module, journey or epic here — verify treats a
   project-layer definition in an app tree as an error.
4. Draft stories with provenance. A story needing a project-layer entity that
   does not exist goes to `.sakal/proposals/` with a note — acknowledged by
   verify, never submitted, carried to the spec-home by a human.

**End by naming the next step:**

> Prepared N stories. Nothing sent.
> Next: **/sakal-verify**, then **/sakal-submit** to see what is ready.
