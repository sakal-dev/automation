---
description: PREPARE the APP layer (stories, ACs, tasks, bugs) for this codebase, referencing the project layer on the server.
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

Prepare this repo'"'"'s **app layer** — `stories/<EPIC>/<KEY>.md`, plus
`tasks/` and `bugs/` when the repo has issues — as `scope: app`.
**Nothing is sent to SakalMaster.**

1. **Validate the declaration before writing anything.** Read the project'"'"'s
   codebases from the server into a temp file, then:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-scope.mjs --declared app --apps <tmp>`
   - exit 1 → print the refusal as-is and stop. The usual cause is that this
     repo is not a linked codebase yet; the refusal says where to link it.
   - exit 2 → the codebase list was not supplied (offline). Say so, write the
     declaration anyway, and note that submit will check it.
2. Print the DECLARED target: project, app, host. Say it is a declaration.
3. **Reference the project layer by key — never re-draft it.** Offline you
   cannot resolve those keys; that is fine, submit resolves them. Never
   re-draft a persona, goal, module, journey or epic here — verify treats a
   project-layer definition in an app tree as an error.
4. Draft stories with provenance. A story needing a project-layer entity that
   does not exist goes to `.sakal/proposals/` with a note — acknowledged by
   verify, never submitted, carried to the spec-home by a human.

**End by naming the next step:**

> Prepared N stories. Nothing sent.
> Next: **/sakal-verify**, then **/sakal-submit** to see what is ready.
