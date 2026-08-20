# sakalmaster plugin — changelog

Update note per release. **After any update: restart Claude Code** (plugin
commands only appear after a restart).

## 0.17.0 — the epic-doc DRAFTED exemption + the uncitable-AC convention (SPOS-270)

Proven during SPOS-268's Inventory drift pilot: `checkSource()` gives
`source: none (drafted — …)` a warning for stories, journeys, and
`epics.yaml` rows, but the epic-doc source check (`.sakal/epics/<KEY>.md`)
never got that branch — it called `resolvePinned()` unconditionally, so an
honestly drafted epic raised a hard SRCGONE error with no way to pass. Live
damage: 20 permanent errors on the Inventory tree, inherited by every
scaffold-drafted epic tree in the fleet.

- **The exemption:** an epic doc's `source:` matching `/^none\b/i` now warns
  DRAFTED, exactly as `checkSource()` does, instead of falling into
  `resolvePinned()`. A real-but-missing path is unaffected — it still
  SRCGONE-errors, unchanged.
- **New: `lib/sakal-verify.test.mjs`** pins both directions by spawning the
  CLI against throwaway fixture trees (verify runs as a script, not a
  library of functions, so this is the only honest way to test it): a
  drafted epic doc warns and does not fail verify; a dead-source epic doc
  still fails verify with exactly one SRCGONE.
- **CONVENTIONS.md** documents the uncitable-AC rule SPOS-268's workers
  improvised: a true-but-statistical AC cites the nearest in-module
  declaration with the verified figure in `note:`; cross-repo/submodule
  evidence cites with the sibling repo's own sha and resolves through the
  working-tree fallback, so `PINMISS` there is expected, not a defect.
- Live proof: re-running the patched lib read-only against the Inventory
  module's `.sakal/` tree turns its 20 SRCGONE errors into 20 DRAFTED
  warnings (0 errors); this repo's own `.sakal/` tree stays at 0 errors.

## 0.16.0 — local-only: SakalMaster discontinued, SUBMIT retired (SPOS-267)

Operator ruling, 2026-08-19: SakalMaster (`master.sakal.dev`) is discontinued.
The git-tracked `.sakal/` trees are the canon now — nothing in this plugin
links to, submits to, or pins against a server anymore. PREPARE and VERIFY
were already offline; this release removes the one phase that wasn't, and the
declaration fields and prose that existed only to serve it.

- **Retired `/sakal-submit` and its four submit-only libs**: `lib/sakal-plan.mjs`
  (drift/readiness against a server read-back), `lib/sakal-baseline.mjs` (the
  receipt + mutation gates), `lib/sakal-identity.mjs` (host/app identity
  resolution against a connected server), `lib/sakal-record.mjs` (epic-prose
  extraction for `create_epic`/`update_epic`). All four existed solely to feed
  the retired command; none had another caller. The golden suite's
  submit-plan/degradation-contract block (testing exactly these libs) is
  removed with them — the remaining 96 + 58 cases (prepare/verify rendering)
  are unaffected and green.
- **`config.yaml` no longer declares `target_host` / `target_project_id`.**
  `sakal-verify.mjs` no longer requires `target_host`; `project`/`app`/`scope`/
  `spec_family`/`app_profile` are unchanged — all four are read by local code
  paths (verify's REQUIRED/SCOPEAPP checks, prepare's family resolution and
  A4 profile gates) and stay.
- **`sakal-scope.mjs`'s `--apps` input is now sourced from the spec-home
  repo's `registry/codebases.yaml`**, not a server read-back — the onboarding
  commands' step 1 instructions were rewritten to match. Every "MAY read the
  server back as enrichment" clause in `sakal-onboard-project.md`,
  `sakal-onboard-app.md`, and `sakal-verify.md` is gone; these commands never
  had a server dependency to begin with, they just used to talk about one.
