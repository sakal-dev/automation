# The reviewer — identity, trust, and what it may not do

The review loop (`docs/task-contract.md` step 4b) needs something to review. This
is that something: an agent that reads an agent's PR and submits a real GitHub
verdict under an identity that is **not the author's**.

Everything here is about identity. The review logic is the easy half; who is
speaking is the half that fails silently.

## Why there is no second GitHub App

The obvious design is a dedicated reviewer App. It was rejected (operator
doctrine, 2026-07-27): a second App is a second **install** in every customer
org — per-tenant ceremony, which `ZERO-CONFIG` forbids. One install per
customer, ever.

So the reviewer reuses an identity that is already present and already is not
the coder:

| Mode | Reviewer | Credential | Setup |
|---|---|---|---|
| **integrated** (`source: sakalmaster`) | the **SakalMaster App** — `sakal-master[bot]` | short-lived installation token, **minted server-side** by SakalMaster from an OIDC proof | none per repo |
| **standalone** (`source: github`) | **`github-actions[bot]`** | the job's own `GITHUB_TOKEN` | none at all |

Both are structurally different from the coder (`claude[bot]`, or a worker PAT),
which is the only property that matters.

## The two rules that hold this up

**1. The reviewer cannot merge — because merging needs `contents: write`.**

The reviewer job grants `contents: read`. The SakalMaster App installation is
granted `contents: read`. Merging a pull request writes to a branch, so it
requires `contents: write`; nothing on the reviewer path has it. This is not a
promise made in a prompt — it is the permission model.

> **Hard rider: the SakalMaster App must NEVER gain `Contents: Write`.**
> The moment it does, the reviewer silently becomes a merger and the separation
> between "judges the work" and "lands the work" is gone. If a future feature
> seems to need it, that feature needs a different credential, not this one.

**2. The App private key never leaves the server.**

The runner proves who it is with GitHub OIDC; SakalMaster verifies that against
GitHub's JWKS, maps the signed `repository` claim to the installation, and
returns a short-lived installation token. The key stays in SakalMaster's
function secrets.

The tempting shortcut — put the App id and private key in an org Actions secret
and use `create-github-app-token` — is **worse than it looks**. That key can
read every repository in the org. An org secret is readable by any workflow in
any repo in that org, including repos where agents write code. The path denylist
keeps agents out of `.github/**`, but a denylist is a guardrail, not a boundary.
Server-side custody makes the question moot.

**Verified live, and better than expected** (garage run `30329385895`,
2026-07-28): the mint returns a token **scoped to the calling repository only**,
not to the installation. Read off the real token, not off a settings page:

```
mint HTTP 200
permissions:  { contents: read, metadata: read, pull_requests: write }
expires_at:   2026-07-28T05:40:21Z   (59 minutes)
/installation/repositories → { "repos": ["sakal-dev/sakalpos-garage"], "total": 1 }
contents write → 403 "Resource not accessible by integration"
```

So a leaked reviewer token is a one-repo, one-hour, cannot-write-code
credential. The concentration risk below is about the App **private key** held
by SakalMaster, not about anything a runner ever holds. A repo that is not
linked gets a clean refusal — `403 "repository <owner/name> is not linked to a
SakalMaster app"` (verified from `sakal-dev/automation`, run `30329324668`).

## Platform key concentration — recorded, not hidden

Accepted deliberately, and written down here because a trust decision nobody
wrote down is a trust decision nobody can revisit:

**One credential — the SakalMaster App — now does three things:** it reads
repository contents for the citation verifier, it relays maintainer comments
into SakalMaster (SKM-013), and it submits code reviews. Compromise it and an
attacker can read all connected source, forge maintainer-attributed activity,
and approve pull requests.

Why it is accepted anyway:

- The alternative is a second install per customer org, and per-tenant ceremony
  is the thing this platform exists not to do.
