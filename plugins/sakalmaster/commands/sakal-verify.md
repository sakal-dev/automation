---
description: The hard gate — lint .sakal/ and report problems in file:line words. Whole tree or a scope.
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

Run the gate over `.sakal/`. **This is the same verifier `/sakal-submit` runs —
there is exactly one implementation of these checks**, at
`${CLAUDE_PLUGIN_ROOT}/lib/sakal-verify.mjs`.

1. Run the gate. It is strictly local — it never contacts SakalMaster:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-verify.mjs [--scope <sel>]`
2. Show the output as it is. Do not summarise away a `file:line`; that is the
   part the user acts on.

For re-extracted trees (sha-pinned sources) the gate includes **P4 fidelity**:
every AC text, raw marker, and epic section is compared VERBATIM (normalised
whitespace only) against the spec **at the pinned sha, through `git show`** —
not the working tree — so the gate is identical before and after the spec files
are deleted, and every cite is re-grepped at the pin. Still offline: git
objects are local. A FIDELITY or CITEGONE error means re-run prepare, never
hand-"improve" imported text to satisfy a lint.

$ARGUMENTS is an optional scope — `stories/GR-03/`, `journeys.yaml`, one file.
A selector that matches nothing → say so and list what IS selectable (the
top-level entries of `.sakal/`). Drift belongs to submit — verify lints files and says nothing about the server.

**End by naming the next step**, always:

> Green → *Next: **/sakal-submit** to see what is ready to send.*
> Errors → *Fix the files above and run **/sakal-verify** again. Nothing has
> been sent anywhere.*
