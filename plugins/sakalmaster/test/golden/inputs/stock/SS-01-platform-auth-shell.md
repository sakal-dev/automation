# Sakal Stock · 01 · Platform, Auth & Shell

> **Tier:** MVP · **Priority:** P0 · **Story prefix:** `SS-01-`
> **Consumes:** SaaS journeys (auth/roles/location), P16, `GET /pos/v1/settings/terminal`
> **Status:** 🔴 Planned

## What to build

The app frame and the safe way in. Bootstrap to the pos-flutter conventions (GetX + Drift + theme +
i18n), log in as owner/manager/stock-role against the POS API, **confirm the Inventory module is
enabled** (else refuse — there's nothing to operate), bind the device to **one location** (stock is
per-location), wire the **scanner** (USB HID + camera), and build the nav shell the operation modules
hang off. Every other epic depends on the location context and the scanner.

## Stories

### SS-01-01 · App bootstrap & architecture skeleton
**As a** developer
**I want** the app scaffolded to the shared conventions with a local capture DB
**So that** it's consistent with pos-flutter and can capture offline

**Acceptance criteria**
- [ ] AC-1 — `lib/app/` per README §2: `core/`, `data/{database,models,providers,repositories,services}`, `modules/{auth,lookup,count,receive,adjust,transfer,settings}`, `middleware/`, `routes/`, `theme/`, `components/`
- [ ] AC-2 — Dependencies: `get`, `drift` + `sqlite3_flutter_libs` + `drift_flutter`, `get_storage`, `dio`/GetConnect, `connectivity_plus`, a scanner/camera lib (e.g. `mobile_scanner`), `intl`; dev: `drift_dev`, `build_runner`
- [ ] AC-3 — Drift schema v1: `documents`, `document_lines`, `catalog_cache` (README §4)
- [ ] AC-4 — GetX routing; initial route by auth+location state (login → location pick → home)
- [ ] AC-5 — Theme + EN/KM i18n reuse the pos-flutter approach (brand, Kantumruy Pro)
- [ ] AC-6 — `core/` pure (variance math, document models, Luhn) — no Flutter imports

**Priority:** P0 · **Status:** 🔴

---

### SS-01-02 · Login (owner / manager / stock role)
**As a** stock clerk or manager
**I want** to log in with my SakalPOS account
**So that** I operate only my shop's stock

**Acceptance criteria**
- [ ] AC-1 — Login via `POST /auth/login` (POS API); token in secure storage; roles/permissions from the payload
- [ ] AC-2 — Allowed roles: owner / manager / a stock-scoped POS role (open question — default to manager+ if no stock role exists); a plain Cashier is refused with a clear message
- [ ] AC-3 — Handle shared edge responses: `409 password_change_required`, `403 pos_tenant_access_required` / deactivated tenant (SaaS journeys)
- [ ] AC-4 — `GET /auth/user` refresh on launch; logout clears token + caches
- [ ] AC-5 — Tenant scoping — only the user's company/locations are reachable

**Priority:** P0 · **Status:** 🔴

---

### SS-01-03 · Inventory-enabled gate + location binding
**As a** stock operator
**I want** the app to know which shop I'm counting and that inventory is on
**So that** every operation targets the right per-location stock

**Acceptance criteria**
- [ ] AC-1 — On login, read `GET /pos/v1/settings/terminal` → `data.inventory`; if `module_enabled=false`, show a "Inventory not enabled for this account" state and block operations (nothing to do)
- [ ] AC-2 — Location picker: choose from the user's locations (`GET /api/admin/locations`); persist the active `location_id`
- [ ] AC-3 — The active location is shown persistently in the header and stamped on every document (README §4)
- [ ] AC-4 — `require_location_selection` honoured — no operation can start without a location
- [ ] AC-5 — Location is switchable later (Settings), but an in-progress draft is tied to its original location
- [ ] AC-6 — Cache the inventory policy (`allow_negative_stock`, `show_stock_levels`) for offline reference

**Priority:** P0 · **Status:** 🔴

---

### SS-01-04 · Scanner input (USB HID + camera)
**As a** stock clerk
**I want** to scan barcodes with a sled or the camera
**So that** counting and receiving are fast

**Acceptance criteria**
- [ ] AC-1 — USB HID / keyboard-wedge scanner support via a raw-key listener (same idiom as POS FP-08 barcode burst)
- [ ] AC-2 — Phone camera scanning (`mobile_scanner`): continuous mode for rapid multi-scan
- [ ] AC-3 — `ScanService` emits a resolved product (via cached catalog or `GET /api/admin/inventories/scan`); unknown barcode → "not found — search or add" prompt
- [ ] AC-4 — Manual entry fallback (search by name/SKU) always available
- [ ] AC-5 — Scan feedback: sound + haptic + visual confirmation per scan; duplicate-scan handling defined per module (count vs receive differ)
- [ ] AC-6 — Scanner mode configurable (Settings, SS-11)

**Priority:** P0 · **Status:** 🔴

---

### SS-01-05 · Nav shell & i18n
**As a** stock operator
**I want** a simple home with the operations and my sync status
**So that** I can start a task in one tap

**Acceptance criteria**
- [ ] AC-1 — Home: big actions — Lookup, Count, Receive, Adjust/Waste, Transfer (shown per tier/permission); a **sync/outbox** indicator (queued/submitted/error counts → SS-02 diagnostics)
- [ ] AC-2 — Full EN/KM localization; Khmer font bundled
- [ ] AC-3 — Language switch applies immediately
- [ ] AC-4 — Active location + logged-in user always visible

**Priority:** P0 · **Status:** 🔴

## Dependencies
- **Backend** — POS auth; `GET /pos/v1/settings/terminal` (data.inventory) **(exists)**; `GET /api/admin/locations`, `…/inventories/scan` **(exists)**
- **Downstream** — every SS epic uses the shell, location context, scanner
- **Cross-repo** — pos-flutter auth handling, theme, i18n, FP-08 scanner idiom

## Test strategy
- **Unit (`core/`):** role gate (allowed vs refused); location-required rule; barcode resolution (cache hit/miss).
- **Widget:** login + edge states; inventory-disabled block; location picker; scan field (HID + camera) resolves a product; EN/KM swap.
- **Manual QA:** login on Android/iOS; disable Inventory on the tenant → app blocks; scan with a USB sled and the camera; switch location.

## References
- Auth/roles/location: [`00-saas-user-journeys.md`](../../../Business/specs/implementations/00-saas-user-journeys.md) · Settings contract: FP-24 decision log · Scanner: FP-08