- **README, CONVENTIONS.md, SKILL.md rewritten** for two phases (PREPARE,
  VERIFY) instead of three — the "committed .sakal/, fixed by editing and
  re-submitting" story now reads "fixed by editing and re-verifying."
  CONVENTIONS.md's "Key renames and AC renumbers (SKA-033)" section (the
  receipt/mutation-gate mechanics) is removed with the libs it documented;
  the durable rule (keys are identity, rename with a decision record) is kept.
- **Dead code removed**: `CREATE_CONTRACT`/`requiredFields` in
  `sakal-shared.mjs`, orphaned by `sakal-plan.mjs`'s removal.
- **Known gap, left open deliberately**: under `scope: app`, a story's
  reference to a persona/epic/journey that does not exist in the spec-home
  repo was previously caught for certain at submit time (against the live
  server). There is no more submit-time check — verify still cannot resolve
  a cross-repo reference (the project layer lives in a different checkout),
  so a bad reference now surfaces only if someone reads the spec-home tree by
  hand. Not fixed in this release; flagged for whoever picks up the
  `.sakal/`-as-canon cleanup next.

## 0.15.0 — the receipt records the TRANSMISSION (SKA-036 · F-9/F-10)

F-9: `--ack stories/<KEY>` snapshotted the whole TREE record, so families
that never went over the wire (162 deferred owner cites, 57 garage) were
receipted as delivered — and the convergent pass, keying tree-vs-receipt,
would skip the evidence layer forever while the receipt insisted it landed.

- **Receipt schema 2:** `_sent` per record, per field-family. `--sent
  <family>` claims delivery, `--sent cites:<item>,<item>` claims PER ITEM
  (3 of 5 sent is three acked items, not a delivered family), `--held
  <family>=<reason>` records the hold as MACHINE-READABLE state. A family
  not named in the ack is held back by default. The log keeps the human
  sentence; the gate reads the receipt.
- **The gate treats held_back (and unverified, and unrecorded) as ABSENT:**
  those items are to-ADD; "identical" requires an acked value, full stop.
- **`--correct <family> --server <read-back>`** — the corrective as a tool,
  not a hand-edit: re-derives one family against server truth, names every
  denied claim, downgrades it to to-ADD, leaves other families byte-exact.
  Without a read-back it REFUSES ("a receipt corrected against silence is
  the F-9 defect with a new date").
- **One-way schema migration** with a header note: pre-F-9 receipts carry
  `unverified` — their transmission was never recorded, so nothing may be
  claimed for them.
- **F-10:** the planner now checks required-field PRESENCE against the
  create tool's CONTRACT (one shared table, overridable by a live schema in
  the read-back) — an absent field is falsy, fails no lookup, and used to
  sail into "ready" while the tool refused it. Absent-required now blocks,
  naming the field. `journey` (optional since ...007) and `story` (nullable
  by A2·S3) are deliberately not required.

## 0.14.0 — identity is read or refused, never defaulted (SKA-035 · F-3/F-4/F-5)

The named disease: an identity decision made without a read path,
defaulting to ACTION instead of REFUSAL. Host came from session state,
apps from create-on-miss, references from assumption. Each is now a read
or a refusal.

- **New: `lib/sakal-identity.mjs`.** **F-3 (host):** config `target_host`
  is the declaration and the truth — a connected server that differs
  REFUSES, naming both values and the split-brain risk; the only fix is
  editing the config. `FILL-AT-SUBMIT` + a connection is a SHOW-AND-ASK,
  never an inherit; `--adopt` records host/project/project_id on first
  success, enforced thereafter. **F-5 (apps):** two match axes — declared
  key and the tree's git origin vs `apps.github_repo` — before any create
  verdict; either hits → converge naming the axis; both hit different rows
  → CONFLICT refusal; the app linked to this repo under a different key →
  converge on the repo axis (the garage shell case) after asking; neither
  → SHOW-AND-ASK, creation is never silent. Keys are SURFACE NAMES.
  ORIGIN DRIFT (config app linked elsewhere) refuses: a moved remote and a
  wrong declaration are indistinguishable from here, so the operator
  decides. Non-interactive sessions refuse with the command to run.
