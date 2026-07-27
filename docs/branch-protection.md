# Branch protection — recommendations, not actions

The review loop (`docs/task-contract.md` step 4b) enforces its preconditions
**engine-side**: `actions/review-state` reads the PR and refuses to merge when
any of them fails. That works on a bare repository with no protection rules at
all, which is deliberate — the engine must not require a paid plan or an
operator's admin rights to be correct.

But engine-side enforcement has one honest limit: **it only binds the engine.**
A human clicking Merge, a script with a token, or a future workflow nobody
remembers is not going through `review-state`. Branch protection binds
everybody. The two layers do different jobs and the belt-and-braces is the
point.

**Nothing in this repo applies these settings.** Protection rules change what a
repository owner can do to their own default branch; that is an operator's
decision, made once, with their eyes open. What follows is the recommendation
and the reasoning, so the decision is a short one.

## Recommended, per caller repo

Settings → Branches → branch protection rule on the default branch:

| Setting | Recommended | Why |
|---|---|---|
| **Dismiss stale pull request approvals when new commits are pushed** | ✅ on | An approval is of a diff, not of a branch. The engine already voids an approval whose commit is not the head, but only GitHub can stop a human merging on one. |
| **Require conversation resolution before merging** | ✅ on | Makes "approve-with-comments is not consent" true for humans too. Without it, a reviewer's open thread stops the bot and nothing else. |
| **Require a pull request before merging** · require ≥1 approval | ✅ on | Turns invariant 10's approval requirement into something the platform enforces. Note the interaction below. |
| **Require status checks to pass** — the repo's CI job | ✅ on | Same reasoning for the CI precondition. Do **not** also tick *Require branches to be up to date*: it makes every PR need a rebase after any merge to main, and rebasing a reviewed branch is exactly what invariant 11 forbids. |
| **Allow force pushes** | ❌ off | The cheapest possible enforcement of append-only. The engine detects a rewrite after the fact and stops; this prevents it. |
| **Allow deletions** | ❌ off | — |
| **Do not allow bypassing the above settings** | operator's call | Ticking it applies the rules to admins too. Safer, and it means the operator's own override (contract step 4b) has to be a deliberate un-tick rather than a reflex. Leave it off if you want the override to stay one click. |

## Interactions to know before you tick anything

- **"Require approvals" plus no reviewer identity = every agent PR stops.** If
  the repo has nothing that can approve, requiring an approval means agent PRs
  wait for a human, forever, silently. That may be exactly what you want; if it
  is not, land the reviewer identity first (SKA-011). The engine says so out
  loud — it comments once on any PR that needs an approval with no reviewer
  requested — but branch protection will not.

- **Approvals by bots count only if the bot is a real collaborator.** A GitHub
  App's review counts toward a required-approvals rule only when the app is
  granted access; a `github-actions[bot]` review does not. Check this before
  assuming the loop closes.

- **`Require branches to be up to date` fights append-only.** It forces a
  rebase or a merge-commit on every PR whenever main moves. A merge commit is
  fine (append-only); a rebase is not. If you tick it, expect the engine to mark
  PRs `review:broken-anchors` whenever someone rebases to satisfy it.

- **Required status checks are matched by name.** They must match the caller's
  CI job name and the engine's `ci_check_name` input, or you get a PR that the
  engine says is green and GitHub says is pending. The engine holds on that
  disagreement (GitHub wins) rather than merging, so the failure is a stall, not
  a bad merge — but it is still a stall.

## If you decide to apply them

One call per repo, run by the operator, not by the engine:

```bash
gh api -X PUT "repos/<owner>/<repo>/branches/main/protection" \
  -H "Accept: application/vnd.github+json" \
  -f 'required_status_checks[strict]=false' \
  -f 'required_status_checks[contexts][]=<ci-job-name>' \
  -f 'required_pull_request_reviews[dismiss_stale_reviews]=true' \
  -f 'required_pull_request_reviews[required_approving_review_count]=1' \
  -f 'enforce_admins=false' \
  -f 'restrictions=' \
  -f 'allow_force_pushes=false' \
  -f 'allow_deletions=false' \
  -f 'required_conversation_resolution=true'
```

Private repositories need GitHub Team or above for branch protection. On a plan
without it, the engine-side preconditions are the whole of the enforcement —
which is why they were built to stand alone.
