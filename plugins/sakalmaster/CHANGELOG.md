# sakalmaster plugin — changelog

Update note per release. **After any update: restart Claude Code** (plugin
commands, MCP registration and the tool registry only appear after a restart).

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
