---
name: sakal-onboard
description: Get an existing project into SakalMaster. Reads the repo's own reality — specs, docs, README, open issues — drafts journeys, epics, stories, acceptance criteria and tasks, shows a dry run, and writes nothing until the human confirms. Re-runs converge instead of duplicating. Use when the user says "onboard this repo into SakalMaster", "/sakal-onboard", "import my project into SakalMaster", "set up SakalMaster for this codebase", or after specs change and the tracker needs to catch up.
---

# sakal-onboard

Turns a repo into a tracked project in SakalMaster: journeys → epics → stories →
acceptance criteria → tasks, extracted from what the repo already says.

**Nobody re-types their own project.** The reading is the work; the human's job
is to say yes or no to a draft.

Two rules decide almost every judgement call in this skill:

1. **Never invent structure.** A repo with less written down gets a smaller
   draft, and the gaps are named. Padding a draft to look impressive is the one
   unforgivable failure here — it puts fiction into the customer's tracker.
2. **Nothing is written before the human says yes.** Not one row.

## Before anything: three preconditions, in the customer's words

Check all three, report all three, then stop if any is missing. Do not improvise
around a missing one.

| # | What must be true | How to check | If missing |
|---|---|---|---|
| 1 | The SakalMaster MCP is connected | call `sakal_list_projects` | walk them through the connect flow below |
| 2 | A project exists | it appears in that list | they create it in the app — **Projects → New project** |
| 3 | This repo is linked as a codebase (app) | its key appears under the project | they link it in the app — **App Management → the app → Repository** |

**Connecting the MCP** (one time, and it is theirs — not yours):

> In SakalMaster: profile menu → **API tokens** → *New token*, scope `read+write`.
> It is shown exactly once. Then, in their terminal:
> `claude mcp add sakalmaster -e SAKAL_TOKEN=<the token> -- node <path>/apps/mcp/dist/index.js`
> (hosted projects also need `SAKAL_SUPABASE_URL` and
> `SAKAL_SUPABASE_PUBLISHABLE_KEY` — both public values.)

**Never ask for a token in the chat, and never accept one if it is offered.**
It belongs in their MCP config, nowhere else. If they paste one anyway, tell
them to revoke it and mint another.

**No Claude Code?** This door is closed to them — say so plainly and point at
the in-app import (onboarding way 2). Do not contort this skill into a
copy-paste ritual.

## Step 1 — Say where you are about to write, before you write

Print the resolved target and get an explicit yes:

```
Project:     Sakal POS            (id 4a47bb51-…)
Codebase:    sakalpos-garage      (app key: sakalpos-garage)
Environment: staging              (https://…supabase.co)
Repo:        sakal-dev/sakalpos-garage @ main
```

More than one project or app visible → **ask which**, never pick. Writing a
customer's project into the wrong project is expensive to undo and worse to
discover later.

## Step 2 — Read the repo's reality

In priority order, stopping when the repo runs out of material:

1. **A spec set** — `docs/specs/`, `specs/`, `docs/product/`, or whatever the
   repo actually uses. Look before assuming; ask if it is ambiguous.
