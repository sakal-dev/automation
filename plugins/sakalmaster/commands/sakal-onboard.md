---
description: PREPARE only — read this repo and write/update .sakal/. Writes nothing to SakalMaster.
---

Prepare (or refresh) this repo's `.sakal/` directory. **This command never
writes to SakalMaster.** It reads the repo and produces files a human can review.

Follow the `sakal-onboard` skill. In short:

1. **Preconditions**: the SakalMaster MCP answers (`sakal_list_projects`), a
   project exists, this repo is linked as a codebase. Missing one → say which,
   point at the place in the app, stop. Never ask for a token in chat.
2. **Print the target** — project, app, host, project id — and get a yes.
3. **Decide the scope.** Does this repo own the project layer (`scope: project`,
   a spec-home or a single-repo project), or only its own stories
   (`scope: app`)? If `app`, read the server's project layer first and
   **reference its keys — never re-draft them**.
4. **Bootstrap check.** Multi-repo project, no spec-home designated, and the
   server's project layer is empty → say exactly that and stop:
   *"There is no project layer yet. Create the spec-home repo first and run
   /sakal-onboard there with scope: project; this repo references it."*
   Do not improvise a merged tree.
5. **Read the repo's reality** — spec set, then README/docs, then issues, then
   the code's shape. Chunk large repos; keep `_unread.md` honest.
6. **Write `.sakal/`** from `${CLAUDE_PLUGIN_ROOT}/templates/sakal/`. Every story
   and AC carries `source:`; anything you drafted without a document says
   `source: none (drafted)`. New project-layer entities discovered in an
   app-scoped repo go to `.sakal/proposals/` — never into the registry.

$ARGUMENTS may name a subset ("just GR-11") — prepare only that, and say so.

**End by naming the next step**, always:

> Prepared N stories in `.sakal/`. Nothing has been sent anywhere.
> Next: run **/sakal-verify** to check it.
