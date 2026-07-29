# Flutter POS · 01 · Auth & Security

> **Implements:** P16-platform-foundation.md (US-P16-03, US-P16-07), P05-cash-and-sessions.md (US-P05-06)
> **Status:** 🟢 Mostly done (audited 2026-06-11, POS-037) — email login with token rotation + 401 latch, PIN login (device-PIN online/hybrid; `local_users` full-offline), remember-device, persisted throttle ladders on every entry surface, manager-PIN gate (server-verify online; local owner/manager offline), post-login route decider, logout/forget-device with queued revocation. The offline-first rebuild (POS-021 + FP-35, week of 2026-06-11) SUPERSEDED the server-only world this spec originally described — reconciled below. POS-037 closed the offline idle-lock gap (local-user unlock). POS-034 (2026-06-12) closed the forgot-password link (FP-01-07 — already rendered since 43c4104; verified + negative-tested). Open: multi-user picker (deferred P1).
> **Priority:** P0
> **Story prefix:** FP-01-
> **Last updated:** 2026-06-11

## Decision log

- **2026-06-11 (POS-037) — Full-offline idle-lock unlock now verifies against `local_users`.** The lock screen verified only the server endpoint + the cached device PIN — both absent on an offline-tier terminal — so it dead-ended with "connect to the internet to unlock" on a device that is offline BY DESIGN (recoverable only via sign-out). New pure rule `core/terminal/offline_unlock_rule.dart`: the signed-in cashier's OWN PIN unlocks; an **owner/manager** PIN unlocks as the offline manager override (same `roleCanApprove` privilege as refunds); another cashier's PIN does not. Failures feed the same persisted `pin_unlock` throttle; offline unlocks queue an audit row with `unlocked_by` + `override`. Tests: `offline_unlock_rule_test.dart`, `terminal_security_offline_unlock_test.dart`.
- **2026-06-11 (POS-037) — Superseded-by-rebuild notes.** POS-021 (`ab1ec49`) + FP-35 added: `local_users` (Drift) with PBKDF2 PINs + roles (owner/manager/cashier, `core/auth/local_user_role.dart`), offline PIN login (`PinLoginController.isOfflineLogin` branch), owner-unlock of a throttle lockout on the pre-auth PIN screen (`canOwnerUnlock`), role matrix (approve/admin/owner gates), license gating. Where this spec said "Sanctum token required", the full-offline tier now runs token-less sentinel sessions (`AuthService.offlineToken`); online/hybrid behaviour is unchanged.
- **Hybrid token expiry model (audited, works):** any non-login 401 → `applyAuthResponseEffects` → `AuthService.handleUnauthorized` → single guarded logout with "Session expired" notice (storm-latch `_handlingUnauthorized`, cleared on next successful login). PIN login additionally pings `/auth/user` post-verify and drops creds on an explicit revocation. There is NO token refresh by design — Sanctum tokens are long-lived; re-auth = re-login. Tested in `base_provider_test.dart` (8 cases incl. the login-path exemption + 429 notice).
- **Logout clears credentials, NEVER business data (audited):** `logout()` clears token (memory-first, then keystore), `user`, `session_id`, `terminal_locked`, queues server revocation when offline (`queued_revocation_token`); `forgetThisDevice()` additionally clears PIN hash, `remembered_until`, `pin_prompt_skipped`, `last_user_email`. Orders / master data / register assignment are untouched. Tested: `auth_service_forget_device_test.dart`, `logout_guard_test.dart` (pending-orders confirm copy).

## Auth surface interaction matrix (who unlocks what, in which mode)

