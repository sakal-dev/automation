# Storefront · 01 · Platform, Auth & Onboarding

> **Status:** 🟢 Built (scanned 2026-07-13 — pending verification) · **Story prefix:** `SF-01-`
> **Implements:** P15 customer app / P21 (customer identity) · auth foundation

## Implementation status (scanned)
Present in code: `modules/auth` (login, register, forgot/reset password, verify phone OTP, verify
email, complete profile/social) with bindings+controllers+views; `modules/onboarding` (splash,
walkthrough); `modules/dashboard` shell (bottom nav `custom_bottom_nav`, `side_drawer`); `services/
auth_service`; `data/providers/auth_provider`; `services/next_action_handler` (routes server
`next_action`, e.g. verify-phone/complete-profile). Endpoints: `customer/v1/auth/*`. i18n
(`core/translations`) + theme (`theme_service`). **Gaps/verify:** token refresh/expiry handling,
biometric lock (none seen), logout completeness.

## Stories

### SF-01-01 · Sign in / register (phone OTP + email + social)
**As a** customer **I want** to sign in with my phone or email **So that** I can order under my account
- [x] AC-1 — Login (`auth/login`), register (`auth/register`), `check_phone`
- [x] AC-2 — Phone OTP: `phone/send_otp` + `verify_otp`; email verify
- [x] AC-3 — Forgot/reset password: `password/forgot` + `verify_otp` + `reset`
- [x] AC-4 — Social sign-in → `social/complete_profile` when profile incomplete (via `next_action`)
- [ ] AC-5 — Token refresh/expiry → clean re-login (verify)
- [ ] AC-6 — Guest browse allowed pre-login (verify: can a user browse before auth?)

**Status:** 🟢 (AC-5/6 verify)

### SF-01-02 · Onboarding & splash
**As a** first-time user **I want** a short intro **So that** I understand the app
- [x] AC-1 — Splash → onboarding walkthrough on first run (`introduction_screen`)
- [x] AC-2 — Skips on subsequent launches (verify persistence)

**Status:** 🟢

### SF-01-03 · App shell & navigation
**As a** customer **I want** a clear nav **So that** I reach every area
- [x] AC-1 — Bottom nav (`persistent_bottom_nav_bar_v2`) + side drawer
- [x] AC-2 — Routed via `app_pages.dart`; initial = dashboard
- [x] AC-3 — EN/KM + theme switch (SF-13)

**Status:** 🟢

## Dependencies
- `services/auth_service`, `next_action_handler`; downstream: every epic needs the session.
- Backend: `customer/v1/auth/*` **(exists)**.

## Test strategy
- Verify: token lifecycle; guest-vs-auth gating; OTP edge cases (resend, expiry); social completion.

## References
- P15 (customer app) · Auth API `customer/v1/auth/*` · POS auth patterns: pos-flutter/CLAUDE.md
