# SakalMaster plugin

Gets an existing project into SakalMaster, by reading the repo instead of asking
you to re-type it.

```
/plugin marketplace add sakal-dev/automation
/plugin install sakalmaster@sakal-automation
```

Then, in your repo — three commands, one purpose each:

```
/sakal-onboard   read the repo, write .sakal/        (sends nothing)
/sakal-verify    lint .sakal/, problems in file:line (sends nothing)
/sakal-submit    send verified files to SakalMaster
```

Bare `/sakal-submit` **sends nothing**: it shows what is ready, what is blocked
and why, and asks. Every command ends by naming the next step, so "what now?"
is never a question you hold alone.

## What happens — three phases over a `.sakal/` directory

1. **PREPARE.** It reads your repo — specs, docs, README, issues, the shape of
   the code — and writes a draft into `.sakal/` as structured files. Nothing
   leaves your machine. Every story and acceptance criterion carries a `source:`
   pointing at the document that justifies it; anything it drafted without a
   document behind it says so.
2. **VERIFY.** A linter over those files tells you what is wrong in `file:line`
   terms. You fix it by editing the files and running verify again. Green verify
   is required before anything can be submitted.
3. **SUBMIT.** Only verified files go to SakalMaster, through your own
   credential. It reads the server back first and shows you the delta before it
   writes.

`.sakal/` is **committed to your repo** by design. It is your project's
spec-as-code seed, and the working copy for every future correction: something
wrong in SakalMaster is fixed by editing a file and submitting again.

## What it will not do

- **Invent structure.** A repo with less written down gets a smaller draft, and
  the gaps are named. You will not find epics in your tracker that exist nowhere
  in your repo.
- **Keep a sync-state file.** There is no hidden bookkeeping to go stale — drift
  is worked out by reading SakalMaster back, live, every time.
- **Import a status.** Every acceptance criterion is born `open`, including ones
  your spec marks as done. A spec saying something is finished is a claim; the
  verifier decides what is actually built by resolving citations against real
  code. That is the whole point of SakalMaster, and importing claimed statuses
  would defeat it on day one.
- **Queue work for agents.** Tasks land not-agent-ready. You flip that switch.
- **Delete anything.** A spec section that disappeared is reported, not removed —
  it may still be live work.
- **Touch `.sakal/context.md`.** That file belongs to the desktop app. This
  skill ignores it and says so.
- **Ask for your API token in chat.** It belongs in your MCP config. If a skill
  ever asks you to paste a token into a conversation, refuse.

## Why it writes through the MCP

Every row lands under **your** identity, through the same RPCs and the same
row-level security the app uses, and shows up in History attributed to you.
There is no bulk import side door — deliberately. The onboarding path is the
governed path, so an import cannot create rows that normal usage could not.

## Requirements

- Claude Code (this is a Claude Code plugin). Without it, use the in-app import.
- A SakalMaster account with an API token, scope `read+write`.
- A project, and this repo linked to it as a codebase.

## This plugin is independent

Installing it does **not** install the agent-automation stack (sweeps, PR
review, CI callers). That is a separate plugin — `sakal-automation` — in the
same marketplace. Onboarding a project and running agents on it are different
decisions, made at different times, by different people.