- **F-4 consumption:** the planner blocks a story only on sets the caller
  actually READ (`list_registry` · `list_journeys` · `list_epics`) and
  names the unread ones — an unread set is not an empty server, and the
  false "not in SakalMaster yet" refusals end. `apps` accepts
  `{key, github_repo}` rows.
- **Orphan report** gains repo-name **app shells**, pointing at the in-app
  delete (move the repo link and Agent profile off the shell first, or it
  rightly refuses). Deletion stays a human act.

## 0.13.0 — the permanent mutation design (SKA-034 · D02-R2)

- **P-M3, permanent, as amended:** on a CONFIRMED AC-set change, content
  matching converges what is provably the same — EXACT text match maps the
  row silently (uuid kept, letter recomputed as a display address); the
  rest REFUSES with ranked suggestions only ("tree -b resembles receipt
  row -c at 87%") — thresholds rank, never decide; the operator confirms
  each with `--map treeId=row` (or `=new`), the confirmed mapping lands in
  the COMMITTED receipt, unmatched tree ACs become new rows, unmatched
  receipt rows are flagged orphan-ACs. Never re-texted silently, never
  deleted.
- **P-M6(i):** any text change on an evidenced row is surfaced in the
  confirm diff (old→new + citation count), set-shift or not; the SKM-040
  degradation is stated (verifier state does not auto-reset on older
  servers — run the sweep). Unevidenced stable-id edits stay frictionless.
- **One refusal at a time:** a three-way (server-moved) refusal DEFERS AC
  mapping explicitly — no double-refusal confusion.
- **Per-write acked receipts:** `--write --ack kind/key` lands exactly the
  acked records; "Sent N" may only equal acked-N; a bogus ack refuses;
  partial failures leave un-acked records visibly stale.
- **`.sakal/submit-log.md`** — append-only, human-readable, terse (one
  line per write family + mappings/held-backs/refusals via `--note`/
  `--log`), deterministic given `--ts`. Nothing submit-produced lives
  outside `.sakal/` (operator ruling, binding).

## 0.12.0 — the mutation contract (SKA-033 · D02-R1)

Submit stops trusting re-runs to be safe and starts proving it.

- **New: `lib/sakal-baseline.mjs`** — `.sakal/.baseline.json`, the COMMITTED
  receipt of last-submitted values (committed deliberately: the tree is
  committed by design and the receipt must travel with the branch, or two
  machines disagree about one server). Byte-deterministic serialization.
- **P-M3 — the AC-set gate:** count/order/letters differ from the receipt →
  REFUSE with the renumber diff (letters are addresses; rows keep their
  uuid — a shifted re-submit silently re-texts rows whose evidence still
  attests the old claim). `--confirm-ac-changes` is the operator's explicit
  pass-through; text-only edits under stable ids flow freely.
- **P-M4 — cite convergence,** keyed (ac, path, symbol, kind): add missing,
  SKIP identical (a pre-SKM-039 server duplicates re-adds — never re-send
  what the receipt shows landed), FLAG vanished, never delete.
- **P-M5 — three-way:** server ≠ receipt on a field → REFUSE naming the
  field and both values; degrades to two-way (stated) until the SKM-038
  read-back supplies server values.
- **P-M1 — the orphan report** at every submit: "server has X; tree does
  not" per entity kind (stories by app namespace, epics/journeys by
  project); deletion stays a human act. Plan output + `--json` gain it.
- **P-M2 —** a key rename/split requires an operator decision record BEFORE
  re-submit (CONVENTIONS.md); the orphan report is the tripwire.
- First submit: no receipt, nothing refuses. Corrupt receipt: stated, with
  `--rebaseline` showing the full new receipt before writing.

## 0.11.0 — epic prose reaches the server (SKA-032 · R-6)

Production's first epics landed THIN because no cut ever mapped the epic
prose at submit — journeys and sources were mapped, the epic fell between.