2. **README + docs/** — for a repo with no formal specs this is the source.
3. **Open GitHub issues** — via `gh issue list`, if the repo has a remote.
4. **The code's own shape** — module and route names tell you the app's
   structure when prose does not.

Chunk large repos: read in passes and keep an explicit **unread list**. Report
it. Silent truncation is a lie by omission — a customer who thinks you read
everything will trust a draft built on a third of their project.

### What maps to what

| Repo material | SakalMaster | Key |
|---|---|---|
| a user-facing outcome / journey doc | **journey** | `spec:<repo>:<id>` |
| a spec file / feature area | **epic** | `spec:<repo>:<id>` |
| a `### ID · Title` block, or a README feature | **story** | `spec:<repo>:<id>` |
| a `- [ ] AC-n — …` line, or a stated requirement | **AC** | `AC-<n>` under its story |
| an open issue | **task** (or **bug** if it describes a defect) | linked by `github:<owner>/<repo>#<n>` |

Stories need a **persona**, **app**, **epic**, **journey** and **module** to
exist. Where the repo does not say, do not guess a persona into existence —
see *Registry gaps* below.

## Step 3 — Dry run. Always. Every time.

Show, in this order:

1. **Counts**: journeys / epics / stories / ACs / tasks.
2. **A representative sample** — one full branch from journey down to ACs, so
   the human can see the shape rather than a number.
3. **What could not be classified**, by name. A short "I could not place these
   four documents" list is worth more than four invented epics.
4. **Registry gaps** — personas, apps, modules the structure needs that do not
   exist yet, and exactly where to create them.
5. **Findings** — contradictions, duplicate ids, spec sections that assert
   status.

Then ask for confirmation. **Write nothing until you get it.**

> **Statuses never import.** A spec that says an item is done is making a claim,
> not stating a fact. Every AC is born `open`; the verifier decides what is
> actually built by resolving citations against real code. If a spec welds its
> evidence into the AC text ("AC-3 — refund flow works, see refund_service.dart"),
> import the text **as-is** and record it as a finding. Do not split it, do not
> convert it into a citation, do not set a status. Someone chose those words;
> the customer decides whether to change them.

### If the dry run is rejected twice

Do not run a third identical sweep. Offer the granular path instead — one epic
or one issue at a time — so they can steer rather than veto. Two rejections
means the sweep's shape is wrong, and a third will be rejected too.

## Step 4 — Submit

Through the MCP tools, under the customer's own credential. Every row is
attributed to them in History; RLS applies. **The onboarding path is the
governed path** — there is no bulk side door, deliberately.

Order matters, because each layer references the one above:

```
registry (persona / app / module — only what was approved in the dry run)
  → sakal_create_journey     key spec:<repo>:<id>
  → sakal_create_epic        key spec:<repo>:<id>
  → sakal_create_story       key spec:<repo>:<id>   (app, epic, journey, persona, module)
  → sakal_create_ac          per story, born open
  → sakal_create_task        githubRef: github:<owner>/<repo>#<n>
  → sakal_link_github_issue  for anything created before its ref was known
```

Hard rules while submitting:

- **Tasks land NOT agent-ready.** `sakal_create_task` leaves them that way;
  simply never call `sakal_set_task_agent_ready` during onboarding. Flipping
  that switch is the operator's, later, deliberately.
- **Never set a status** — no AC status, no citation `resolves`, no surface
  status. The tools give you no way to; do not go looking for one.
- **Report progress as you go**, in layers, so an interruption is legible.

## Step 5 — Re-runs converge

A second run is not a second import. Before creating anything, read what is
already there (`sakal_project_summary`, `sakal_search_stories`,
`sakal_list_tasks`) and match on the stable keys — `spec:<repo>:<id>` and
`github:<owner>/<repo>#<n>`.

Report the second run as **deltas**: `12 unchanged · 3 new · 1 changed text ·
2 in SakalMaster but no longer in the specs`.

Vanished spec sections are **reported, never deleted**. Something that left the
spec may still be live work; that is the customer's call, not yours.

## Step 6 — Close

- Offer the **verifier pass** — it is what turns the imported map into an honest
  one, by resolving citations against real code.
- Tell them what they will now see: their project's structure in the app, ACs
  sitting `open` because nothing has been proven yet, and the Execution page's
  **Ready** column filling as they flip tasks agent-ready.
- Say plainly that the map is honest *because* it starts empty of claims.

## Unhappy paths

**MCP not connected / wrong credential** → explain the connect flow above. Never
ask for a token in chat. A `read`-scoped token fails on the first write with a
database-level refusal, not a polite one — if writes are refused, check the
token's scope first.

**Messy or contradictory sources** → draft less, and list what you could not
classify. Two documents that contradict each other are a finding, not a merge
problem for you to solve silently.

**Interrupted mid-submit** → nothing to clean up. Re-run; the keys converge and
already-created rows are recognised, not duplicated. Say this out loud when it
happens, because a half-finished import *looks* alarming.

**Two spec items pointing at one GitHub issue** → the database refuses the
second link (unique violation, `23505`). Surface it as a **spec bug**, naming
both candidates, and let the customer decide which one owns the issue. Never
silently drop one.

**Registry gaps** → name each missing persona / app / module and where to create
it. You may create the ones the customer explicitly approved in the dry run —
that is reviewed, not silent. You may not conjure a persona because a story
needed one.

**Wrong project or environment** → this is why step 1 exists. If the target
looks wrong at any point, stop and re-confirm rather than continuing.

**A huge repo** → chunk, and keep the unread list honest.

## Day-after commands

Onboarding is a sweep; day-to-day is increments. Add one thing at a time with
the same machinery and the same rules (dry run, stable key, born open,
not-agent-ready):

- `/sakal-submit-epic <spec file>` — one epic and its stories
- `/sakal-submit-issue <n>` — one GitHub issue as a task or bug
- `/sakal-submit-story <id>` — one story and its ACs

These are documented here as the intended path and are **not yet shipped as
separate commands**; today, ask this skill for the increment ("add just
GR-11 to SakalMaster") and it runs the same steps against that subset.
