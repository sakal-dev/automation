---
name: sakal-onboard
description: Get a project into SakalMaster in three phases over a committed `.sakal/` directory — PREPARE reads the repo and drafts structured files with provenance, VERIFY lints them until green, SUBMIT writes only verified files through the MCP. Re-runs converge; corrections are file edits. Use when the user says "onboard this repo into SakalMaster", "/sakal-onboard", "prepare the sakal directory", "verify my .sakal", "submit to SakalMaster", or after specs change and the tracker needs to catch up.
---

# sakal-onboard

Three phases over one committed directory:

```
PREPARE  read the repo → write .sakal/     (nothing leaves the machine)
VERIFY   lint .sakal/ → file:line problems (nothing leaves the machine)
SUBMIT   verified files → SakalMaster      (the only phase that writes)
```

**Why files and not a conversation.** Once data is live it is expensive to
correct and awkward to review. `.sakal/` is the draft while mistakes are still
free: readable, diffable, editable, and checkable by a linter that says
`file:line`. A chat transcript is none of those things.

`.sakal/` is **committed to the repo** by design. It is the project's
spec-as-code seed and the working copy for every future correction — when
something is wrong in SakalMaster, you fix the file and submit again.

## The three rules

1. **No status anywhere in `.sakal/`.** Files carry inputs. Status is derived
   server-side from citations and bugs. A `status:` field is a verify **error**,
   not a warning — a spec's `[x]` is a claim, and importing it would defeat the
   product on day one.
2. **No sync-state file, and prepare/verify never touch the server.** Drift is
   computed live at **submit**, which is the only phase that connects. Nothing
   on disk can go stale, and drafting quality is never coupled to connectivity —
   you can prepare and verify a dozen repos on a plane.
3. **Templates live in this plugin.** The customer's directory contains only
   their truth — never a leftover placeholder.

## The tree

```
.sakal/
  config.yaml                 scope, project, app, target host + project id
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
| **project** | goals, personas, modules, journeys, **epics** | one repo's `.sakal/`, or the server |
| **app** | stories, ACs, tasks, bugs | each codebase's own `.sakal/` |

`config.yaml` says which layer this directory carries:

- `scope: project` — this repo owns the project layer. A single-repo project
  uses this and carries **both** layers in one `.sakal/`.
- `scope: app` — this repo carries only its own stories. The project layer
  already exists on the server.

**Under `scope: app` you REFERENCE, you never re-draft.** Use the project
layer's keys. Offline you cannot resolve them and verify does not pretend to —
a reference is a claim, and **submit** is where claims are checked against the
real thing. If a story needs a persona or epic that does not exist yet, do not
quietly invent it: put it in `.sakal/proposals/`, which verify acknowledges and
submit never sends. Verify errors on any project-layer file DEFINED in an
app-scoped tree.

## PREPARE

1. **No preconditions. PREPARE IS OFFLINE.** It reads the repo and writes files;
   it does not need SakalMaster and must never block on it. If the MCP happens
   to be connected you MAY read the server back and print the delta as
   enrichment — and if the user denies that call, print
   *"offline — server state unknown; delta will be shown at submit"* and carry
   on. Never prompt for a connection.
2. **Print the DECLARED target** — project, app, host — and say plainly that it
   is a declaration. It is written into `config.yaml` from the repo and what the
   user tells you; **submit** is where the claim is checked against the server,
   and where it is refused with a `config.yaml` message if it does not resolve.
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

### `prepare --from-server`

For a project created in the app before any files existed. Reads what is live
and materialises `.sakal/` from it, so an in-app-first customer joins the
file-based world without re-drafting. Sources come back as
`source: none (drafted)` — the server does not know which document justified a
story, and pretending otherwise would fake provenance.

## VERIFY

```
node <plugin>/lib/sakal-verify.mjs [--scope <selector>]
```

Zero dependencies, and **strictly local — there is no server mode and no flag**.
It lints files, which means it works on a plane. Reports `file:line` with a fix,
so a correction is an edit and not a conversation. **Green verify is a hard
precondition for submit.**

The house schema in `CONVENTIONS.md` is enforced here mechanically — naming,
granularity bounds, AC voice — as **warnings** in this release, so a fleet
drafted before the conventions existed does not turn red overnight.

What it checks: front-matter parses · required fields per ENTITIES.md · key
format and uniqueness · every reference resolves (story → epic, journey,
persona, app, module; journey → goal, persona) · provenance present **and the
cited section actually exists in the repo** · no status fields anywhere · AC
kind present and known · scope rules · and the mechanical parts of CONVENTIONS.md.
Drift and submit-readiness are **not** here: they need the server, so they
belong to submit.

**Lintable vs judgment.** Lintable: vagueness ("properly", "various"),
more-than-one-claim ACs, story-sentence shape, welded evidence, and everything
above. Judgment, and no linter should pretend otherwise: whether an AC is the
*right* AC, whether an epic is worth shipping, whether a journey is one a real
person walks. Warnings are findings, not blockers.

**Welded evidence** — an AC with a file or symbol reference baked into its
text — is a warning every run, by ruling. It is imported **as-is**: someone
chose those words. It is recorded in `findings.md` so it stays visible, never
silently rewritten into a citation.

## SUBMIT

0. **Submit is the only phase that touches the server.** No connection → refuse
   in plain words; the files are unaffected.
1. Verify must be green (run it again — a stale green is not a green).
2. **Read SakalMaster back**, check the declared project/app actually resolves
   (prepare only claimed it), and print the delta — all before writing.
3. Create only what is missing. Keys are identity: `spec:<app>:<KEY>`.
4. **Never clobber a newer in-app edit.** If the server holds something the
   files do not, say so and ask — a human may have edited in the app. Submit
   never deletes server-side records.
5. ACs are born open. Tasks land **not** agent-ready — never call
   `sakal_set_task_agent_ready` during onboarding; that switch is the
   operator's.

### Correcting something

Edit the file → verify → submit again. That is the whole loop, and it is why the
directory is committed. An interrupted submit needs no cleanup: re-run, and the
keys converge.

## Unhappy paths

**Hand-edited file breaks parse** → verify fails closed with the offending line
quoted and what was expected instead.

**Provenance rot** — a doc section renamed or deleted after prepare → verify
flags the stale source as an error. Repoint it, or mark it drafted.

**Two spec items, one GitHub issue** → the database refuses the second link
(`23505`). Surface it as a spec bug naming both candidates; never silently drop
one.

**Registry gaps** → named, with where to create them. Under `scope: app` they go
to `findings.md` for a human, because growing the project layer from inside one
codebase is a decision, not a side effect.

**Huge repo** → chunk, and keep `_unread.md` truthful.

**`context.md`** → the desktop app owns it. Verify ignores it and says so; the
skill never writes to it.
