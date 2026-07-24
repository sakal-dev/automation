# Credentials required — the one checklist

The single source of truth for **every password/token/key** the Sakal system
needs: what it is, why, who owns it, how to make it, and whether a *customer* ever
touches it. Grounded in the real variable names in this repo
(`workers/headless-loop/env.example`, the fleet compose) and SakalMaster's
`docs/ZERO-CONFIG.md` + `docs/STATUS.md`.

> **AGENT RULE (read before asking for anything).** When you (any Claude session)
> hit a step that needs a credential, do NOT improvise, and do NOT invent a
> per-repo secret setup. Do this instead:
> 1. Run the **three zero-config tests** (below). If the platform can *derive* or
>    *do* it, there is no credential to ask for — wire the server-side path.
> 2. If it is genuinely irreducible, find its row in this file, and hand the user
>    the **exact "How to create"** steps from here — nothing improvised.
> 3. If the credential isn't in this file, STOP and ask the user to add it here
>    first. The checklist is the contract; chat is not.
>
> This exists because credentials were explained inconsistently in chat and the
> GitHub-App vs GitHub-PAT vs Supabase-account distinction got muddled. One
> muddle like that is a bug; repeating it is not allowed.

## The three zero-config tests (apply BEFORE treating anything as "needed")

1. **Can the platform derive it?** URL, project id, app key, repo→project→app
   links, and *reading* a repo's files all follow from the GitHub App the customer
   already installed. Those are **not** secrets to hand-enter.
2. **Can the platform do it server-side?** Verification is pure code → the platform
   runs it off the webhook (no CI, no secret). See ZERO-CONFIG.md.
3. **Is it irreducible?** A credential is legitimate ONLY where the customer's own
   compute runs the work (a VPS/CI agent runtime). Everything else is a smell —
   invert it to server-side.

A credential earns a row below only if it passes test 3. Everything else the
platform handles; customers configure nothing.

## Summary — every credential at a glance

| # | Credential (exact name) | The door it opens | Who mints it | Whose account | Customer ever touches it? |
|---|---|---|---|---|---|
| 1 | `CLAUDE_CODE_OAUTH_TOKEN` | lets the agent **think/write code** | `claude setup-token` | an Anthropic account (dedicated ideally) | only if they self-host robots; else hosted/connect-once |
| 2 | `GH_TOKEN` (worker PAT) | VPS worker **pushes + opens PR** (methods 4/5) | GitHub → Settings → Developer → PAT | a **GitHub machine/agent account**, never personal | no — hosted robots use the platform's; self-host only |
| 3 | **"Sakal Master" GitHub App** | **read** code, webhooks, repo picker, server-side verify | already created (org App) | the org (installed once) | **yes — the only thing a base customer does: install + link** |
| 4 | *write* GitHub App **or** claude-code-action token | method-3 (`@claude`/sweep) **opens PRs** in Actions | App you register for the action | the org (separate, write-scoped) | only if they enable in-Actions robots |
| 5 | `SAKAL_TOKEN` (`sakal_pat_…`) | worker/CI **claims tasks + reports runs** to SakalMaster | SakalMaster app → profile → API tokens | a **SakalMaster agent account** (Supabase user), never personal | no — auto-provisioned per org on connect |
| 6 | `SAKAL_SUPABASE_URL` + `SAKAL_SUPABASE_PUBLISHABLE_KEY` | which backend + its public key (the SUPABASE project origin, NOT the web app) | copy from the project | n/a (URL + publishable key, both public) | no — derived from the connection |
| 7 | `PROJECT` + `APP` | *which* project/app to act on | copy the ids | n/a (selectors, not secrets) | no — derived from the link |
| 8 | Production platform secrets | run the hosted platform itself | operator (you) | the platform (one instance) | **never** — operator-only, not per customer |

