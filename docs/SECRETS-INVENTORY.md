# Secrets inventory — names and locations ONLY, never values

Session-11 housekeeping. One row per credential that exists anywhere in the
sakal-dev automation estate. Audit rule: anything holding a secret that is
not on this list is a finding; anything on this list that stops existing
should be struck through with a date.

| # | Credential | Lives | Grants | Created | Rotation |
|---|---|---|---|---|---|
| 1 | `CLAUDE_CODE_OAUTH_TOKEN` (org secret) | GitHub org → Actions secrets, **all private repos** | agent thinks/writes in CI (methods 3) | 2026-07-23 (Team-plan cutover; repo copies deleted) | `claude setup-token` → paste in org UI. One place |
| 2 | "Sakal Master" GitHub App + private key | GitHub org app; key server-side (SakalMaster infra) | repo metadata/contents read; webhooks; the OIDC-mapped repo list | SM session ~16 | rotate key in App settings; SM ops |
| 3 | GitHub App / OAuth client secrets | `SakalMaster/.env` (local, gitignored) + deployed worker config | app auth flows | SM sessions | SM ops; rotate with #2 |
| 4 | `SAKAL_SIGNING_KEY` (ES256) | `SakalMaster/.env` + Supabase function config | signs session JWTs (token-exchange) | SM session 2 | SM ops runbook |
| 5 | Staging admin password (`admin@sakal.dev`) | `SakalMaster/supabase/.env.staging` (local) | staging platform admin | SM staging setup | **flagged in SM STATUS as temp — rotate** |
| 6 | Staging DB URL (superuser) | `SakalMaster/supabase/.env.staging` (local) | raw staging Postgres | SM staging setup | rotate DB password via Supabase dashboard if exposed |
| 7 | PAT "sakal-verify CI" (`verifier@sakal.dev`) | garage repo secret `SAKAL_TOKEN`? **No — staging DB row only**; used by SM's verify CI config | read+write as verifier | 2026-07-23 | revoke in app → re-mint |
| 8 | ~~PAT "garage sweep" (`garage-sweep@sakal.dev`)~~ | — | — | 2026-07-24 | **REVOKED 2026-07-24** (audit event logged): no consumer since OIDC; a future VPS worker mints fresh in 60s. *Don't keep a key for a lock that doesn't exist.* |
| 9 | Worker host env (`CLAUDE_CODE_OAUTH_TOKEN`, `GH_TOKEN`) | local test env file (chmod 600) / future `/etc/sakal-worker.env` | methods 4/5 agents + their PR pushes | 2026-07-23 (local drains) | per-host; delete local file when VPS lands |
| 10 | GitHub Actions OIDC | **nothing stored anywhere** | CI ↔ SakalMaster (claim/report/brief), repo→app mapped by signature | 2026-07-24 | nothing to rotate — that is the point |

**Resolved decisions:** org plan — upgraded to **Team** 2026-07-23 (org
secret live; the Free-plan per-repo layout is history). Integrated-mode
credentials — **OIDC, locked** (see SM `docs/notes/cowork-credentials-…`).
