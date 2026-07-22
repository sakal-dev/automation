# Claude Code — SakalAutomation session 1: init and skeleton

Run in `/Users/admin/LIMSOCHEAT/Projects/SakalAutomation`. Send everything below the
line.

---

You are initialising **SakalAutomation** (GitHub: `sakal-dev/automation`) — the
central home for agent automation reused across every sakal-dev / Thalias project.

**Read `BRIEF.md` and `NOTES.md` in this folder first, completely.** They are the
design truth: the four-step contract, the repo layout, the seven execution methods,
the rules that must not regress, and the decisions already made with their reasons.
Where this prompt and those files disagree, the files win. Where the files are
silent, ask rather than invent.

This session builds the **skeleton and the specification** so the shape can be
reviewed — no working automation yet. The garage workflow extraction is the next
session, after the shape is agreed.

## STEP 1 — The contract (stop for review after this)

Write `docs/task-contract.md`: the SOURCE → BRIEF → EXECUTE → GATE contract from
BRIEF.md, expanded to be precise enough that someone could implement a new executor
from it alone. For each step: what it consumes, what it produces, both modes
(`github` | `sakalmaster`), and the invariants (gate before PR; merge opt-in; agents
never verify their own claims; claims filtered by app in integrated mode).

**Stop and show me this file before going further.** The contract is the design.

## STEP 2 — Repository skeleton

After approval:

1. `git init`, sensible `.gitignore`, MIT or no license yet (leave a `LICENSE.todo`
   note — open-core question, mine to decide).
2. Create the full directory layout from BRIEF.md. Every future component gets a
   **stub file that documents itself**: each workflow yml exists with its `name:`,
   its intended triggers/inputs as comments, and a header explaining what it will do
   and which method it serves — valid YAML, no implementation. Same for the
   composite actions (`action.yml` stubs), workers (`README.md` each), and the
   plugin (`marketplace.json` + skill folders with draft `SKILL.md` frontmatter:
   name, description with trigger phrases, body outline).
3. `docs/github-constraints.md` — port the six constraints from NOTES.md §5,
   written as reference, with room to grow.
4. `docs/methods/01…07.md` — one stub per execution method: what it is, how it will
   plug in here, status line (only 03 is live, on sakalpos-garage), and an empty
   "experiment log" section.
5. `README.md` — what this repo is, the contract in five lines, the layout, how a
   project will consume it (caller + two scripts + plugin), and a pointer to
   NOTES.md for background.
6. `CLAUDE.md` — orientation for future sessions here: BRIEF/NOTES are design truth,
   the contract file is the spec, the do-not-regress rules, and the vocabulary guard
   (methods ≠ workflow files).

## Rules

- Nothing in this session may contain a secret or a token.
- Stub workflows must be inert — no `on: push`/`schedule` triggers that could ever
  fire; `workflow_call` declarations only, or fully commented out.
- Do not copy implementation from sakalpos-garage yet — next session extracts it
  deliberately, with parity testing. Referencing its file names in comments is fine.

## Definition of done

- The contract doc is approved and committed.
- The full tree exists; every stub explains itself; a reader can understand the
  entire system from README → contract → stubs without any code existing.
- `git log` shows clean, small commits. Ready to push to `sakal-dev/automation`
  (I will create the GitHub repo and push, or tell you to).

Start with STEP 1 only.
