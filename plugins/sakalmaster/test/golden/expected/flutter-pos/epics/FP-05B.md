---
key: FP-05B
title: Store Setup (tenant first-run)
app: pos-flutter
priority: P1
consumes_raw: **Implements:** P01-getting-started.md (US-P01-02 business/tax/payment, US-P01-08 staff)
source: sakal-dev/pos-flutter:docs/specs/05b-store-setup.md@fp00000
---

## What this is (and isn't)

A **post-login, first-run** experience for the **owner/admin** of a tenant. It runs once per business, after [Terminal Setup](05-setup-wizard.md) + login, when the server says the tenant hasn't finished onboarding.

**Architecture decision (2026-06-01):** the **Laravel back-office owns tenant configuration** (business identity, tax, payment methods, products, staff — already built there: `CompanySeeder` etc.). Store Setup on the terminal is therefore a **guided confirm/checklist layer over server-synced data**, *not* a set of terminal-side editors. It nudges the owner through what's already configured, surfaces gaps, deep-links device-scoped bits (printer) to Terminal Setup, and flips an `onboarding_completed` flag so it doesn't reappear.

**Not here:** signup / phone-OTP / tenant provisioning (marketing site + backend, per P01); terminal-side *writing* of tax/payment/products/staff (back-office owns it).

## Dependencies (gating)

- **Backend (pos-laravel):** a tenant `onboarding_completed` flag exposed on `GET /pos/v1/auth/user` (or a settings endpoint) + a `POST` to set it. **Does not exist yet** — this spec is blocked until it does.
- **FP-01 (Auth)** — runs after login; owner/admin role gate (`UserModel.role`).
- **FP-02 (Sync)** — reads synced business/tax/payment/product data.
- **FP-06 (Product Import)** / **FP-27 (Team)** — the product + staff portions defer to those specs.

## Open questions

- Does the back-office already expose enough of the tenant config on `auth/user` / a settings endpoint for a read-only confirm layer, or do we need a dedicated `GET /pos/v1/onboarding` summary endpoint?
- Should "edit" actions deep-link to the back-office (web) or wait for terminal-side editors? (Default: deep-link; revisit per demand.)

## References

- Device bootstrap: [`05-setup-wizard.md`](05-setup-wizard.md)
- Product spec: `features/P01-getting-started.md`
- Tenant config source of truth: `pos-laravel` back-office (Company/Tax/Payment/Product/Staff)
