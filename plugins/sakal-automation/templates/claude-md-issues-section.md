<!-- Installed into each repo's CLAUDE.md by automation-install. Teaches any
     Claude working in this repo (Cowork, Claude Code, autonomous runs) how
     issues work here. -->

## Filing and reading issues

Issues in this repo follow ten typed forms (`.github/ISSUE_TEMPLATE/`). When you
create an issue — via `gh issue create` or any tool — you MUST use the matching
skeleton and label set from
`sakal-dev/automation → plugins/sakal-automation/templates/ISSUE-SKELETONS.md`.
Never create an untyped/blank issue.

- Title: `<STORY-ID>: <outcome>` (outcome, not activity).
- One issue = one PR = one agent run; >~5 ACs or >1 module → split, under an epic.
- `claude-ready` queues an issue for agents. Epics, questions, and security issues
  are never queued by default. `priority:urgent` is worked first and **never
  auto-merges**. Spikes merge **no production code**.
- When working an issue: the issue is your brief. VERIFY-FIRST against the code,
  respect `Out of scope` literally, and treat `./tool/verify.sh` as the definition
  of "checks pass".
- When *filing* a bug you discovered: fill `Violates` honestly — naming the spec
  line it falsifies, or stating "no written claim exists" (that is a finding).