- The key is server-side, in one place, rotatable in one place.
- The blast radius is bounded by the permission set, and the permission set is
  bounded by the rider above: **no `Contents: Write`.** A compromised reviewer
  can approve a PR; it cannot merge one, and it cannot push code.
- Approval alone never merges anything on the dangerous list — `needs-human-merge`
  is applied from a mechanical signal, before the model has an opinion.

The residual risk is real: an attacker with this key could approve a malicious
PR that a human then merges. That is why the merge preconditions require a human
for anything touching data loss, money, credentials, migrations, or deletes.

## Verdict discipline

A review that does not end in a verdict is not a review — it is a pile of
comments that decides nothing, and it was the twice-missed gap in SKA-001.
Enforced by construction in `actions/review-agent/submit.sh`, which refuses to
post:

- a review with no `verdict`, or a verdict that is not approve / comment /
  request-changes;
- an `approve` with no summary (no bare stamps);
- a `request-changes` that does not say **what would flip it to approve** — the
  coder gets two rework rounds, and "fix it" spends one of them on nothing.

Degraded outcomes are still verdicts. "This diff is too large to review
honestly" and "this PR is authored by the reviewer, so the platform cannot
review it" are both posted as real `COMMENT` verdicts asking for a human. A
reviewer that silently skips is worse than no reviewer, because the PR then
looks reviewed.

## Refute yourself first

A hallucinated `request-changes` burns one of two rework rounds and costs real
money. The prompt requires the reviewer to try to disprove each finding before
asserting it — open the file, check whether the guard already exists elsewhere,
check whether a test already covers it. A suspicion that cannot be verified
against the code is an open question in the summary, never a finding.

## The dangerous list over-triggers on purpose

Data loss, dropped tables and columns, deletes and cascades, production config,
migrations, credentials, money and idempotency paths. Detected mechanically from
the diff's **added** lines, before the model has an opinion, and any hit applies
`needs-human-merge` whatever the verdict says.

It is a substring-and-pattern matcher, so it fires on `old_total` and
`subtotal` as readily as on a real money path. That asymmetry is deliberate: a
false positive costs one label and one human glance; a false negative costs a
dropped table. The model is required to say, for each signal, whether it is
actually dangerous here — an unexamined flag is noise, and noise teaches people
to ignore flags.

The label is applied **before** the review is submitted, so even a review that
fails to post leaves the protection in place.

## Two states you must know about

**"Allow GitHub Actions to approve pull requests"** (org, or repo → Settings →
Actions → General). With it **off**, `github-actions[bot]` can comment and
request changes but cannot approve; the API returns *"GitHub Actions is not
permitted to approve pull requests"*. The reviewer detects this exactly and
**downgrades an approve to a comment that says so** — the verdict survives in
the text rather than being faked in the API, and auto-merge correctly keeps
waiting for a human approval. With it **on**, approvals count normally.

**The App permission-acceptance banner.** Raising an App's declared permissions
does not change any installation until an org admin accepts the update. Until
then the installation keeps the old set and review posting returns 403. The
reviewer names that specifically rather than failing generically, because it is
a one-time click and not a bug. Check the *granted* set, never the App's
settings page:

```bash
gh api orgs/<org>/installations \
  --jq '.installations[] | select(.app_slug=="sakal-master") | .permissions'
```

## The integrated path — LIVE as of 2026-07-28

Both blockers cleared, both verified first-hand rather than taken on report:

| Was blocking | State now | Evidence |
|---|---|---|
| `POST /functions/v1/github-app-token` did not exist (404) | **deployed** | `mint HTTP 200`, run `30329385895` |
| installation granted `pull_requests: read` | **`pull_requests: write`**, `contents` still `read` | `gh api orgs/sakal-dev/installations` |

The mint accepts **OIDC only** — no PAT fallback — so it cannot be exercised
from a laptop, which is the correct shape: the credential is reachable only from
a runner that GitHub itself vouched for.

