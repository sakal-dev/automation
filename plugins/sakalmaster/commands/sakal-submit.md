---
description: Submit verified .sakal/ files to SakalMaster. Bare = show what is ready or blocked, and send nothing.
---

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

Selectors ($ARGUMENTS): `journeys.yaml` · `epics.yaml` · `registry/` ·
`stories/GR-03/` · a single file · `--all`.
- `--all` with any verify error anywhere → **hard refuse**, name the first three.
- A selector that matches nothing, or a path outside `.sakal/` → refuse in
  words and list what IS selectable.
- Old shape `/sakal-onboard submit …` → one line: *"Submitting moved to
  **/sakal-submit**. Try `/sakal-submit <selector>`."* Not an error dump.

**End by naming the next step**, always:

> Sent N. Blocked M (reason). *Next: submit `<the thing that unblocks them>`,*
> or *run **/sakal-verify** to re-check.*