| Surface | Online / Hybrid | Full-offline (FP-35) |
|---|---|---|
| **Email login** (`auth/`) | Sanctum login → token rotation into keystore; tenant binding; `last_user_email` pre-fill | n/a — no server; offline tier uses local-user PIN login |
| **Pre-auth PIN login** (`pin_login/`) | Device PIN (`SecurePinStore`, PBKDF2) → `/auth/user` ping (401 → drop creds; network error → proceed offline-first) | `local_users.authenticateByPin` → token-less session (`loginOffline`); lockout ladder + **owner-unlock** of a lockout (POS-021) |
| **Post-auth idle-lock screen** (`terminal_security/`) | Server `unlockTerminal`; unreachable → cached device PIN; manager override via server verify-PIN dialog | **POS-037:** own local-user PIN, or owner/manager PIN (= offline override, audited); no network attempt at all |
| **Manager-PIN approval dialog** (refund / force-close / discount) | Server verify → 60s `approval_token`; PINs never cached on-terminal (FP-01-06) | Offline approver verifies owner/manager `local_users` PIN via `roleCanApprove` (POS-021 role matrix) |
| **Throttles** | One persisted ladder per surface (`throttle.email`, `throttle.pin_login`, `throttle.pin_unlock`) — rehydrated on cold start, cleared on success | Same stores, same ladders (shared `LoginThrottle` / `PinUnlockThrottle`) |
| **Lock persistence** | `terminal_locked` survives cold start (route decider: locked outranks PIN); logout clears it | Same; the POS-037 unlock path is the non-destructive exit |

## Stories

### FP-01-01 · Email + password login
**Acceptance criteria**
- [x] AC-1 — Login form per the Sign-In mockup (`auth_view.dart`); obscured password with reveal.
- [x] AC-2 — Sanctum bearer rotated atomically into `flutter_secure_storage` + in-memory `_cachedToken` for sync reads (`AuthService.login`, US-02-02). Per-device token name via `core/auth/device_name.dart` (tested).
- [x] AC-3 — Server error surfaced verbatim; field-level blame never revealed.
- [x] AC-4 — Spinner + disabled form during the request (`AuthController`).
- [x] AC-5 — Network failure → retryable error state.
- [x] AC-6 — Post-login: terminal-settings sync (best-effort with honest toast), tenant binding (mismatch aborts — in-place tenant switch forbidden, US-19-04), session reconcile, then FP-01-05 routing.

**Status:** 🟢 Done

---

### FP-01-02 · PIN login (fast re-entry)
**Acceptance criteria**
- [x] AC-1 — Avatar card (initials helper), PIN pad, "Not you? Use email" (`pin_login_view.dart`).
- [x] AC-2 — PBKDF2-SHA256 local verify (`PinHasher`, self-describing format, constant-time — tested in `pin_hasher_test.dart`).
- [x] AC-3 — `/auth/user` ping on success: 200 → route; explicit 401 → drop creds + email login; network error → proceed offline-first (`_pingAuthUser`).
- [x] AC-4 — Shake + clear on failure; attempts-remaining copy.
- [x] AC-5 — Progressive ladder via shared `LoginThrottle`, persisted (`throttle.pin_login`), countdown UI; owner-unlock of a lockout on offline terminals (POS-021).
- [x] AC-6 — Tap + physical keyboard digits.
- [x] AC-7 — PIN seeding prompt after a remembered email login (`pin_setup_prompt_dialog.dart`, `pin_prompt_skipped` flag); also in Settings ▸ Terminal Security.
- [x] AC-8 *(rebuild)* — Full-offline tier: verify against `local_users` and start a token-less session (`isOfflineLogin` branch; `pin_login_offline_test.dart`).

**Status:** 🟢 Done

---

### FP-01-03 · Remember this device + token storage
- [x] AC-1–AC-5 — Built as specified: default-checked 30-day remember, `remember_device.dart` pure window check (tested), launch routing via the shared route decider, expiry cleanup, "Forget this device" (`clearRememberedDeviceState` — exact wiped-key set unit-tested in `auth_service_forget_device_test.dart`; business data untouched).
- [ ] AC-6 — Multi-user picker carousel: **deferred P1** (single remembered user + "Not you?" + Switch User covers 80%). Note: the offline tier's `local_users` login is effectively a multi-user surface already — re-evaluate whether the online picker should reuse it.

**Status:** 🟢 Done (AC-6 deferred)

---

