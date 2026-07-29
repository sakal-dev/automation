# Owner App · 01 · Platform, Auth & Shell

> **Tier:** MVP · **Priority:** P0 · **Story prefix:** `OA-01-`
> **Consumes:** SaaS journeys (auth/roles), P11 (permissions), P16 (platform foundation)
> **Status:** 🔴 Planned

## What to build

The app frame and the secure way in. Bootstrap the Flutter app to the pos-flutter conventions
(GetX + theme + i18n) but **online-first** (no Drift). Owner/manager login against the existing POS
API (Sanctum token, roles/permissions payload), a **biometric app-lock** on top, **push
registration** (FCM/APNs), a **tenant + location context** service with an "All shops" selector, and
the nav shell every other epic hangs off. Reuse the POS auth edge-case handling exactly so behaviour
is consistent across surfaces.

## Stories

### OA-01-01 · App bootstrap and architecture skeleton
**As a** developer
**I want** the app scaffolded online-first to the shared conventions
**So that** it's consistent with pos-flutter but doesn't drag in the offline engine

**Acceptance criteria**
- [ ] AC-1 — `lib/app/` structure per README §2: `core/`, `data/{models,providers,repositories,stores,services}`, `modules/*`, `middleware/`, `routes/`, `theme/`, `components/`
- [ ] AC-2 — Dependencies: `get`, `dio` (or GetConnect), `firebase_messaging` + `firebase_core`, `flutter_secure_storage`, `local_auth`, `get_storage`, `intl`, a charts lib (`fl_chart`); **no Drift**
- [ ] AC-3 — GetX routing with initial route resolved by auth state (logged-out → login; logged-in → dashboard)
- [ ] AC-4 — Theme + EN/KM i18n reuse the pos-flutter approach (brand colours, Kantumruy Pro for Khmer)
- [ ] AC-5 — `core/` holds pure logic only (formatting, delta math) — no Flutter imports
- [ ] AC-6 — A single `ApiProvider` base with token injection + standard error mapping (401/403/409/timeout)

**Priority:** P0 · **Status:** 🔴

---

### OA-01-02 · Owner / manager login
**As an** owner or manager
**I want** to log in with my SakalPOS account
**So that** I see only my business

**Acceptance criteria**
- [ ] AC-1 — Login via `POST /auth/login` (existing POS API); store the Sanctum token in `flutter_secure_storage`
- [ ] AC-2 — Only `owner` / `manager` (tenant) roles may use the app; a Cashier-only account is refused with a clear message (read `role`/`roles`/`permissions` from the auth payload — SaaS journeys doc)
- [ ] AC-3 — Handle the shared edge responses: `409 password_change_required` → prompt to change password (link to web) and block; `403 pos_tenant_access_required` / deactivated tenant → "account access removed" state, not a bad-credential error
- [ ] AC-4 — Google sign-in optional (same as web owners), if trivial; else defer
- [ ] AC-5 — `GET /auth/user` refresh on launch keeps roles/permissions current; token expiry → clean re-login
- [ ] AC-6 — Logout clears the token + cached data

**Priority:** P0 · **Status:** 🔴

---

### OA-01-03 · Biometric app-lock
**As an** owner
**I want** the app locked behind Face/fingerprint
**So that** my business numbers are safe if someone grabs my phone

**Acceptance criteria**
- [ ] AC-1 — `local_auth` gate on launch + on resume-from-background after a configurable timeout
- [ ] AC-2 — Fallback to device passcode if biometrics unavailable
- [ ] AC-3 — Toggle in Settings (default on); disabling requires re-auth
- [ ] AC-4 — Lock never blocks incoming push alerts from being delivered (they show; opening a sensitive detail requires unlock)

**Priority:** P0 · **Status:** 🔴

---

### OA-01-04 · Push registration
**As an** owner
**I want** the app registered for push on this device
**So that** alerts and approval requests reach me

**Acceptance criteria**
- [ ] AC-1 — On first login, request notification permission and obtain the FCM token (APNs on iOS)
- [ ] AC-2 — Register the device: `POST /api/owner/devices` with token, platform, tenant, user *(backend dependency — proposed endpoint; flag)*
- [ ] AC-3 — Token refresh re-registers; logout de-registers the device
- [ ] AC-4 — Foreground + background + terminated-state delivery handled; tapping a notification deep-links to the right screen (alert / approval)
- [ ] AC-5 — Graceful when permission denied (in-app alert inbox still works — OA-03)

**Priority:** P0 · **Status:** 🔴

---

### OA-01-05 · Tenant + location context and nav shell
**As an** owner with one or more shops
**I want** to pick which shop I'm looking at (or all)
**So that** every screen reflects the right scope

**Acceptance criteria**
- [ ] AC-1 — `TenantContextService` loads the owner's company + locations from the auth/context payload
- [ ] AC-2 — A persistent location selector in the app header: "All shops" (aggregate) + each location; selection propagates to every data screen (dashboard, reports, sessions, alerts)
- [ ] AC-3 — Single-location owners see no selector (auto-scoped)
- [ ] AC-4 — Multi-location selection is **tier-gated** (Growth/Scale, P17) — single-location owners on Starter still see their one shop; the "All shops/compare" surfaces show an upgrade hint if not entitled
- [ ] AC-5 — Bottom-nav (or drawer) shell: Dashboard · Reports · Alerts · (More: Sessions, Team, Audit, Billing, Settings) — items shown per permission
- [ ] AC-6 — Selected location + last tab persist across launches

**Priority:** P0 · **Status:** 🔴

## Dependencies
- **Backend** — existing POS auth API; **proposed** `POST /api/owner/devices`, tenant/location context in the auth payload
- **Downstream** — every other OA epic uses the shell, context selector, and token
- **Cross-repo** — reuse pos-flutter auth edge-case handling (SaaS journeys doc), theme, i18n

## Test strategy
- **Unit (`core/`):** role-gate logic (owner/manager allowed, cashier refused); error mapping (401/403/409); location-scope propagation.
- **Widget:** login form + edge-response states; biometric gate on resume; location selector propagation; permission-filtered nav.
- **Manual QA:** login on iOS + Android; receive a test push and deep-link; deactivated-tenant login shows the right state; single vs multi-location.

## References
- Auth/roles/tenant: [`00-saas-user-journeys.md`](../../../Business/specs/implementations/00-saas-user-journeys.md) · Permissions: P11 · Tiering: P17 · POS auth handling: pos-flutter/CLAUDE.md
