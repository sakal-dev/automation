# Issues — the guide

How typed issues work across sakal-dev repos: what the ten types are, how the
templates reach a repo, how humans use them, and how agents know the format.
The copyable artifacts live in `plugins/sakal-automation/templates/`
(`issue-templates/`, `labels.sh`, `ISSUE-SKELETONS.md`,
`claude-md-issues-section.md`). This file is the manual for them.

## Why typed issues

In standalone mode **the issue is the agent's brief** — its entire task-specific
world. Ten types exist because only a few *evidence shapes* exist: a feature is
proven by acceptance criteria; a bug by a reproduction that stops reproducing plus
a regression test; a chore by an invariant that held; a spike by written answers.
The form forces the evidence shape to be present before any agent starts.

## The ten types

| Type | Core field (replaces/joins ACs) | Done means | Queue default |
|---|---|---|---|
| ✨ feature | Acceptance criteria | ACs satisfied, `tool/verify.sh` green | `claude-ready` |
| 🐛 bug | Repro + expected-vs-actual + which spec it violates | repro gone · regression test exists · verify green | `claude-ready` |
| 🚨 hotfix | Bug + production impact | impact stopped · regression test · follow-up filed | `claude-ready` + `priority:urgent` + `review` |
| 🧹 chore | Invariant (what must NOT change) | verify green AND invariant held | `claude-ready` |
| 🧱 refactor | Design problem + target shape + invariant | target in place, invariant held | `claude-ready` |
| 📝 docs | What/audience/source-of-truth | docs agree with source of truth | `claude-ready` |
| 🔬 spike | Questions to answer + where findings go | written, evidenced answers; **no production code merged** | `claude-ready` |
| 🗂 epic | Outcome + child tasklist | all children closed | **never** queued |
| ❓ question | The question | answered (convert to spike if it needs investigation) | **never** queued |
| 🔐 security | Exposure description (class, never exploit) | exposure closed · denial test exists | **not by default** — human opts in; `review` always |

**Process rules (enforced in the engine, restated in RULES.md):**
`priority:urgent` is worked first and **never auto-merges** · spikes merge no
production code · guardrail files (`CLAUDE.md`, `docs/RULES.md`, `.github/**`)
never ride a docs-only fast path · one issue = one PR = one agent run — more than
~5 ACs or more than one module means split it under an epic.

## How the templates reach a repo — three paths

**Path A — org-wide defaults (recommended; zero copying).**
GitHub has a little-known mechanism called *default community health files*:
create a repository named exactly **`sakal-dev/.github`** and put files in it —
`.github/ISSUE_TEMPLATE/*.yml` included — and **every repo in the org that lacks
its own copy uses them automatically**, including repos created later. One place
to edit, no sync. Setup once:

```bash
gh repo create sakal-dev/.github --private -y
# copy plugins/sakal-automation/templates/issue-templates/* into its .github/ISSUE_TEMPLATE/
```

Caveats: (1) it is **all-or-nothing per repo** — a repo with its own
`ISSUE_TEMPLATE/` folder ignores org defaults entirely, no merging; (2) a private
`.github` repo serves defaults to private repos (our case) — make it public if
the org ever has public repos that should inherit them; (3) **labels are not
files** — path A cannot create labels (see below).

**Path B — per-repo copy (when a repo needs customisation).**
The `automation-install` skill copies `issue-templates/` into the repo's
`.github/ISSUE_TEMPLATE/` and customises — typically turning the free-text area
field into an `area:` dropdown listing that repo's real modules. Remember: the
moment a repo has its own folder, org defaults stop applying to it — the copy
must be complete, not partial.

**Path C — labels, always per repo.**
Labels are repository *data*, not files; no path distributes them automatically.
Run once per repo (idempotent, safe to re-run):

```bash
plugins/sakal-automation/templates/labels.sh sakal-dev/<repo>
# then add that repo's area:* labels (they become SakalMaster facets later)
```

**What workflows do NOT do:** the automation engine never creates templates or
labels — workflows react to events; templates are static content. Distribution is
paths A–C, done at onboarding.

## How humans use them

Open *New issue* → pick the type → the form forces the required fields and applies
the labels. Blank issues are disabled (`config.yml`) so nothing untyped enters the
queue. Removing `claude-ready` parks an issue; adding `auto-merge` (sparingly)
lets its PR land unattended on green CI.

## How agents and Claude know the format

Issue **forms only guard the web UI**. Cowork, Claude Code, and autonomous runs
create issues via `gh issue create`, which bypasses forms — so the same ten
shapes exist as markdown in **`ISSUE-SKELETONS.md`**, and every onboarded repo's
`CLAUDE.md` carries the section from `claude-md-issues-section.md` saying:
*issues here are typed; use the matching skeleton and label set; never create a
blank issue.* Claude Code loads CLAUDE.md automatically; Cowork reads it when the
folder is connected; sweep/on-demand runs receive it the same way.

So: **forms guard humans · skeletons guard machines · CLAUDE.md is how machines
find the skeletons.** If you change a form, change its skeleton in the same
commit — they are one shape in two syntaxes.

## Onboarding checklist for a new repo (until `automation-install` automates it)

1. Org defaults exist? (`sakal-dev/.github` — path A, once for the whole org.)
2. `labels.sh sakal-dev/<repo>` + add `area:*` labels for its modules.
3. Append `claude-md-issues-section.md` to the repo's `CLAUDE.md`.
4. Write the repo's `CLAUDE.md` + minimal spec **before** filing issues — agents
   have no ground truth without them.
5. Infrastructure issues (scaffold, CI, flavors) are worked by humans or
   supervised sessions — they touch denylisted paths. Agents enter at the first
   feature issue.

## SakalMaster mapping (why the shapes look like this)

feature → story + ACs · bug → the bug entity falsifying an AC ("expected vs
actual" *is* "claim vs reality") · chore/refactor → task with no AC impact ·
spike → open question whose answer becomes a decision with rationale · epic →
epic. When a repo's queue flips from GitHub to SakalMaster, issues generated from
stories will already be this shape — the forms are the practice run for the data
model.
