<!-- CLAUDE.md template for onboarded repos. automation-install copies this and
     fills the <placeholders>. Read docs/context.md (automation repo) for the
     reasoning. RULE OF THE FILE: CLAUDE.md is a MAP, not an encyclopedia —
     every line here is a tax on every session. Target < 100 lines. -->

# <RepoName>

<One paragraph: what this app is, who uses it, the one architectural idea.>

## Binding rules — loaded every session

@docs/RULES.md

<!-- RULES.md contains: the hard path denylist, gate rule (./tool/verify.sh is
     the definition of checks passing), one-PR-per-issue, never push to main,
     never commit secrets, the issue process rules (urgent never auto-merges,
     spikes merge no code), and VERIFY-FIRST. @import makes them binding in
     every fresh session — they are safeguards, so they ride along always. -->

## Session continuity

@docs/CHANGELOG-RECENT.md

<!-- The rotating session log: LAST 10 ENTRIES ONLY (protocol below). Older
     entries live in docs/changelog/ARCHIVE.md — read on demand, never loaded
     by default. For anything older or finer-grained: `git log --oneline -30`
     and PR descriptions are the full history; prefer them over asking. -->

**End-of-session duty:** append one entry to `docs/CHANGELOG-RECENT.md` (format
inside the file: date · what changed · why · follow-ups), then move the oldest
entry beyond 10 into `docs/changelog/ARCHIVE.md`. This is part of done, not a
courtesy.

## Where truth lives — read on demand, not preloaded

- `docs/SPEC*.md` — <what the product must do; per-story AC status ledger>
- `docs/DECISIONS.md` — decisions with rationale; never violate one silently —
  if a task conflicts with a decision, stop and raise it
- `tool/setup.sh` / `tool/verify.sh` — environment + the merge gate
- `.github/ISSUE_TEMPLATE/` + skeletons (see below) — how work is defined
- `<stack-specific truth: schema file, API contract, design tokens…>`

## Commands

- Setup: `./tool/setup.sh` · Gate: `./tool/verify.sh` (must exit 0 before any PR)
- <dev run command> · <test single-file command>

## Issues

<paste claude-md-issues-section.md here — types, skeletons, labels, queue rules>

## Conventions

- <naming, structure, patterns to follow — 5 lines max; deeper conventions live
  in docs/ and are pointed to, not pasted>