- **New: `lib/sakal-record.mjs`** — extracts the four SKM-035 epic fields by
  code: `tier`, `consumes_raw` (VERBATIM, `**` markers included), the
  "What to build" body → `narrative`, "Test strategy" (decorated and
  "Testing strategy" variants) / "How this epic proves itself" →
  `test_strategy`. Record mode for `epics/<KEY>.md`; `--source` mode for a
  raw spec doc (project-scope index entries resolve their source at its pin
  and extract from that). ONE shared sectionByAnchor underneath. Missing
  pieces are `gaps` — data to report, never invent; a different section
  ("Why this exists") is never mapped as if it were the asked-for one.
- **Submit step 10** maps the four fields onto `create_epic`/`update_epic`
  (re-submits CONVERGE in place), with the same per-field held-back
  discipline as everything else.
- **The plan counts the epic-prose writes** (`epic_narratives`,
  `epic_test_strategies`) in text and `--json`.
- Extraction verified against the three thin production epics' actual
  source docs: BE-01/FP-01 gain consumes_raw + test_strategy (their docs
  carry no What-to-build — honest gap); OA-01's catalog-README source
  yields all-gap — its full prose converges from owner-flutter's app-scope
  epic record instead.

## 0.10.1 — R-5 closed (SKA-031)

No emit path for `proposals/consumes-raw.yaml` existed after 0.8.0 — the
validator's observable was the stale 0.7.0-era file committed in the garage
tree, which prepare reports as superseded but never deletes. The file is now
removed from that tree by hand (as ruled), and the golden suite asserts no
family's output contains a `proposals/` path or a consumes-raw file, so a
remnant can never come back silently.

## 0.10.0 — submit catches up with the server (SKA-029)

The plugin now calls what SKM-035 shipped, and names what it still cannot.

- **App profile → `sakal_update_app_profile`** (the owner/admin tool that
  exists as of SKM-035); `sakal_update_app` edits only label/colour and is
  no longer the profile's home. Tool absent → *"profile held back; server
  predates SKM-035"*, everything else submits.
- **`source:` URIs → `p_source`** on story/epic writes, ready ahead of
  SKM-036: until it deploys, *"source held back; server predates SKM-036"*.
- **Partial landing is the documented norm:** every mapping (narrative,
  profile, consumes_raw, source) degrades INDEPENDENTLY and every held-back
  line names WHICH field and WHICH migration — never all-or-nothing, never
  a failed submit over a column the server lacks; re-submit converges.
- **The submit plan names the new writes:** `sakal-plan.mjs` reports journey
  narratives, epic consumes_raw, the app profile, and source-URI counts with
  the migration each needs — in text and `--json` (`writes`).
- Suite: an e2e run of the plan CLI over a synthetic tree asserts the writes
  summary; the three degradation messages are doc-contract-tested verbatim.

Reminder that bites here: **an MCP rebuild is invisible to a running session
— restart Claude Code** before expecting the 035 tools to be callable.

## 0.9.0 — journeys as a walked tree (SKA-028 · A5 ruling B)

The journey narratives join the fidelity-gated working copy — one file per
journey, same gate shape as epic docs, no new semantics invented.

- **Prepare (project scope)** emits `.sakal/journeys/<KEY>.md` from
  journeys.yaml (the index) + each entry's source document: frontmatter
  (key, title, goal, persona, source) + the VERBATIM `## Journey …` section
  (steps, per-step epic pointers — never rewritten to URIs — Success
  statements, tiering notes in the heading). Pinned when the tree is
  git-versioned; resolvable-but-unpinnable otherwise, stated in the report.
  Works from a subdirectory spec-home inside a parent repo (`sha:./path`).
- **Verify walks `journeys/`** exactly as it walks epic docs: frontmatter +
  goal/persona refs, body fidelity BOTH directions at the pin, imported-text
  exemption. Index entry without a record → `JMISSING` warning (legitimate
  mid-authoring); record without an index entry → `JORPHAN` error (submit
  iterates the index — it would silently skip the record). An app-scoped
  tree defining `journeys/` is a `PROJECTDEF` error.
- **Submit** maps the record body → the journey narrative param
  (`p_narrative`), degrading gracefully while the server predates SKM-035
  ("narrative held back; server predates SKM-035") — the app_profile
  pattern verbatim. `journeys/` is selectable.
