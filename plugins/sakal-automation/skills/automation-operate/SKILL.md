---
name: automation-operate
description: Operate a repo's sakal agent automation day to day — queue typed issues, unblock claude-blocked loops, upgrade engine callers, and diagnose "the sweep didn't run / didn't merge / left a label" from the known GitHub constraints. Use when the user says "queue this for the agent", "why didn't the sweep run", "the agent is stuck", "unblock the queue", "upgrade the automation", or anything about automation behaving oddly.
---

# automation-operate

The operations manual as a skill, for repos already onboarded by
`automation-install`. The diagnosis knowledge below is IN this skill on
purpose (ported from `docs/github-constraints.md`) — never research these
afresh. Enforcement lives in the engine; this skill reads, explains, queues,
and (only with the human) relabels.

## Queue an issue

1. Pick the type (ten exist — feature, bug, hotfix, chore, refactor, docs,
   spike, epic, question, security). Unsure → `ISSUE-SKELETONS.md` in
   `sakal-dev/automation → plugins/sakal-automation/templates/` has the
   one-page chooser.
2. Create via `gh issue create` using the MATCHING SKELETON from that file —
   never a blank issue. Title `<STORY-ID>: <outcome>`. Apply the type label +
   queue label the skeleton names. Rules that bind: >~5 ACs or >1 module →
   split under an epic · epics/questions/security are never queued ·
   `priority:urgent` never auto-merges · spikes merge no code.
3. Queue = `claude-ready`. Park = remove it. Hands-off merge = the human (not
   you) adds `auto-merge`, sparingly, per issue.
4. It runs via the next sweep cron, `gh workflow run claude-daily-sweep.yml`,
   or an `@claude` mention on the issue for immediate pickup.

## Unblock (`claude-blocked` loop)

1. `gh issue list --label claude-blocked` → read the agent's block comment;
   it states exactly what it needs (that's the contract: block = question).
2. Answer in an issue comment — a decision, a clarification, or a narrowed
   scope. Product decisions belong to the human; draft, don't decide.
3. Remove `claude-blocked` (keep `claude-ready`) → the next sweep retries; or
   `@claude` in the answer comment for immediate pickup.
4. Same block twice → the issue is underspecified; rewrite it against its
   skeleton (usually missing Out-of-scope or Pointers) instead of answering
   piecemeal a third time.

## Upgrade a repo's callers to a new engine tag

1. `grep -rn "sakal-dev/automation" .github/workflows/` → current pins.
2. Read the target tag's release notes in `sakal-dev/automation` (breaking
   input changes are called out there).
3. **Show the user the diff first** (old→new tag per caller + any new/renamed
   inputs), then apply on a branch + PR. Never `@main`; floating `v1` moves
   on its own — explicit upgrades matter only for `v1 → v2` or a frozen
   `vX.Y.Z` pin.
4. After merge: one `workflow_dispatch` sweep as a smoke test.

## FIRST: which mode is this repo in?

`grep "source:" .github/workflows/claude-daily-sweep.yml` — a
`source: sakalmaster` line means INTEGRATED (SakalMaster is the queue;
GitHub issues are a MIRROR — the sweep must never drain `claude-ready`
labels in this mode, and "queue an issue" means seed a task in SakalMaster
instead). No line (or `github`) = standalone. Every diagnosis below starts
with this check; rollback between modes is that one line (drilled — see
`docs/RUNBOOK.md` §4).

## Diagnose, integrated mode (sakalmaster)

- **Run green but SakalMaster shows nothing** → the silent-lifecycle
  signature, `docs/RUNBOOK.md` §1. Engine ≥v2.0.1 makes it impossible;
  upgrade if older.
- **Claim step fails** → OIDC: caller must grant `id-token: write`; the repo
  must be linked (`apps.github_repo`) in SakalMaster; audience is pinned
  `sakalmaster`. Exchange errors name the missing piece.
- **Task re-served after success** → succeeded does NOT retire a task; the
  judge parks it (`agent_ready=false`). If unparked, the judge step was
  skipped — check its log.
- **Stale `queued`/`running` runs** → leases self-heal: the next claim
  retires them `abandoned`. Nothing to clean by hand.