### FP-01-04 · Rate limiting and brute-force protection
- [x] AC-1 — Shared ladder on all four surfaces (email, PIN login, lock-screen unlock, manager dialog) — see matrix.
- [x] AC-2 — Live countdown banners on email + PIN screens.
- [x] AC-3 — Persisted + rehydrated across force-quit (`throttle_persistence.dart` — load/save/clear, surface isolation, malformed-data fallback all unit-tested; cold-start rehydration proven in `terminal_security_controller_unlock_test.dart` "persisted cooldown is rehydrated on init").
- [ ] AC-4 — Per-user throttling: deferred with FP-01-03 AC-6.
- [x] AC-5 — HTTP 429 → persistent "Account temporarily locked" notice (`applyAuthResponseEffects`, tested incl. on-login-path behaviour).

**Status:** 🟢 Done (AC-4 deferred)

---

### FP-01-05 · Post-login routing
- [x] AC-1–AC-5 — Built; single pure decider (`core/auth/route_decider.dart`) consumed by 4 callers; truth table tested across every flag combination + offline variants (`route_decider_test.dart`, `route_decider_offline_test.dart`). Locked outranks PIN; setup-incomplete outranks all.

**Status:** 🟢 Built (pre-POS-037 audit, re-verified)

---

### FP-01-06 · Reusable Manager PIN gate dialog
- [x] AC-1–AC-5 — Built (server-verify model, 60s approval token, tiered `ManagerApprovalThrottle` with no-reset strikes + admin alert at 10, non-dismissible barrier). Evidence unchanged from the prior pass.
- [x] AC-6 *(superseded)* — The original deferral ("offline manager approval expands attack surface") was resolved differently by the offline-first phase: the FULL-OFFLINE tier approves against owner/manager `local_users` PINs via the role matrix (POS-021) — credentials that already live on the device, so no added blast radius. Online/hybrid stays server-verify-only as designed.

**Status:** 🟢 Built

---

### FP-01-07 · Forgot-password link to dashboard reset
- [x] AC-1–AC-6 — **CLOSED (POS-034, 2026-06-12).** The pure URL builder (`core/auth/forgot_password_url.dart` — strips `/api`, appends `/forgot-password`, email pre-fill) is rendered on the email/hybrid login card as the `auth.forgot` link (`auth_view.dart` `_RememberAndForgot`), opens via `url_launcher`, and shows the offline-disabled tooltip when there's no network (`AuthController.hasNetwork`). The render actually shipped in 43c4104 (2026-05-27), pre-dating POS-037's audit note — POS-034 verified it, added the negative test (the link is correctly ABSENT on the offline PIN-login card, which has no password to reset), and closed this. Tests: `auth_view_test.dart` (visible in email card) + `pin_login_view_test.dart` (absent on PIN card).

**Status:** 🟢 Done (link rendered + tooltip + tested)

---

## Dependencies

- **FP-35 (Offline Mode)** — local users, token-less sessions, license gating (audit citations above)
- **FP-04 (Idle Lock)** — lock policy + lock screen; POS-037 unlock rule
- **FP-02 (Offline & Sync)** — queued token revocation flush; offline session reconcile
- **FP-19 / FP-21** — register picker destination; Terminal Account page

## Test strategy (current coverage)

- **Unit:** `pin_hasher`, `login_throttle`, `pin_unlock_throttle`, `manager_approval_throttle`, `throttle_persistence`, `remember_device`, `route_decider(+offline)`, `device_name`, `forgot_password_url`, `logout_guard`, `local_user_role`, `offline_unlock_rule` (POS-037)
- **Controller:** `base_provider_test` (401/429 effects incl. login-path exemption), `auth_service_forget_device_test` (exact wiped-key set), `pin_login_controller/lockout/offline` tests, `terminal_security_controller_unlock/override` + `terminal_security_offline_unlock_test` (POS-037)
- **Manual QA:** 30-day expiry on a real device; offline PIN login after network kill; manager dialog from refund + discount; offline idle-lock → owner override

## References

- Product specs: P16 (US-P16-03/07), P05 (US-P05-06)
- Commits: POS-021 `ab1ec49` (lockout + role matrix), offline-first phase (FP-35), POS-037 (offline unlock rule)
- Design: `design/Sign In _ Light.png`, PIN + lock screen mockups
