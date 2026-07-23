---
name: sakal-import
description: Import a repo's content into SakalMaster — spec files become journeys/epics/stories/ACs, open GitHub issues become bugs/tasks. Idempotent, re-runnable when specs change. Use when the user says "import this repo's specs into SakalMaster", "sync my specs", "link these issues to SakalMaster", "get this repo's backlog into SakalMaster", or after specs change and the tracker needs updating.
---

# sakal-import

Turns a repo's written content into SakalMaster live-tracker data. Two flows —
**specs** (run first) and **issues** (run after specs exist). Both idempotent:
re-running updates, never duplicates. The full model lives in SakalMaster's
`docs/CONTENT-PLAYBOOK.md`; everything needed to execute is IN this skill.

Requires the SakalMaster MCP connector (or REST via token-exchange in CI).
No connector → stop and tell the user; never write SQL directly.

## The three-layer rule (why this skill exists)

Spec files = the **blueprint** (wording). SakalMaster = the **tracker** (status,
always derived). GitHub issues = the **queue** (work to do). One fact, one home.
This skill moves content blueprint → tracker and links queue → tracker.

## Flow 1 — Specs

**Locate.** Default `docs/specs/` in the repo. Not there → check the project's
central spec set (SakalPOS: `Business/specs/implementations/<surface>/`). Ambiguous
→ ask, don't guess.

**Parse.** The Sakal spec format:
- `00-user-journeys.md` — one **Journey** per `## Journey X` section
- each `XX-NN-*.md` file — one **Epic** (title from H1, key from prefix)
- each `### XX-NN-MM · Title` block — one **Story** (As-a/I-want/So-that text,
  priority from the block)
- each `- [ ] AC-n — …` line — one **AC** (text only)
- Dependencies/References — story links/notes; don't invent entities

Deviations from the format: report them in the dry run with proposed handling.

**Mapping + hard rules:**

| Rule | Detail |
|---|---|
| app = repo | Everything imports under this repo's App (create if absent, under the right project) |
| **statuses never import** | Every AC lands `open` — including 🟢 "Built" ones. Spec status is a claim; only citations + verifier move an AC. Do not set, annotate, or approximate it |
| idempotent keys | External key `spec:<repo>:<id>` (e.g. `spec:kiosk-flutter:KIO-03-01`) on every journey/epic/story. Re-run = update text + add new, never duplicate, never delete — report vanished spec sections and stop for a decision |
| attributed writes | MCP under a real identity; the import must show in History |

**Procedure:**
1. Parse everything → show a **dry-run table** (counts per entity + parse
   problems). **Stop for the user's go. Nothing writes before it.**
2. Import: journeys → epics → stories → ACs, with links and external keys.
3. Verify: counts match the dry run · spot-check 3 stories end to end against
   the files · every AC is `open` · re-run unchanged produces zero new entities.
4. Report the **🟢-claimed-but-open count** — the honest gap the verifier will
   measure later. That gap is the product working, not an import bug.

## Flow 2 — Issues (only after Flow 1 for this repo)

Open issues only; closed ones are history and stay on GitHub.

| Issue type | Becomes | Attached to |
|---|---|---|
| `type:bug` | SakalMaster **bug** | the story/AC it falsifies; app-level if unclear |
| feature / chore / refactor / docs | **task** | its story — match spec ids (`KIO-03-01`) in title/body; unmatchable → ask |
| epic / question | usually already covered by specs — map or skip, never force | — |

Rules: never import an issue as a *story* (issues are work about stories; a
genuinely new story is a spec edit first, then re-run Flow 1). Two-way link:
external ref `github:<owner>/<repo>#<n>` on the SakalMaster side, label
`tracked-in-sakalmaster` on the issue. Idempotent by that ref. The issue stays
the live queue entry until the repo flips to `source: sakalmaster`; after the
flip it's a mirror.

Same dry-run discipline: show the proposed mapping table (issue → entity →
story), get the go, then write.

## When specs change later

Re-run Flow 1 for that repo — that IS the sync mechanism. Wording updates flow
in; statuses are untouched (unwritable anyway). New stories/ACs arrive `open`.

## Environment

Ask which SakalMaster to target if unclear. Staging first, always
(`master-staging.sakal.dev`); production only after the user says so. The
import is idempotent, so re-running against production later is the promotion
path — no export/copy step exists or is needed.

## Out of scope

Status manipulation (impossible by design — don't try workarounds), schema or
code changes, deleting anything, cross-app product specs (SakalPOS P01–P27 —
separate decision, not this skill). Missing MCP capability → file a SakalMaster
issue; never work around it.
