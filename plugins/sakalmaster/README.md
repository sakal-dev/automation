# sakalmaster plugin

Turns an existing repo into a structured `.sakal/` spec-tracker directory, by
reading the repo instead of asking you to re-type it. Fully local — nothing
this plugin does leaves your machine.

```
/plugin marketplace add sakal-dev/automation
/plugin install sakalmaster@sakal-automation
```

**After installing, and after any update: restart Claude Code.** Plugin
commands only register after a restart. If a command is missing, that is
what it means.

Then, in your repo — three commands, one purpose each:

```
/sakal-onboard-project   prepare the project layer (registry, journeys, epics)
/sakal-onboard-app       prepare this codebase's stories and ACs
/sakal-verify            the gate — problems in file:line words
```

The onboarding commands name the layer, so nothing has to stop and ask you
which one you meant — and each validates that claim against your git remote and
any existing `.sakal/` before it writes, so declaring the wrong one is refused
rather than obeyed.

Every command ends by naming the next step, so "what now?" is never a
question you hold alone.

## What happens — two phases over a `.sakal/` directory

1. **PREPARE.** It reads your repo — specs, docs, README, issues, the shape of
   the code — and writes a draft into `.sakal/` as structured files. Nothing
   leaves your machine. Every story and acceptance criterion carries a `source:`
   pointing at the document that justifies it; anything it drafted without a
   document behind it says so.
2. **VERIFY.** A linter over those files tells you what is wrong in `file:line`
   terms. You fix it by editing the files and running verify again.

`.sakal/` is **committed to your repo** by design. It is your project's
spec-as-code seed, and the working copy for every future correction: something
wrong in it is fixed by editing a file and re-verifying.

Multi-repo projects split the tree by layer: one repo (the spec-home) carries
`scope: project` — goals, personas, modules, journeys, epics — and every other
codebase carries its own `scope: app` tree of stories and ACs, referencing the
spec-home's keys by name.

## What it will not do

- **Invent structure.** A repo with less written down gets a smaller draft, and
  the gaps are named. You will not find epics in your tracker that exist nowhere
  in your repo.
- **Keep a sync-state file.** There is no hidden bookkeeping to go stale —
  `.sakal/` is the only record, and it is exactly what is on disk.
- **Import a status.** Every acceptance criterion is drafted `open`, including
  ones your spec marks as done. A spec saying something is finished is a claim;
  citations and bugs are what decide what is actually built, never a copied
  checkbox.
- **Delete anything.** A spec section that disappeared is reported, not removed —
  it may still be live work.
- **Touch `.sakal/context.md`.** That file belongs to the desktop app. This
  skill ignores it and says so.

## Requirements

- Claude Code (this is a Claude Code plugin).
- A repo with something written down to read from (specs, docs, README, or
  code structure) — the smaller that is, the smaller the draft.

## This plugin is independent

Installing it does **not** install the agent-automation stack (sweeps, PR
review, CI callers). That is a separate plugin — `sakal-automation` — in the
same marketplace. Onboarding a project and running agents on it are different
decisions, made at different times, by different people.
