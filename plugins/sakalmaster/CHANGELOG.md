# sakalmaster plugin — changelog

Update note per release. **After any update: restart Claude Code** (plugin
commands, MCP registration and the tool registry only appear after a restart).

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
