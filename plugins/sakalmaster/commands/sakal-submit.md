---
description: Submit verified .sakal/ files to SakalMaster. Bare = show what is ready or blocked, and send nothing.
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


Send verified `.sakal/` files to SakalMaster.

**Bare `/sakal-submit` SUBMITS NOTHING.** With no selector, show what is ready
and what is blocked, then ask. Choosing what to send is the user's, and a
command that guesses is a command that surprises.

1. **Re-verify the scope first.** A green from ten minutes ago is not a green —
   files change. Run the same verifier `/sakal-verify` runs:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-verify.mjs --server <tmp> --json [--scope <sel>]`
   Any error in scope → refuse, show the first three, stop.
2. **Print the target** — project, app, host — before the first write.
3. **Report readiness in plain words**, from the verifier's `readiness`:
   - ready: everything it references already exists in SakalMaster
   - blocked: say what is missing and what to send first, e.g.
     *"GR-03-02 references epic GR-03, not in SakalMaster yet — submit
     epics.yaml first"*
4. **Write only the selection.** Keys are identity (`spec:<app>:<KEY>`); create
   what is missing, never duplicate, never delete. ACs are born open; tasks land
   **not** agent-ready.
5. **Never submit `proposals/`.** They are carried to the spec-home by a human,
   deliberately.
6. **Always report whole-tree drift**, even for a scoped submit.

**Selectors are resolved by code, not by reading this carefully.** Always run:

`node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-select.mjs [--json] [$ARGUMENTS]`

- exit 1 → print its refusal verbatim (it already lists what IS selectable) and
  stop. It refuses typos, empty selections, paths outside `.sakal/`, and
  `proposals/`.
- no selector → its listing IS the show-and-ask.
- `--all` with any verify error anywhere → **hard refuse**, name the first three.
- Old shape `/sakal-onboard submit …` → one line: *"Submitting moved to
  **/sakal-submit**. Try `/sakal-submit <selector>`."* Not an error dump.

**End by naming the next step**, always:

> Sent N. Blocked M (reason). *Next: submit `<the thing that unblocks them>`,*
> or *run **/sakal-verify** to re-check.*