The historical record of what was owed, kept because the failure modes are still
the ones to look for:

1. **`POST /functions/v1/github-app-token`** — verified absent (`HTTP 404`,
   2026-07-27). Takes an OIDC proof plus a requested permission set, returns a
   short-lived installation token for the calling repo. Without it there is no
   way to speak as the App from a runner without shipping the private key, and
   this engine will not do that. `reviewer.yml` fails **loudly** on the 404 and
   deliberately does **not** fall back to `github-actions[bot]`: a silent
   identity swap is exactly the class of bug this role exists to prevent.

2. **The Pull-requests permission, accepted on the installation.** Verified
   `pull_requests: read` on installation `148436031` (2026-07-27). Read cannot
   submit a review.

Until both land, run integrated repos with `reviewer_kind: github-actions` — the
standalone reviewer is a real, independent reviewer, just not the App one.

## The first live cycle — 2026-07-28, sakal-dev/sakalpos-garage#129

Run end to end on a real PR in a real linked repo, then closed without merging
and every temporary caller removed. What it proved, and what it broke:

| # | Event | Head | Result |
|---|---|---|---|
| 1 | reviewer runs | `3b68f04` | **COMMENT** — caught a planted false claim and *verified it against source*, citing `RULES.md:93` and `98-99`. Cost **$0.274738** (measured) |
| 2 | defect pushed | `1b0f067` | **CHANGES_REQUESTED** |
| 3 | defect extended | `ef42a18` | **CHANGES_REQUESTED** |
| 4 | rework round 2 | `98b5469` | coder appended a fix; `append-only (ahead) — thread anchors intact`; gate re-run **passed**; round marker `rounds=2` |
| 5 | re-review | `1867f2e` | **APPROVED** |
| 6 | merge gate | — | **HOLD** — 1 current approval, 0 change-requests, **3 unresolved threads** |

Step 6 is the one worth dwelling on. The reviewer approved, and the gate still
refused: docs-only waived CI and the approval, and the unresolved threads
blocked anyway. That is the carve-out's limit behaving exactly as written —
approve-with-comments is a comment, not consent.

### Two defects the loop could not have survived, both found by running it

**Every step in a closed agent loop is triggered by another bot**, and
`claude-code-action` refuses bot-triggered runs unless `allowed_bots` names the
trigger (its default is *no bots*). Two separate failures, one per direction:

- the **rework** is triggered by the reviewer → *"non-human actor: sakal-master
  (type: Bot)"* (run `30329768778`) → fixed in v2.6.2;
- the **re-review** is triggered by the coder's push → *"non-human actor: claude
  (type: Bot)"* (run `30330314097`) → fixed in v2.6.3.

Miss either and the loop half-works in the most misleading way available: the
first review lands and nothing after it ever does. Keep both allowlists tight —
never `*`, because the rework prompt is assembled from the review's text, so a
permissive list lets any App that can review the repo choose what the coder is
told to do.

**What did not go wrong, and mattered:** when the review model step died, submit
refused to post — *"the reviewer produced no findings file; an empty review is
not an approval."* A crashed reviewer did not silently approve a PR. The
verdict-discipline guard earned its place on its first real failure.

### One platform fact this settled

A review by the **SakalMaster App** (installation token) **does** trigger
workflows; a review by `github-actions[bot]` (GITHUB_TOKEN) does **not**
(constraint #7). So the loop closes automatically only in **integrated** mode —
in standalone mode the reviewer can post a verdict, but only a *human's*
request-changes starts a rework. One more reason the App identity matters.

## The provider seam

`actions/review-agent` speaks only JSON findings and the GitHub API. The model
sits between `preflight` and `submit` in `reviewer.yml`, and nothing on either
side knows which model it was. A Codex reviewer replaces that one step and
writes the same `.sakal-review.json`. Not built — there is no account, and the
lab's rule is no verdict without a run.