- **"PAUSED (app|project)" in the log, runs green, nothing claimed** → NOT a
  fault. Someone hit the kill switch: SakalMaster withholds work by returning
  *no rows* (never an error, so a cron doesn't fail red every ten minutes).
  Resume in App Management (unpause the app or the project) — or leave it
  paused; sweeps keep exiting clean and cheap. Verify with
  `v_app_execution` (`app_paused` / `project_paused`).
- **"METHOD REJECTED — app X accepts work from: …"** → a POLICY stop, and the
  loudest error the engine can raise. The app's allowed execution methods
  don't include this runtime, and the runtime was DERIVED from the credential
  (OIDC → `github-actions`, PAT → `worker`, MCP → `mcp`, session → `manual`)
  — so it cannot be a mislabelled parameter. Fix the app's methods in App
  Management, or run the task through an allowed method. **Never** "fix" it
  by falling back to github mode; the engine deliberately does not retry.
  `unprovable` in the message = a token minted before `sakal_auth` existed;
  it self-clears within the 15-minute JWT TTL — just re-run.

**"The bot keeps re-asking a question I already answered."**
- Fixed in engine v2.3.0 (`actions/authority-gate`). Older engines re-derive
  every run and treat their own analysis as senior to a human — upgrade.
- On v2.4.0+ (PASSIVE): your answer settles it permanently — the gate pins one
  "decision recorded" comment and tells the next agent the question is closed.
  It does **not** touch labels. **You** clear `claude-blocked` and re-add
  `claude-ready` when you want it worked. (v2.3.0 DID edit labels; that was
  reverted as unwanted — do not pin a caller to v2.3.0.)
- To re-block deliberately: re-add `claude-blocked` — authoritative, no argument.
- To re-open the question for the agent: change the spec ledger. Only a moved
  ledger counts as new evidence.
- Positional rule: ANY maintainer comment after the block settles it, even
  "looking into this". Small blast radius now — the gate only stops re-asking;
  it queues nothing.

**"I answered and removed `claude-blocked`, but the sweep never picks it up."**
- Check for `claude-ready`. Removing the block does not queue an issue — the
  two labels are separate instruments, and the engine will not add `claude-ready`
  for you (by design, since v2.4.0). Add it and the next sweep takes it.
- This is the #1 expected symptom of the passive gate. It is not an engine
  fault; it is the engine declining to steer.

**"An issue has both `claude-blocked` and `claude-ready`."**
- The gate WARNS and changes nothing (`::warning::` naming the issue). Clear
  one yourself — whichever is stale. The engine deliberately will not choose,
  because choosing means overriding a human label.

## Diagnose, standalone mode — the checklist (answers inline)

**"The sweep didn't run."**
- Cron is UTC and best-effort: minutes late is normal, ~an hour under load
  possible, occasional skips real. Check `gh run list --workflow
  claude-daily-sweep.yml` before assuming breakage.
- A new/changed cron only exists once the workflow file is on the DEFAULT
  branch. Unmerged onboarding/upgrade PR = no cron at all.
- Ran but did nothing? That's the cheap check-for-work gate: no actionable
  `claude-ready` (all blocked/working/linked-PR) = ~seconds, by design.
- Silent 403 in the engine = the caller's `permissions:` block lost a line —
  diff it against `$AUTO/caller-sweep.yml`.

**"The PR didn't merge."**
- No `auto-merge` label on the issue (or PR) → it's WAITING FOR REVIEW. Not a
  bug; the default.
- The named check (`analyze-and-test` unless overridden) must be green — an
  unrelated failing optional check does NOT block, but a missing/renamed gate
  check blocks forever: job name and `ci_check_name` input must match.
- Guardrail files (`CLAUDE.md`, `docs/RULES.md`, `.github/**`) NEVER
  auto-merge — even labelled, even green. Deliberate; review it by hand.
- PR opened but CI never ran → it was opened by the workflow's own
  `GITHUB_TOKEN` (inert, loop-prevention). Agent-opened PRs use the app
  token; a human clicking the agent's "Create PR" link also works.
- Docs-only PR waiting on CI that will never run → expected the other way
  around: docs-only merges WITHOUT CI. If it's stuck, a changed file falls
  outside `docs_only_paths` — check the file list, not the label.

**"A label is stuck."**
- `claude-working` outliving a run should be impossible (always() release;
  the sweep releases ALL, incl. closed issues). If seen: the run was killed
  before steps ran at all, or permissions lost `issues: write`. Remove by
  hand, then check `gh run view <id>` for the release step's status.
- `Closes #n` didn't close the issue → the API linkage lags and
  GITHUB_TOKEN-merges suppress it; the engine closes explicitly on merge —
  if it didn't, the closing keyword is missing/typo'd in the PR BODY (that's
  where it's parsed from).
- Label edits failing intermittently → API rate limits; the engine's writes
  are idempotent, retry is safe.

**"@claude ignored a comment."**
- The ~1s skipped runs on every comment are the GUARD working, not failures.
- A real mention skipped → check the caller's `if:` survived (diff against
  `$AUTO/caller-on-demand.yml`) and the comment actually contains `@claude`.
- Ran but stood down → the issue already had `claude-working` (another run
  owns it) — that's the per-issue concurrency doing its job.

## Escalation rule

Anything that would weaken an invariant — auto-merge default-on, denylist
holes, guardrail exceptions, skipping the gate — is flagged to the human and
refused, even if asked casually. Change requests of that kind go to
`sakal-dev/automation` as an issue, where the contract lives.

## Before asking for any credential

Need a password/token/key? **Consult `docs/CREDENTIALS_REQUIRED_CHECKLIST.md` first** — run its zero-config tests, ask only for irreducible ones, use its exact create-steps, and never conflate the GitHub App (read) with a worker `GH_TOKEN` (write) with the `SAKAL_TOKEN` Supabase agent account.
