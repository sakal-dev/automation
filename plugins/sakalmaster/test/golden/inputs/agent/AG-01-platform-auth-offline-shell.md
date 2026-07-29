# SakalPOS Agent · 01 · Platform, Auth & Offline Shell

> **Tier:** MVP · **Priority:** P0 · **Story prefix:** `AG-01-` · **Journeys:** 1, 14
> **Status:** 🔴 Planned

## What to build

The frame + the offline engine. Bootstrap to the pos-flutter conventions (GetX + Drift + theme +
i18n), log in as an **agent**, load the agent's **assignment** (territory, allowed catalog, price
list, credit/stock limit, commission scheme), and build the **offline-capture engine** — sale /
collection / return / remittance / count **documents** captured to Drift and submitted when connected
(idempotent, retry, dead-letter after 5). This is the Stock/Garage pattern; every other epic captures
through it.

## Stories

### AG-01-01 · App bootstrap & architecture
- [ ] AC-1 — `lib/app/` per README §2; Drift schema v1 (`sales`, `collections`, `returns`, `remittances`, `stock_counts` + lines + media + caches)
- [ ] AC-2 — Deps: `get`, `drift`(+libs), `get_storage`, `dio`/GetConnect, `connectivity_plus`, camera/signature, `intl`; dev: `drift_dev`, `build_runner`
- [ ] AC-3 — GetX routing by auth + assignment state; theme + EN/KM i18n reuse pos-flutter
- [ ] AC-4 — `core/` pure (stock-recon math, account/balance math, commission accrual, price resolution, document models) — no Flutter imports

**Priority:** P0 · **Status:** 🔴

### AG-01-02 · Agent login & assignment
- [ ] AC-1 — Login via the POS API; token in secure storage; roles/permissions from the payload; **agent role** required
- [ ] AC-2 — Load assignment: territory/route, allowed catalog + **price list**, credit/stock limit, commission scheme *(Agent module — proposed backend)*
- [ ] AC-3 — Handle shared edges (`409 password_change_required`, `403 tenant_access`) per SaaS journeys
- [ ] AC-4 — Cache the assignment for offline; refresh on sync; logout clears token + caches

**Priority:** P0 · **Status:** 🔴

### AG-01-03 · Offline-capture engine (documents)
- [ ] AC-1 — Each field action (sale/collection/return/remittance/count) creates a document (`draft`) with lines + a client `uuid`; all local, no network in the capture path
- [ ] AC-2 — Drafts survive app kill/relaunch → resume
- [ ] AC-3 — Submit sets `queued`; `SyncService` submits when online; idempotent by `uuid`
- [ ] AC-4 — Retry with backoff; dead-letter after 5 → diagnostics (mirror Stock/POS)
- [ ] AC-5 — Append-only: submitted documents are immutable (corrections are new documents)

**Priority:** P0 · **Status:** 🔴

### AG-01-04 · Connectivity, sync & nav shell
- [ ] AC-1 — `ConnectivityService` → non-blocking "offline — will sync" banner; capture never blocked
- [ ] AC-2 — Home shell: my day (stock value, cash-in-hand, balance snapshot), actions (Sell, Collect, Receive, Return, Remit), outbox indicator
- [ ] AC-3 — Diagnostics: queued docs + media, errors + manual retry; last-synced
- [ ] AC-4 — EN/KM; nothing traps the UI in a spinner

**Priority:** P0 · **Status:** 🔴

## Dependencies
- **Backend** — POS auth **(exists)**; **Agent assignment** (allowed catalog, price list, limits, scheme) **(proposed — the gate)**
- **Downstream** — every AG epic captures through this shell
- **Cross-repo** — Stock/Garage offline pattern; pos-flutter auth/theme/i18n

## Test strategy
- **Unit (`core/`):** document state machine; idempotency; retry/dead-letter; assignment parse.
- **Widget:** login + edge states; offline banner; home shell; diagnostics + retry.
- **Manual QA:** login → assignment loads; act offline → syncs on reconnect; kill app mid-doc → draft restored.

## References
- Auth/roles: [`00-saas-user-journeys.md`](../../../Business/specs/implementations/00-saas-user-journeys.md) · Offline pattern: [`stock-flutter`](../../../stock-flutter/docs/specs/README.md) · Agent module: `pos-laravel/modules/Agent/`
