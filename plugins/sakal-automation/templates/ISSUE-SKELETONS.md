# Issue skeletons — for agents and the `gh` CLI

The YAML forms guarantee structure in the **web UI**. This file guarantees the same
structure everywhere else: when Claude (Cowork, Claude Code, or an autonomous run)
creates an issue with `gh issue create --title … --body … --label …`, the body must
follow the matching skeleton below, and the labels must match the form's set.

**Choosing the type:** new capability → feature · wrong behaviour → bug (production
+ urgent → hotfix) · no behaviour change → chore (with a design goal → refactor) ·
words only → docs · need knowledge → spike · container → epic · just asking →
question · exposure → security.

**Rules that ride along (also in RULES.md):** `priority:urgent` never auto-merges ·
spikes merge no production code · epics/questions never get `claude-ready` ·
security is never `claude-ready` by default · title convention `<STORY-ID>: <outcome>`.

---

## feature  — labels: `type:feature`, `claude-ready`
```markdown
## Why
<user problem, why now>
## Acceptance criteria
- [ ] <verifiable claim>
- [ ] <verifiable claim>
## Out of scope
- <what must not change>
## Pointers
<files / symbols / patterns to follow>
## Constraints / decisions
<decision + reason, or link>
## Verification beyond tool/verify.sh
<extra tests / checks>
```

## bug — labels: `type:bug`, `claude-ready`
```markdown
## Reproduction steps
1. …
## Expected vs actual
Expected: … / Actual: …
## Violates
<story id / spec line / "no written claim exists">
## Environment
<version · platform · env>
## Out of scope
<fix the falsified behaviour only>
## Pointers / suspected cause
…
Done = repro gone · regression test exists · verify.sh green.
```

## hotfix — labels: `type:bug`, `priority:urgent`, `claude-ready`, `review`
```markdown
## Production impact
<who, how badly, since when>
## Reproduction steps / ## Expected vs actual / ## Environment
<as bug>
## Known workaround
…
## Out of scope
Smallest fix; root cause → follow-up chore.
Done = impact stopped · regression test · follow-up filed. NEVER auto-merge.
```

## chore — labels: `type:chore`, `claude-ready`
```markdown
## What changes
…
## Invariant — must NOT change
…
## Out of scope
No "while I'm here" changes.
Done = verify.sh green AND invariant held.
```

## refactor — labels: `type:refactor`, `claude-ready`
```markdown
## Why — the design problem
…
## Target shape
…
## Invariant — behaviour that must not change
…
## Out of scope / ## Pointers
…
```

## docs — labels: `type:docs`, `claude-ready`
```markdown
## What to document
…
## Audience & where it lives
…
## Source of truth
<code/spec the docs must agree with>
## Out of scope
No code. No guardrail files (CLAUDE.md, docs/RULES.md, .github/**).
```

## spike — labels: `type:spike`, `claude-ready`
```markdown
## Questions to answer
1. …
## Why we need to know
<decision this unblocks>
## Findings go to
<doc/ADR path>
## Timebox
…
Done = written, evidenced answers. NO production code merges.
```

## epic — labels: `type:epic` (never claude-ready)
```markdown
## Outcome
…
## Child issues
- [ ] #n
## Sequencing / dependencies
…
```

## question — labels: `type:question` (never claude-ready)
```markdown
## The question
…
## Context
…
```

## security — labels: `type:security`, `review` (claude-ready only by human decision)
```markdown
## Kind
Vulnerability | Hardening | Dependency advisory
## Description
<what is exposed, to whom — describe the class, never a working exploit>
## Impact if exploited
…
## Suggested fix direction
…
Done = exposure closed · denial test exists. NEVER auto-merge.
```
