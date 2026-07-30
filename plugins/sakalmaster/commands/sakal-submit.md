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
1a. **Resolve IDENTITY before anything else** (SKA-035) — host and app are
   READ or REFUSED, never inherited from session state:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-identity.mjs --server <tmp> [--adopt]`
   Include the connected `host` (and `project_id`) in the read-back you
   write to `<tmp>`, plus `apps` as `{key, github_repo}` rows from
   `sakal_list_registry` — the resolver needs both axes.
   - Exit 1 → print it VERBATIM and STOP. It refuses a host mismatch (the
     declaration is the truth; a mismatch would SPLIT THE BRAIN), a
     project mismatch, an app-identity CONFLICT (key→row A, repo→row B),
     and ORIGIN DRIFT (a moved remote and a wrong declaration look
     identical from here — the operator decides, origin never wins by
     default).
   - `FILL-AT-SUBMIT` + a connected server is a SHOW-AND-ASK, never an
     inherit: confirm with the operator, then `--adopt` records host,
     project and project_id into config.yaml — written once, enforced
     after.
   - **No app matches either axis → SHOW-AND-ASK, never silent creation.**
     App keys are SURFACE NAMES (`garage-flutter`), not repo names.
     Matched by the repo axis under a different key → converge onto that
     row and say which axis matched.
   - Non-interactive session → refuse and hand over the exact command to
     run interactively; never guess an identity to keep moving.
1b. **Read SakalMaster back and check the declaration**, which prepare only
   claimed: write the read-back to a temp file and run
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-plan.mjs --server <tmp> [--scope <sel>]`.
   It refuses with a `config.yaml` message if the declared project or app does
   not resolve — **before any write**. Supply every set you can read
   (`sakal_list_registry` · `sakal_list_journeys` · `sakal_list_epics`): a
   set you did NOT read is not an empty server, and the planner only blocks
   a story on sets actually supplied (F-4). It says which sets were unread.
1c. **Run the mutation gates** (SKA-033) — refusals are code, not care:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-baseline.mjs --check [--server <tmp>]`
   - Exit 1 → show the refusal VERBATIM and stop. The gates, ONE refusal at
     a time: the server moved since the last submit (in-app edits —
     reconcile by hand; AC mapping is DEFERRED until resolved) · the AC set
     changed (letters are ADDRESSES, rows keep their uuid) · re-texting
     under evidence (P-M6 — the row carries citations that attest the OLD
     wording).
   - A DELIBERATE set change: `--confirm-ac-changes` runs CONTENT MATCHING —
     exact text converges silently (the row keeps its uuid, the letter
     recomputes as a display address); unmatched tree ACs become new rows;
     unmatched receipt rows are flagged orphan-ACs, never deleted.
     Ambiguity refuses with ranked SUGGESTIONS only — a score never moves
     data; the operator confirms each with `--map <treeId>=<receiptRow>`
     (or `=new`), and the confirmed mapping lands in the committed receipt
     at ack time.
   - Execute the printed convergence plan literally: `update_ac_text` for
     mapped rows with changed text, `sakal_create_ac` for new rows,
     `sakal_reorder_acs` to recompute display addresses. Re-texting an
     evidenced row: SKM-040 resets its verification server-side; against a
     server predating SKM-040, SAY SO and run the verify sweep after — the
     state does not auto-reset.
   - Text-only AC edits under stable ids with no evidence flow freely
     (`update_ac_text`, scenario A).
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

11. **Ack every write into the receipt AS IT LANDS** — "Sent N" may only
   ever equal acked-N:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-baseline.mjs --write --ack stories/<KEY> [--ack …] [--map <treeId>=<row>]… [--note "held-back: …"]`
   A partial failure leaves exactly the un-acked records out of the receipt
   and the summary must name which landed and which did not. The receipt
   (`.sakal/.baseline.json`) and the log (`.sakal/submit-log.md`,
   append-only, one line per write family + held-backs/refusals/mappings)
   are both COMMITTED, both inside `.sakal/` — nothing submit-produced
   lives anywhere else (operator ruling, binding). Record refusals with
   `--log "refusal: …"`. First-ever submit: full `--write` after the run.
12. **The orphan report is not optional reading** (P-M1): "server has X;
   tree does not" lines mean a claimable ghost exists. A key rename or
   story split requires an operator DECISION RECORD (decisions.md) BEFORE
   the re-submit — never infer one from an orphan pair (P-M2); deletion of
   the orphan stays a human act with owner authority.

**End by naming the next step**, always:

> Sent N. Blocked M (reason). *Next: submit `<the thing that unblocks them>`,*
> or *run **/sakal-verify** to re-check.*
