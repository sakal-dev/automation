---
description: PREPARE the APP layer (stories, ACs, tasks, bugs) for this codebase, referencing the project layer in the spec-home repo's own .sakal/ tree.
---

## This phase is OFFLINE

It reads the repo and writes files. There is no server involved at any point —
never prompt for a connection, never retry, never fail waiting on one. Target
identity (`project:`, `app:`) is a DECLARATION written into `.sakal/config.yaml`
from the repo and what the user tells you.

## Then

Prepare this repo's **app layer** as `scope: app`. **Nothing leaves this
machine.** The emission itself is CODE (`lib/sakal-prepare.mjs`) so two
runs are byte-identical; your work is the parts that need judgment: citations
and the app profile.

1. **Validate the declaration before writing anything.** Read the project's
   linked codebases from `registry/codebases.yaml` in the spec-home repo
   (e.g. `sakalpos/.sakal/registry/codebases.yaml`) into a temp file, then:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-scope.mjs --declared app --apps <tmp>`
   - exit 1 → print the refusal as-is and stop. The usual cause is that this
     repo is not a linked codebase yet; the refusal says where to link it.
   - exit 2 → the spec-home repo (or its registry file) was not found. Say so
     and write the declaration anyway — a human can fix a wrong declaration
     later, verify will flag a mismatch against the registry.
2. Print the DECLARED target: project, app. Say it is a declaration.
3. **Citation duty (the judgment part).** For each AC in the spec set, search
   the checkout for honest evidence and write a cites JSON
   (`{"<story-key>": {"<letter>": {"cite": [...], "reason": "..."}}}`):
   - `enforced` = an exact-name DECLARATION in product code that enforces the
     claim. `verified` = the exact innermost `test('…')` / `testWidgets('…')`
     label — never a `group`. Both use the Q6 shape (kind/path/symbol[/note]).
   - A checked spec checkbox is a **search hint only** — it never becomes a
     citation by itself (S2).
   - **No honest cite → `"cite": []` with a reason.** An honest gap beats a
     false claim; the emitter re-greps every cite at the pin and DROPS what
     does not confirm, so guessing only produces report noise.
4. **App profile.** Write a profile JSON (`setup_cmd`, `verify_cmd`,
   `denylist`, `evidence_format`, `conventions_files`) from the repo's own
   tooling (`tool/*.sh`, CLAUDE.md). It lands in `config.yaml` as the
   `app_profile:` block — local documentation of how to build/verify this repo.
5. **Run the emitter** — it owns every byte that lands in `.sakal/`:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/sakal-prepare.mjs --cites <cites.json> --profile <profile.json> [--seed <seed.json>] [--family <name>]`
   - It pins HEAD (one pin per run) and REFUSES if any spec file differs from
     the pin — commit spec edits first; the pin must be truthful.
   - **Spec-format family** (D-01): `reference` · `greenfield` · `asbuilt` ·
     `legacyflat` — one parser, per-family parameters. Resolution: `--family`
     > config `spec_family:` > unanimous header signal > reference; the
     resolved family is declared back into config.yaml so verify's fidelity
     gate parses identically. A header signal contradicting the declaration
     is a refusal naming both — never a guess.
   - `--seed` supplies journey/persona/module for a FRESH tree (model
     judgment, per story key); an existing story file always wins over it.
   - It emits `epics/<KEY>.md` (verbatim spec sections, no status-field
     lines; the consumes-slot line — `Consumes:`/`Implements:`/`Journey(s):` —
     rides the frontmatter as `consumes_raw:`, verbatim, the one copy that
     survives R1 deletion; integer journey indices resolve by index at
     promote time), `stories/<EPIC>/<KEY>.md` (fenced-yaml ACs, VERBATIM
     text, raw non-default `marker:`/`range:`/`tag:` fields, story-level
     `consumes_raw:`), and the findings.md status-voices block (every voice
     quoted, contradictions named, nothing chosen).
   - Profile gates (A4): `conventions_files` are `@`-include-expanded and
     must exist at the pin, never under the doomed spec dir; the `denylist`
     DERIVES verbatim from the RULES denylist section — a diverging profile
     input refuses with the diff.
   - **Exit 2 with "S1 loud-fail" → STOP and show the refusal verbatim.** The
     declared family does not parse some AC-like lines; extracting past them
     would silently drop ACs. Fix the declaration or the spec — never
     hand-extract around the refusal.
   - Show the prepare report as-is: uncited ACs with reasons, dropped cites,
     new/orphan/voiceless stories, uncarried story-body lines,
     unresolvable-imported references.
6. **Reference the project layer by key — never re-draft it.** New
   project-layer needs go to `.sakal/proposals/` with a note — acknowledged by
   verify, carried to the spec-home repo by a human.

**End by naming the next step:**

> Prepared N stories.
> Next: **/sakal-verify**.
