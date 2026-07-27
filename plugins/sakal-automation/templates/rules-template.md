<!-- docs/RULES.md — installed by automation-install; owned by THIS repo.
     Imported into every session via CLAUDE.md's @import (context layer 2:
     binding safeguards). Edit THIS file — never fork the rules elsewhere.
     Generic by design; repo-specific truth belongs in CLAUDE.md/docs. -->

# Rules of engagement — agents on this repo

The single source of truth for how any agent works here — on-demand `@claude`,
the sweep, and interactive sessions.

## 1. Verify, don't assume

An issue's acceptance criteria are a **checklist to verify against the code**,
not a to-do list to assume is unbuilt. Verify each AC before writing anything;
cite `file:line`. Already satisfied → evidence, don't rebuild. Missing/partial
→ implement only that. All ACs already met → evidence comment; then: status
ledger stale → docs-only PR (`Closes #<n>`), let the merge close it; ledger
already correct → close directly, the evidence comment (one line per AC,
file + symbol) IS the audit trail. Never hand-close an issue you're opening a
PR for.

## 2. When to STOP and ask (escalate — never guess)

Stop if the task: is ambiguous/underspecified or its ACs conflict with the
code · needs a product/design decision · touches **auth, payments/money,
secrets, or CI credentials** · touches the denylist (§5) · requires something
destructive or hard to reverse (deletions, schema migrations, dependency
changes, >~10-file refactors). **How:** comment exactly what you need; on the
sweep also add `claude-blocked`; end the run. A run cannot wait for answers —
the human replies, removes the label (or re-mentions `@claude`), and a fresh
run continues.

## 3. The verification gate (before any PR)

Run **`./tool/verify.sh`** from the repo root and open a PR **only if it
exits 0**. It is the repo's single merge gate — exactly what CI runs. If you
cannot make it pass: `claude-blocked`, comment why, skip. Never open or merge
a PR that hasn't passed the gate.

## 4. Scope & safety

One PR per issue, scoped to that issue only · branch off the latest `main`;
never push to `main`; never force-push · never commit secrets (`.env*` hold
URLs + flags only) · keep changes minimal and idiomatic to the surrounding
code · respect the issue's **Out of scope** section literally.

## 5. Hard path denylist (structural, not a judgment call)

Never create, modify, or delete: `.github/**`, `tool/**`, any Gradle file
(`**/*.gradle`, `**/*.gradle.kts`, `gradle/**`, `**/gradle-wrapper.*`), any
keystore/signing material (`**/*.keystore`, `**/*.jks`, `**/key.properties`),
or `.env*`. If an issue needs any of these, escalate per §2.

## 6. Issue process rules

Issues are typed (see CLAUDE.md's Issues section). Binding consequences:
`priority:urgent` is worked first and **never auto-merges** · **spikes merge
no production code** — findings go where the issue says · epics, questions,
and security issues are never agent-queued by default · one issue = one PR =
one run; more than ~5 ACs or more than one module → split under an epic.

## 7. Merge behavior — label-gated and mechanical

Agents **never merge.** Verify (§3), open the PR (`Closes #<n>`), stop. The
auto-merge workflow merges only when the issue carries the `auto-merge` label
AND the CI check is green; otherwise the PR waits for human review. Guardrail
files (`CLAUDE.md`, `docs/RULES.md`, `.github/**`) never auto-merge.

## 8. Avoid overlap — the `claude-working` marker

Add it when you start an issue; if it's already there, another run owns the
issue — stand down. It is removed mechanically at run end (never trust
yourself to remember). The sweep and other runs skip issues carrying it, or
`claude-blocked`, or with an open linked PR. Lifecycle:
`claude-ready → claude-working → claude-done → closed on merge`.

## 9. A maintainer's answer ends the question

When you block and a maintainer answers — in a comment, or by removing
`claude-blocked` — **that decision is final and durable.** Do not re-ask it on
the next run, do not re-apply the label, and never treat your own fresh
analysis as senior to a human decision. You may raise it again ONLY if the
spec ledger actually changed since the answer, and then you must say exactly
what changed.

The reverse is equally binding: if a maintainer re-applies `claude-blocked`,
it is blocked, whatever you concluded.

`claude-blocked` and `claude-ready` are **mutually exclusive** — an issue is
never both. If you find both, the block is stale; the queue label wins and the
engine repairs it.

**The trade-off, stated honestly:** the engine's rule is *positional* — ANY
maintainer comment after the block counts as the answer, even "hmm, looking
into this". It cannot read intent, and guessing at intent is how you get an
agent that argues with its owner. A settled-too-early question costs one
comment to re-block; a question the agent re-asks forever costs trust.

## 10. End-of-session duty — the changelog

Before finishing, append one entry to `docs/CHANGELOG-RECENT.md` (format
inside the file) and rotate the oldest entry beyond 10 into
`docs/changelog/ARCHIVE.md`. Writing the log is part of done.

---
_Per-issue overrides: an issue's **Out of scope** section and any instruction
in the triggering `@claude` comment layer on top of these rules._