Rule of thumb from the table: **a base customer touches exactly ONE row (#3).**
Everything else is either operator setup (you, once) or a self-hosting power-up.

---

## 1. `CLAUDE_CODE_OAUTH_TOKEN` — the AI credential

- **What:** the token that lets Claude actually run and write code.
- **Why:** methods 3/4/5 run a real Claude agent; it needs an Anthropic credential
  to think. Without it the worker can poll and clone but produces nothing.
- **Who uses it:** every execution runtime (VPS worker, Actions job, SDK worker).
- **How to create:** run `claude setup-token` on the machine/account that will pay
  for the usage → paste the printed token into the runtime's env/secret.
- **Account:** an Anthropic account. For a fleet, one per replica is cleanest.
- **Live example (worker env):**
  ```
  CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-…   # from `claude setup-token`
  ```
- **Customer path:** self-hosters mint their own; the product path is hosted
  robots (platform pays, billed to plan) or a one-time "Connect Claude" button —
  never a per-repo paste (ZERO-CONFIG §agent-runtime).

## 2. `GH_TOKEN` — the VPS worker's GitHub write PAT (methods 4/5)

- **What:** a GitHub **Personal Access Token** with **issues + contents +
  pull-requests: write** on the target repo.
- **Why:** a VPS/SDK worker clones the repo, pushes a branch, and opens a PR. That
  needs a write credential. (Your `env.example` note: *"PRs opened with it trigger
  CI — never the workflow GITHUB_TOKEN trap."* A PR opened by the built-in Actions
  token is inert; this PAT's PRs fire CI.)
- **Who uses it:** methods 4 (headless loop) and 5 (SDK worker) only. **NOT** the
  App — the App is read-only (row 3). This is the credential that made my earlier
  "always the App" wrong.
- **How to create:** GitHub → Settings → Developer settings → Personal access
  tokens → Fine-grained token → scope it to the one repo, grant Contents/Issues/
  Pull requests write → generate → copy.
- **Account:** a **dedicated GitHub machine account** (e.g. a `sakal-bot` user),
  **never your personal account** — so PRs are attributed to the bot and you can
  revoke it without locking yourself out.
- **Fleet (correctness, not preference):** one `GH_TOKEN` **per replica**, each
  from a distinct account. Your `methods/07` proved shared-token replicas get
  their label writes eaten by GitHub secondary rate-limiting → stuck claims. The
  fleet compose overrides `SAKAL_TOKEN`/`GH_TOKEN` per replica for this reason.
- **Live example (fleet compose, per replica):**
  ```
  replica-a:  environment: { GH_TOKEN: ${GH_TOKEN_A}, SAKAL_TOKEN: ${SAKAL_TOKEN_A} }
  replica-b:  environment: { GH_TOKEN: ${GH_TOKEN_B}, SAKAL_TOKEN: ${SAKAL_TOKEN_B} }
  ```
- **Customer path:** hosted robots use the platform's own git access; a self-hoster
  supplies their own PAT. Never asked of a base customer.

## 3. "Sakal Master" GitHub App — the read/verify brain (base customer's ONE step)

- **What:** the org GitHub App you already created
  (`sakal-dev/settings/apps/sakal-master`). Permissions: **Metadata / Contents /
  Pull requests — read** (confirmed read-only in STATUS.md).
- **Why:** repo picker, receives `push`/`pull_request` webhooks, and — the big one
  — **server-side verify-on-merge**: on a push the webhook mints this App's
  installation token, reads the cited files at the sha, runs the verifier, writes
  the result. Zero customer config.
- **Who uses it:** SakalMaster (webhook + verifier + repo list). `github@` and
  `verifier@` write the results.
- **How to create:** already done. For a new org: the customer **installs** it and
  **links a repo** — that's the entire base onboarding. The bot Supabase account is
  auto-provisioned on connect (`link_github_installation`).
- **Account:** installed on the org; identity is the App bot.
- **Read-only on purpose:** it physically cannot modify anyone's code — the safety
  promise that makes "install this App" acceptable to every customer.
- **Customer path:** **this is the one and only credential step a base customer
  does.** Everything else is derived or auto-made.

## 4. Write-capable GitHub App (or claude-code-action token) — method 3 PRs

- **What:** the credential claude-code-action uses to open PRs from inside GitHub
  Actions (method 3). Needs **write**; distinct from row 3's read-only App.
- **Why:** row 3 can't write. In-Actions robots (method 3, the garage sweep) need a
  write path whose PRs trigger CI (the "app-token PRs" note in NOTES.md).
- **Open decision (flag, don't guess):** whether this is a *second* dedicated
  GitHub App or claude-code-action's built-in token — confirm on GitHub and name it
  here once known. Keep it **separate from "Sakal Master"** so read-only stays
  read-only (least privilege; base customers never grant write).
- **Customer path:** only customers who enable in-Actions robots.

## 5. `SAKAL_TOKEN` — the SakalMaster service PAT (integrated mode)

- **What:** a SakalMaster personal access token (`sakal_pat_…`) for a service
  account, hashed server-side.
- **Why:** in `source: sakalmaster` mode the worker/CI exchanges it at
  `token-exchange` for a short-lived JWT, then claims tasks and reports runs — so
  History honestly says *the agent* did it, not you.
- **Who uses it:** the sweep/worker in integrated mode; the CI run-reporter.
- **How to create:** SakalMaster app → profile → API tokens → new (read+write) →
  copy the `sakal_pat_…` value once.
- **Account:** a **dedicated SakalMaster agent account** (Supabase user with an
  `is_agent` people row), never your personal login. This is the "separate account
  inside Supabase" — it exists purely for honest attribution.
- **Live example (worker env, sakalmaster mode):**
  ```
  SAKAL_URL=https://<project>.supabase.co
  SAKAL_ANON_KEY=<public anon key>
  SAKAL_TOKEN=sakal_pat_…      # dedicated agent account, not yours
  PROJECT=<project-uuid>
  APP=<app-key>                # required once sakalmaster#1 (app filter) lands
  ```
- **Customer path:** **auto-provisioned** — a new org's agent account is created on
  connect; the customer mints nothing. (STATUS.md: "a new org needs nothing but
  'connect GitHub'.")

## 6–7. `SAKAL_URL`, `SAKAL_ANON_KEY`, `PROJECT`, `APP` — not secrets

- **What:** backend URL, the **public** anon key, and the project/app selectors.
- **Why listed:** the worker needs them in sakalmaster mode, but they are
  **derivable/public** — the anon key ships in the web bundle by design; URL/
  project/app follow from the connection. **Do not treat these as secrets to
  hand-wire per repo** (that was the STEP-3 mistake). Derive them from the link.

## 8. Production platform secrets — operator-only, ONE instance

- **What:** hosted Supabase service/secret keys, `SAKAL_JWT_SECRET` (ES256 signing
  key), the GitHub App **private key**, the webhook signing secret.
- **Why:** to run the hosted platform. See SakalMaster `PROMPT-17` + `DEPLOY.md`.
- **Account:** the platform's, provisioned once by you (the operator).
- **Not the smell:** this is operator setup for a single instance — **not**
  per-customer. A *customer* signing up must never be handed any of these. If a
  step ever asks a customer to set a platform secret, it's wrong — invert it.
- **Rotation:** any secret ever pasted into a chat is compromised — rotate it.
  Keep an inventory (names + locations, never values) per SakalAutomation
  `PROMPT-11` `SECRETS-INVENTORY.md`.

---

## Which of these do I need, by scenario?

- **Base customer (tracking + verify only):** row 3. That's it.
- **You dogfooding a VPS worker now (method 4/5, github mode):** rows 1 + 2
  (+ SOURCE=github, REPO). No SakalMaster token yet.
- **You dogfooding the fleet:** rows 1 + 2, **one set per replica**, distinct
  accounts.
- **Integrated flip (garage → SakalMaster):** add row 5 (+ URL/anon/project/app,
  rows 6–7), a dedicated agent account.
- **Standing up production:** row 8, operator-only.

## Where this is referenced (so agents find it)

- SakalAutomation `CLAUDE.md`, `automation-install` + `automation-operate` skills:
  "need a credential → this checklist."
- SakalMaster `docs/ZERO-CONFIG.md`: the principle; this file: the concrete list.
- Worker `env.example` files: the shapes; this file: the why + how + whose account.