- D-05 convergence proven: the 7 owner journeys emit byte-exact against the
  spec-home import at `sakal-dev/sakalpos@9cf7c6f`, verify green, two runs
  byte-identical.

## 0.8.0 — PART 0 amendments + promote consumers (SKA-027 · A3/A4 rulings)

The A4 profile gates and the A3.1 reversal that SKA-026 shipped without.

- **A3.1 — `consumes_raw:` lives in FRONTMATTER** (epic and, for per-story
  `Implements:` lines, story) — key AND value verbatim, per family. After R1
  deletes the spec files this is the traceability's ONLY home.
  `proposals/consumes-raw.yaml` is dropped (an existing one is reported as
  superseded — delete by hand; prepare never deletes). Verify's fidelity
  gate now DEMANDS the line where the spec carries it — pre-A3.1 trees go
  red on their epic docs until the (already-sequenced) prepare re-run.
  Journey-index guidance (integers index the journeys doc; mint IDs at
  promote, never letters) moved to the prepare report — one copy.
- **B2 — `conventions_files`:** `@`-includes expanded at emission (a newborn
  does not process CLAUDE.md includes — docs/RULES.md surfaces explicitly);
  every file must exist AT THE PIN and match the working tree; any path
  under the doomed spec directory refuses.
- **B3 — the denylist DERIVES verbatim from the RULES denylist section**
  (every backticked glob, in order); a diverging profile input refuses with
  the diff. The garage re-run immediately caught what the hand-written
  0.7.0 denylist understated (the Gradle/wrapper globs).
- **AC-less story ruling:** in an imported (source-pinned) tree, NOACS is a
  WARNING — honest state, never agent-ready, "define ACs first". A
  hand-authored tree keeps the error. Stated in CONVENTIONS.md.
- **Owner golden pair is INTERIM** (machinery-generated at owner @4b8f9bb,
  post-D-03, with consumes_raw): the validator's revised A1 fixtures replace
  it on arrival, moving the byte-regression target exactly once (A3.4).
- Story-key convention check accepts the `FP-05B-01` letter shape.

## 0.7.0 — all four spec-format families (SKA-026 · D-01 survey)

`/sakal-onboard-app` now extracts every surveyed spec set — ONE parser,
per-family parameters, never four parsers. 0.6.0's S1 loud-fail remains the
backstop; this release adds the capability half.

- **Families:** `reference` (owner, kiosk, stock, kds) · `greenfield`
  (driver, agent — no story triple; `Journey(s):` integer indices captured
  verbatim, resolved by index at promote time, never lettered) · `asbuilt`
  (storefront, garage — checkbox-as-evidence markers incl. `[~]`/`[🟡]`/
  `✅`-suffixes, wrapped 2–5-line headers, single-line triples, AC text
  continuations) · `legacyflat` (flutter-pos — epic key from the
  `Story prefix:` header, `05b`→`FP-05B`, collapsed `AC-1–AC-5` ranges and
  italic label tags carried raw as `range:`/`tag:`, unlabeled checkbox ACs,
  split/absent trailers reported as gaps).
- **Detection with refusal, never a guess:** `--family` > config
  `spec_family:` > unanimous header signal > reference. A header signal
  contradicting the declaration refuses naming both candidates; the resolved
  family is declared into config.yaml so verify's fidelity gate parses with
  identical parameters.
- **The pin must be truthful:** prepare refuses when any spec file differs
  from HEAD (uncommitted edits would make every `@sha` source line a lie).
- **`--seed`** supplies journey/persona/module for a fresh tree (model
  judgment, per story); an existing story file always wins.
- **S-rules unweakened across families:** raw markers (never interpreted,
  never citations), no fabricated triples (voiceless stories warn, naming
  the human work), verbatim consumes capture (now incl. story-level
  `Implements:` lines), status voices quoted — plus the fifth voice, in-text
  AC status emoji, with checkbox-vs-text contradictions named.
