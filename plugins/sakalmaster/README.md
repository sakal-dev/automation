# SakalMaster plugin

Gets an existing project into SakalMaster, by reading the repo instead of asking
you to re-type it.

```
/plugin marketplace add sakal-dev/automation
/plugin install sakalmaster@sakal-automation
```

Then, in your repo:

```
/sakal-onboard
```

## What happens

1. It checks three things and tells you if any is missing: the SakalMaster MCP is
   connected, a project exists, and this repo is linked as a codebase.
2. It prints **where it is about to write** — project, codebase, environment —
   and waits for you to confirm that is the right target.
3. It reads your repo: specs, docs, README, open issues, and the shape of the
   code itself.
4. It shows you a **dry run** — counts, one full sample branch, what it could
   not classify, and anything missing that the structure needs.
5. You say yes. Only then does it write anything.
6. Run it again after your specs change: it converges on the stable keys and
   reports deltas. It does not duplicate, and it never deletes.

## What it will not do

- **Invent structure.** A repo with less written down gets a smaller draft, and
  the gaps are named. You will not find epics in your tracker that exist nowhere
  in your repo.
- **Import a status.** Every acceptance criterion is born `open`, including ones
  your spec marks as done. A spec saying something is finished is a claim; the
  verifier decides what is actually built by resolving citations against real
  code. That is the whole point of SakalMaster, and importing claimed statuses
  would defeat it on day one.
- **Queue work for agents.** Tasks land not-agent-ready. You flip that switch.
- **Delete anything.** A spec section that disappeared is reported, not removed —
  it may still be live work.
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
