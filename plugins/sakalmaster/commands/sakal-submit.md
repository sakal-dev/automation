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

0. **This is the only phase that needs the server.** No MCP tools → refuse in
   plain words: *"Submit needs a connection to SakalMaster and there is none.
   Connect the MCP (and restart Claude Code), then re-run. Your `.sakal/` files
   are unaffected — nothing was sent."* Never a stack trace, never a silent skip.
1. **Re-verify the scope first.** A green from ten minutes ago is not a green —
   files change. Run the same verifier `/sakal-verify` runs, locally:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-verify.mjs --json [--scope <sel>]`
   Any error in scope → refuse, show the first three, stop.
1b. **Read SakalMaster back and check the declaration**, which prepare only
   claimed: write the read-back to a temp file and run
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-plan.mjs --server <tmp> [--scope <sel>]`.
   It refuses with a `config.yaml` message if the declared project or app does
   not resolve — **before any write**.
1c. **Run the mutation gates** (SKA-033) — refusals are code, not care:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-baseline.mjs --check [--server <tmp>]`
   - Exit 1 → show the refusal VERBATIM and stop. Two gates refuse: the
     server moved since the last submit (in-app edits — reconcile by hand),
     or the AC set changed (count/order/letters). Letters are ADDRESSES and
     rows keep their uuid — a shifted re-submit silently re-texts rows whose
     citations and bugs still attest the old claim. A DELIBERATE renumber:
     the operator re-runs with `--confirm-ac-changes` (their call, recorded).
   - Text-only AC edits under stable ids flow freely (`update_ac_text`).
   - Cite convergence is keyed (ac, path, symbol, kind): **ADD** the
     missing, **SKIP** the identical (a pre-SKM-039 server would duplicate a
     re-add — never re-send what the baseline shows landed), **FLAG** the
     vanished and never delete (deleting evidence is a human act;
     `CITEGONE` at verify already speaks).
   - First-ever submit: no baseline, nothing refuses. Corrupt baseline:
     the CLI says so; `--rebaseline` shows the FULL new receipt before
     writing it.
2. **Print the target** — project, app, host — before the first write.
3. **Report readiness in plain words**, from the planner's output:
   - ready: everything it references already exists in SakalMaster
   - blocked: say what is missing and what to send first, e.g.
     *"GR-03-02 references epic GR-03, not in SakalMaster yet — submit
     epics.yaml first"*
4. **Write only the selection.** Keys are identity (`spec:<app>:<KEY>`); create
   what is missing, never duplicate, never delete. ACs are born open; tasks land
   **not** agent-ready. An AC-less story (imported honest state) submits as a
   story and is never agent-ready — its ACs must be defined first.
5. **Never submit `proposals/`.** They are carried to the spec-home by a human,
   deliberately. (Consumes/Journeys traceability lives in `consumes_raw:`
   frontmatter since A3.1 — mapping it to real keys is promote-time work,
   a human'"'"'s call.)
6. **Always report whole-tree drift**, even for a scoped submit.
7. **Journey records → `p_narrative`.** A `journeys/<KEY>.md` body maps onto
   `sakal_create_journey`/`sakal_update_journey`'"'"'s `narrative` param — and
   **degrades gracefully while the server predates SKM-035**: the param
   refused or absent means print exactly *"narrative held back; server
   predates SKM-035"* and submit the journey'"'"'s index fields anyway.
8. **App profile → `sakal_update_app_profile`** (owner/admin-only tool,
   exists as of SKM-035; `sakal_update_app` edits only label/colour and is
   NOT the profile'"'"'s home). Map the `app_profile:` block'"'"'s `setup_cmd`,
   `verify_cmd`, `denylist`, `evidence_format`, `conventions_files`
   (comma-separated fields become arrays). **When the tool is not present,
   the server predates SKM-035**: print exactly *"profile held back; server
   predates SKM-035"* and submit everything else.
9. **`source:` URIs → `p_source`.** Story and epic frontmatter `source:`
   values map onto the create/update params **once SKM-036 lands**; until
   then the refusal means print exactly *"source held back; server predates
   SKM-036"* and submit the record without it.
10. **Epic prose → `create_epic`/`update_epic`** (the R-6 gap: production'"'"'s
   first epics landed THIN because nothing sent these; the server has taken
   all four since SKM-035). Extract by code, never by reading carefully:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-record.mjs <file> [--source] --json`
   - **App-scope epic record** (`epics/<KEY>.md`): run it on the record —
     `tier` → `p_tier` · `consumes_raw` → `p_consumes_raw` (VERBATIM,
     `**` markers included) · the "What to build" body → `p_narrative` ·
     "Test strategy" / "How this epic proves itself" → `p_test_strategy`.
   - **Project-scope index entry** (epics.yaml, no record): resolve the
     entry'"'"'s `source:` doc AT ITS PIN (`git show <pin>:./<path> > tmp`)
     and run the CLI with `--source` on it; the index'"'"'s `outcome:` still
     maps to `p_outcome`.
   - The CLI'"'"'s `gaps` are sent as-is missing and REPORTED, never invented
     (section-less flutter-pos variants, catalog-README sources). Re-submits
     CONVERGE: `update_epic` in place, never a duplicate.

**Partial landing is normal (e.g. 035 deployed, 036 not): each mapping above
degrades INDEPENDENTLY, never all-or-nothing — and every held-back line names
WHICH field was held and WHICH migration the server predates.** Never fail a
submit over a mapping the server cannot take yet; the files keep the truth
and a re-submit converges after the migration deploys.

**Selectors are resolved by code, not by reading this carefully.** Always run:

`node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-select.mjs [--json] [$ARGUMENTS]`

- exit 1 → print its refusal verbatim (it already lists what IS selectable) and
  stop. It refuses typos, empty selections, paths outside `.sakal/`, and
  `proposals/`.
- no selector → its listing IS the show-and-ask.
- `--all` with any verify error anywhere → **hard refuse**, name the first three.
- Old shape `/sakal-onboard submit …` → one line: *"Submitting moved to
  **/sakal-submit**. Try `/sakal-submit <selector>`."* Not an error dump.

11. **After a green submit, write the receipt:**
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-baseline.mjs --write`
   `.sakal/.baseline.json` is COMMITTED — the team'"'"'s shared record of what
   was last submitted; the next submit'"'"'s three-way gate compares
   server/baseline/tree against it.
12. **The orphan report is not optional reading** (P-M1): "server has X;
   tree does not" lines mean a claimable ghost exists. A key rename or
   story split requires an operator DECISION RECORD (decisions.md) BEFORE
   the re-submit — never infer one from an orphan pair (P-M2); deletion of
   the orphan stays a human act with owner authority.

**End by naming the next step**, always:

> Sent N. Blocked M (reason). *Next: submit `<the thing that unblocks them>`,*
> or *run **/sakal-verify** to re-check.*
