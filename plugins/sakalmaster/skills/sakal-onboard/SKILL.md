---
name: sakal-onboard
description: Build a committed `.sakal/` directory for a project, fully local — PREPARE reads the repo and drafts structured files with provenance, VERIFY lints them until green. Re-runs converge; corrections are file edits. Use when the user says "onboard this repo", "/sakal-onboard", "prepare the sakal directory", "verify my .sakal", or after specs change and the tracker needs to catch up.
---

# sakal-onboard

Two phases over one committed directory, both fully local:

```
PREPARE  read the repo → write .sakal/     (nothing leaves the machine)
VERIFY   lint .sakal/ → file:line problems (nothing leaves the machine)
```

**Why files and not a conversation.** Once data is drafted it should be cheap
to correct and easy to review. `.sakal/` is readable, diffable, editable, and
checkable by a linter that says `file:line`. A chat transcript is none of
those things.

`.sakal/` is **committed to the repo** by design. It is the project's
spec-as-code seed and the working copy for every future correction — when
something in it is wrong, you fix the file and re-verify.

## The rules

1. **No status anywhere in `.sakal/`.** Files carry inputs. Status is derived
   from citations and bugs, never imported. A `status:` field is a verify
   **error**, not a warning — a spec's `[x]` is a claim, not a fact.
2. **No sync-state file.** Both phases are strictly local, so nothing on disk
   can go stale, and drafting quality is never coupled to connectivity — you
   can prepare and verify a dozen repos on a plane.
3. **Templates live in this plugin.** The customer's directory contains only
   their truth — never a leftover placeholder.

## The tree

```
.sakal/
  config.yaml                 scope, project, app
  registry/personas.yaml      who it is for
  registry/goals.yaml         what it is for
  registry/modules.yaml       business capabilities (+ features)
  registry/codebases.yaml     app key → github repo
  journeys.yaml               end-to-end paths (goal, persona, source)
  epics.yaml                  outcomes worth shipping (outcome, source)
  stories/<EPIC>/<KEY>.md     one story: front-matter + sentence + ACs inline
  decisions.md                choices made while drafting → decision records
  findings.md                 welded evidence, claimed-done items, contradictions
  _unread.md                  what could not be classified, honestly
  tasks/  bugs/               only when the repo has issues (github_ref)
  context.md                  the DESKTOP APP's file — ignored, never touched
```

Templates for every one of these ship in this plugin under
`templates/sakal/`. Copy, fill, verify.

## Scope: one project, many repos

A project can span many codebases (one product, eleven repos). Ownership splits
along that seam:

| Layer | Owns | Lives |
|---|---|---|
| **project** | goals, personas, modules, journeys, **epics** | one repo's `.sakal/` (the spec-home) |
| **app** | stories, ACs, tasks, bugs | each codebase's own `.sakal/` |

`config.yaml` says which layer this directory carries:

- `scope: project` — this repo owns the project layer. A single-repo project
  uses this and carries **both** layers in one `.sakal/`.
- `scope: app` — this repo carries only its own stories. The project layer
  lives in the spec-home repo's own `.sakal/` tree, a different checkout.

**Under `scope: app` you REFERENCE, you never re-draft.** Use the project
layer's keys. This tree cannot resolve them (they live in a different
checkout) and verify does not pretend to — a reference is a claim this tree
cannot check. If a story needs a persona or epic that does not exist yet, do
not quietly invent it: put it in `.sakal/proposals/`, which verify
acknowledges and which a human carries to the spec-home repo by hand. Verify
errors on any project-layer file DEFINED in an app-scoped tree.

## PREPARE

1. **No preconditions. PREPARE IS OFFLINE.** It reads the repo and writes
   files; there is no server involved at any point. Never prompt for a
   connection.
2. **Print the DECLARED target** — project, app — and say plainly that it is
   a declaration. It is written into `config.yaml` from the repo and what the
   user tells you; verify is what flags a declaration that does not resolve
   (e.g. an `app:` key the spec-home registry disagrees with).
3. **Read the repo's reality**, in this order: a spec set (`docs/specs/`,
   `specs/`, whatever it actually uses — look, do not assume), then README and
   `docs/`, then open issues via `gh`, then the code's own module and route
   names. Chunk large repos and keep `_unread.md` honest; silent truncation is a
   lie by omission.
4. **Write `.sakal/`.** Every story and every AC carries `source:` pointing at
   the local document that justifies it. Nothing without a source — if you
   drafted something the repo does not say, mark it `source: none (drafted)` so
   it is visible rather than smuggled.
5. Put what you could not classify in `_unread.md`, what you had to decide in
   `decisions.md`, and what you noticed in `findings.md`.

**Never invent structure.** A repo with less written down gets a smaller draft
and the gaps get named. Padding a draft to look impressive puts fiction into a
customer's tracker.

**The app-layer emission is code, not prose** (`lib/sakal-prepare.mjs`, since
0.6.0): it pins HEAD, imports spec text VERBATIM (epic sections, AC text, raw
checkbox markers), grep-confirms every citation at the pin, and is
byte-deterministic. It REFUSES LOUDLY (S1) when a spec file carries AC-like
lines its family rules do not parse — never hand-extract around that refusal;
zero-AC extraction from an AC-bearing file must stay impossible. The model's
share of prepare is judgment: the cites JSON (honest evidence or `[]` with a
reason) and the app profile.

## VERIFY

```
node <plugin>/lib/sakal-verify.mjs [--scope <selector>]
```

Zero dependencies, and **strictly local — there is no server mode and no flag**.
It lints files, which means it works on a plane. Reports `file:line` with a fix,
so a correction is an edit and not a conversation.

The house schema in `CONVENTIONS.md` is enforced here mechanically — naming,
granularity bounds, AC voice — as **warnings** in this release, so a fleet
drafted before the conventions existed does not turn red overnight.

What it checks: front-matter parses · required fields per ENTITIES.md · key
format and uniqueness · every reference resolves (story → epic, journey,
persona, app, module; journey → goal, persona) · provenance present **and the
cited section actually exists in the repo** · no status fields anywhere · AC
kind present and known · scope rules · and the mechanical parts of CONVENTIONS.md.

**Lintable vs judgment.** Lintable: vagueness ("properly", "various"),
more-than-one-claim ACs, story-sentence shape, welded evidence, and everything
above. Judgment, and no linter should pretend otherwise: whether an AC is the
*right* AC, whether an epic is worth shipping, whether a journey is one a real
person walks. Warnings are findings, not blockers.

**Welded evidence** — an AC with a file or symbol reference baked into its
text — is a warning every run, by ruling. It is imported **as-is**: someone
chose those words. It is recorded in `findings.md` so it stays visible, never
silently rewritten into a citation.

### Correcting something

Edit the file → verify again. That is the whole loop, and it is why the
directory is committed.

## Unhappy paths

**Hand-edited file breaks parse** → verify fails closed with the offending line
quoted and what was expected instead.

**Provenance rot** — a doc section renamed or deleted after prepare → verify
flags the stale source as an error. Repoint it, or mark it drafted.

**Registry gaps** → named, with where to create them. Under `scope: app` they go
to `findings.md` for a human, because growing the project layer from inside one
codebase is a decision, not a side effect.

**Huge repo** → chunk, and keep `_unread.md` truthful.

**`context.md`** → the desktop app owns it. Verify ignores it and says so; the
skill never writes to it.