- **Golden suite at the D-01 named minimum:** snapshots of stock, agent,
  storefront, garage, flutter-pos (owner kept; kiosk/kds covered by
  construction), machinery-generated human-reviewed expected outputs,
  wrong-family forcing refusals, per-family determinism, README/table
  non-derivation asserted. 84 golden + 51 shared tests.
- Tier/Priority are emitted only where the spec carries them, VERBATIM with
  qualifiers (`P0/P1`, `MVP (car care + garage)`, multi-sentence Priority);
  story tags take the leading `P<d>` token; epic-doc STATUSMARK narrowed to
  status FIELD lines so imported as-built prose can be verbatim.
- Live-run proof: garage-flutter extracted to a verified-green tree (13
  epics, 48 stories, 0 errors; 46 grep-confirmed cite'd ACs, 143 honest
  gaps with reasons; two runs byte-identical across 64 files).

## 0.6.0 — the plugin owns the emission (SKA-025 · Addenda A1 + A2)

The app-layer re-extract is now **code**, not chat-agent hand-work
(operator ruling R3: "if you do it by hand, who does repo #2?").

- **New: `lib/sakal-prepare.mjs`** — deterministic emitter. Pins HEAD (one pin
  per run), emits `epics/<KEY>.md` (verbatim spec sections, never the `Status:`
  header or its markers) and re-extracted story files (fenced-yaml ACs with
  VERBATIM text, Q6 cite blocks). Byte-identical across runs on the same
  checkout; reproduces both Addendum A1 acceptance fixtures byte-for-byte.
- **S1 loud-fail invariant (A2, the core):** AC-like lines are counted per spec
  file (any checkbox variant, any `AC-n` label, any list item under an
  AC heading); parsed < detected ⇒ refusal with file:line, nothing emitted.
  Zero-AC extraction from an AC-bearing file is impossible by construction; a
  non-owner spec family refuses loudly instead of extracting wrongly
  (other families land in SKA-026).
- **S2:** checkbox markers captured RAW (`marker:` field, non-default only),
  never interpreted, never auto-promoted to a citation.
- **S3:** a spec family without the As/I-want/So-that triple gets an EMPTY
  story field + a report line — prepare never fabricates a voice.
- **S4:** `Consumes:`/`Implements:`/`Journey(s):` header lines captured
  verbatim into `proposals/consumes-raw.yaml` (promote-time material, never
  submitted).
- **S5:** every status voice (header / trailers / marker distribution) quoted
  into a managed `findings.md` block; contradictions named, nothing chosen.
- **Cite honesty in code:** every cite (given or carried forward) is
  re-grepped at the pin in the same run — declaration for `enforced`, exact
  innermost test label for `verified` (never `group`); unconfirmed cites are
  dropped WITH a report line. Uncited ACs are listed with reasons.
- **Verify: P4 fidelity gate.** AC text, raw markers and epic sections are
  compared verbatim (normalised whitespace only) against the spec **at the
  pinned sha through `git show`** — identical before and after `docs/specs/`
  is deleted (R1). Cites are re-confirmed (`CITEGONE`). Imported AC text is
  exempt from the house voice lints — fidelity wins for imports; conventions
  govern what prepare authors (see CONVENTIONS.md).
- **`app_profile:` block in config.yaml** (setup_cmd, verify_cmd, denylist,
  evidence_format, conventions_files); submit maps it onto the SKM-034 apps
  columns via `sakal_update_app` and degrades gracefully ("profile held back;
  server predates SKM-034") when those columns don't exist yet.
- **Golden suite scaffold** (`test/golden/`): inputs are SNAPSHOTS of real
  spec files (owner @1e272bc; one garage file for the S1 refusal case),
  expected outputs authored in the suite — structure ready for the D-01 set.
- `epics/` is selectable in `/sakal-submit`; `epics.yaml` remains the
  project-layer file and stays forbidden in app-scoped trees.

## 0.5.1 — SKA-024

Prepare's output passes prepare's own linter: one slugger, one comment-aware
config reader, shared in `lib/sakal-shared.mjs`.

## 0.5.0 — SKA-023

Prepare and verify go fully offline; submit owns every server call.
