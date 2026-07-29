# Which SakalMaster does this repo talk to?

One page, because the answer used to be spread across four files and the wrong
one was winning.

## The default is PRODUCTION

A repo that configures nothing reaches **production**
(`gubehzbezjkkszhwjjnj.supabase.co`). Staging is a deliberate override, never
something you arrive at by accident.

It was the other way round until 2026-07-29 (SKA-022). The engine hardcoded
staging's URL and key in four places — `sweep.yml`, `reviewer.yml`,
`claim-sakal`, `report-sakal` — written when staging was the only hosted
environment. It stopped being the only one when production went live, and
because `automation-install` onboards CUSTOMER repos with those same defaults,
a customer's agent would have claimed tasks from, and reported cost into, **our
staging project**. That is a data-boundary problem, not a config nit.

## Where the environment is named

Exactly one file: **`actions/resolve-env/action.yml`**. It maps
`production | staging | <empty>` to a URL and its matching publishable key, and
nothing else in the engine hardcodes either value. Adding an environment is one
edit in one place.

The URL and its key always travel together. Mixing a production URL with
staging's key produces a confusing auth failure rather than an obvious
misconfiguration, so `resolve-env` refuses a URL supplied without its key.

## How a repo chooses

The caller template is **byte-identical in every repo, forever**:

```yaml
jobs:
  sweep:
    uses: sakal-dev/automation/.github/workflows/sweep.yml@v2
    with:
      sakal_env: ${{ vars.SAKAL_ENV }}
    secrets: inherit
```

`SAKAL_ENV` is a **repository variable**, not a secret — the environment name is
not sensitive, and secrets cannot be read back for auditing. Unset (every
customer repo) resolves to production.

**Only the platform's own repositories set it**, to `staging`:

| repo | environment | how |
|---|---|---|
| `sakal-dev/automation` | staging | repo variable `SAKAL_ENV=staging` |
| `sakal-dev/sakalmaster` | staging | set the same variable **when it gains engine callers** — it has none today |
| everything else, including `sakalpos-garage` and `sakalpos-owner` | production | no variable set |

Why a variable and not a line in the YAML: the template stops differing per
repo, so there is nothing for the install skill to special-case and nothing to
drift. Changing a repo's environment becomes a settings change — no commit, no
PR, no engine release.

Note the template evaluates `vars.SAKAL_ENV` in the **caller**, where that
repository's own variables are unambiguously available. Nothing here depends on
whether a called reusable workflow can read the caller's `vars` context.

## The trade-off, stated

An override that lives in repo settings is **invisible in the repo's code**. You
cannot tell from the YAML which environment a repo talks to.

The compensation is that every run says so. `resolve-env` prints a `::notice`
and a step-summary table naming the resolved environment and project ref, so a
run log always answers "which SakalMaster did this talk to?" — which is the
question you will actually be asking at 2am.

## Self-hosted

Pass `sakal_supabase_url` **and** `sakal_supabase_publishable_key` explicitly.
Either one alone is refused. An explicit URL beats `sakal_env`.

## What moving environment does NOT do

Nothing migrates. Changing where a repo reports changes only where **future**
runs go: stories, journeys, epics, run records and cost already written to the
old environment stay there. Re-populating a new environment is the normal
onboarding flow (`/sakal-onboard`), never a row copy.
