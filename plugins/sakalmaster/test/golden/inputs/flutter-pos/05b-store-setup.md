# Flutter POS · 05b · Store Setup (tenant first-run)

> **Implements:** P01-getting-started.md (US-P01-02 business/tax/payment, US-P01-08 staff)
> **Status:** 🟡 All six steps built — Step 1 (Business Details, POS-014; **upgraded POS-051**) + Step 2 (Currency & Tax, POS-015; **+ country currency-suggestion, POS-051**) + Step 3 (Pair Printer, POS-016) + Step 4 (Payment Methods, POS-017) + Step 5 (Add Your Products, POS-018; **routed CSV import + template cleanup, POS-056**) + **Step 6 (Setup Summary & Finish, POS-057** — replaced the cut First-Sale Demo). The flow is end-to-end and `onboarding_completed` now flips at the Summary step's **Complete Setup**. **POS-051 (2026-06-12) closed the Step-1 logo stub** (real upload → normalize → owned-dir copy → renders on the preview + receipts), added a **business COUNTRY selector** + a **dial-code selector** (one `core/setup/countries.dart` list, ~25 launch countries), and a **receipt preset strip** above the live preview. Kept 🟡 for the remaining honest fragments: Step-2 KHR-base is "limited support"; the Summary UI is PROVISIONAL (existing chips/cards — pending the owner's mockup eye).
> **Priority:** P1
> **Story prefix:** FP-05B-
> **Last updated:** 2026-06-13 (POS-058 — setup-completion gate; closes the POS-014 carry-forward)

> **POS-058 (2026-06-13) — Setup-completion gate (closes the POS-014
> carry-forward "post-login onboarding-incomplete redirect deferred").** Owner
> order (2026-06-12): no admin/POS surface is reachable until the Store Setup
> wizard is complete. A new **`SetupGateMiddleware`** (composes *after*
> `AuthMiddleware`; pure rule in `core/setup/setup_gate.dart`) redirects an
> authenticated terminal with `!onboarding_completed` into the wizard, carrying
> the attempted route as `returnRoute` so **Complete Setup** lands the owner
> back where they were headed. The two middlewares compose in any order — the
> gate returns null when not logged in, deferring to auth.
>
> **Mode policy (verified):** mode-INDEPENDENT — the wizard runs post-login in
> every mode (online/hybrid/offline; Bakong merely hides offline), and no mode
> delegates store config to the back-office in a way that skips it. No mode is
> locked out or bypasses the gate.
>
> **Save & exit:** with the gate live, "Save & exit" from a guarded entry
> (Settings ▸ Management) `offNamed`s a guarded route → the gate bounces once
> back to the wizard (the wizard route is exempt → **no loop**). Net UX: you
> cannot leave to an admin surface until setup is done; the draft is saved
> either way. ⚠️ For the owner's eye: if a true "exit before finishing" is
> wanted, it would have to become **save & log out** (the only exempt landing) —
> NOT implemented here (the wizard flow is unmodified per the task constraint).
>
> **Exemption table** (must stay reachable mid-setup; everything else admin/POS
> is gated — 33 guarded routes):
>
> | Exempt route | Why |
> |---|---|
> | `/splash` | cold-start probe; `decideInitialRoute` owns the first hop |
> | `/auth` | login (and the post-logout landing) |
> | `/pin-login` | pre-auth PIN entry on a remembered device |
> | `/setup` | pre-login **Terminal** setup (a different wizard) |
> | `/store-setup` | the Store Setup wizard itself (gating it would loop) |
> | `/store-setup/import` | a routed sub-screen of the wizard (CSV import) |
> | `/lock-screen` | security surface — locking must never be blocked |
> | *(recovery)* | shown directly from `main.dart`, not a GetX route — exempt by construction |
>
> `sync-status` / `hardware-diagnostics` are **guarded**: neither is reachable
> pre-setup today (both sit behind `AuthMiddleware` with no pre-setup entry),
> and the fully-local wizard needs no sync/hardware diagnostics to complete.
> NO legacy-device backfill (owner ruling 2026-06-12 — pre-production).

> **POS-057 (2026-06-13) — Step 6 reworked: First-Sale Demo → Setup Summary
> & Finish.** Owner decision (2026-06-12): the demo's mini-cart was NOT the
> real POS UI, so it taught a screen that doesn't exist — cut it. The final
> step now shows a **review card per prior step** (Business · Currency & Tax ·
> Printer · Payment Methods · Products), each reading the LIVE write-through
> state with an **Edit** affordance that jumps back via `goToStep` and returns
> to the summary, honest empty states for skipped steps, and a **Complete
> Setup** button driving the unchanged finish path (`completeSetup` →
> `onboarding_completed`). The `StoreSetupStep.firstSaleDemo` enum value became
> `summary`; the `demo_sale_done` draft field was removed (legacy drafts that
> still carry it are tolerated). The demo's TRAINING-MODE / REG-DEMO strings
> and `storesetup.step6.*` / `storesetup.coach.*` locale keys were deleted
> (en+km). The first-real-sale **celebration is unaffected** — see
> [07-first-sale-demo.md].

> **POS-051 (2026-06-12) — Step-1 identity upgrade + receipt presets.**
> - **Logo upload** replaces the "Coming soon" stub: `file_selector` pick (PNG/JPG/WebP; SVG OUT — no in-tree rasterizer) → `dart:ui` decode + downscale (≤512px) + re-encode PNG → copy into the owned `store_logo/` dir (the `StaticQrImageStore` precedent) → path in the `store_logo_path` profile key (write-through, key-value, no schema change). Renders on the wizard preview + on-screen receipt + PDF header + **thermal raster** (POS-045 pipeline → centered `GS v 0` above the header, width-capped per 58/80mm; closes POS-037's logo-raster carry-forward). Graceful no-logo fallback throughout.
> - **Country** (ISO alpha-2, default `KH`; pre-POS-051 profiles migrate to KH) is the defaults driver: it pre-selects the phone **dial code** (searchable picker, replaces the fixed `+855` chip) and informs the **Step-2 currency suggestion** (KH→USD base of the locked USD/KHR pair; others→supported local currency, USD fallback — a HINT banner, never an override). Address is now street/city; the country renders separately. Phone stays national-digits in the draft + `'<dialCode> <national>'` in the profile (POS-014 tests stay green).
> - **Receipt presets** (`core/receipts/receipt_presets.dart`, pure): Minimal · Classic · Bilingual KH-EN flip the EXISTING template's behavioural fields (language / loyalty / lookup-QR) and preserve the merchant's identity text — NOT a second template system. PROVISIONAL chrome (chip idiom) — flagged for the owner's mockup eye. Density/separators aren't modelled on the template (out of scope).

> **⚠️ Supersession (2026-06-10, POS-014):** the "blocked on a backend
> `onboarding_completed` flag" gate and the "read-only confirm layer over
> server-synced data" framing below are **SUPERSEDED** by the owner's
> offline-first decision: the Tenant Setup wizard is now **FULLY LOCAL** —
> drafts, final values and the `onboarding_completed` flag all live
> on-device (GetStorage). There are NO backend onboarding endpoints. The
> terminal therefore *does* author business identity locally (Step 1), and
> Step-1 values write through to the same local keys Settings ▸ Store
> Profile reads. See `pos-flutter` module `lib/app/modules/store_setup/`,
> `lib/app/core/setup/store_setup_flow.dart`, and
> `lib/app/data/stores/store_setup_store.dart`.
>
> **Built in POS-014:** wizard shell (top bar / numbered stepper with
> done·current·pending + "~N min remaining" / two-column form+preview /
> bottom bar), device-local debounced draft auto-save + resume + Save &
> exit, local onboarding state, and **FP-05B-02 Business Details** as a
> functional local editor with a live receipt preview (reusing the shared
> `receipt_paper.dart` keystone). Route: `/store-setup`
> (`Routes.STORE_SETUP`); temporary entry point in Settings ▸ Management.
> All six steps are functional (no placeholders remain).
>
> **Built in POS-015 (2026-06-10):** **Step 2 — Currency & Tax** as a
> functional local editor per mockup `_8`. Base-currency cards (USD
> recommended; KHR pure-riel marked **limited support** — see gap below),
> USD→KHR rate with a pure-function **sanity band** (±5% of the
> locally-known reference rate; degrades to "no reference yet") + hard
> bounds (1,000–10,000), VAT 0–30%, tax-inclusive/exclusive selector, and a
> right-pane **"billed two ways" live example** (pure calc mirroring
> `TaxConfigService`'s VAT formula, dual-currency). **Mode-aware:** the
> "Auto-sync from NBC" affordance shows only online/hybrid (hidden in
> full-offline; rate is manual-only). **Commit-on-complete** writes through
> to the live services Settings ▸ Currency & Tax reads: base/cash currency
> via `CurrencyConfigService.setBaseCurrency`/`setAltCurrency`
> (`base_currency`), the FX rate via an **append-only audited row** in the
> exchange-rate model (`CurrencyConfigService.setRateFor` → `ExchangeRate­
> Repository.record`, recorded only when it changes), and VAT + mode via
> `TaxConfigService` (`tax_rate_pct` / `tax_inclusive`). New pure logic:
> `lib/app/core/setup/currency_tax_calc.dart`.
>
> **Known gaps (POS-015):** (1) KHR-base pricing is only partly wired — the
> FX field, live example and seeding assume a USD base; selecting KHR is
> allowed but flagged "limited support" and sets cash=USD without recording
> a USD→KHR row. (2) There is no live NBC feed on-device; the "NBC
> reference rate" is the terminal's known/default rate (config default
> 4,100), and Auto-sync is a "coming soon" affordance (not wired), matching
> Settings ▸ Exchange Rate. (3) Checkout's *consumption* of the tax config
> is out of scope here — this step only writes config (see that report).
>
> **Built in POS-016 (2026-06-10):** **Step 3 — Pair Your Printer** per
> mockup `_9`, wired to the REAL printer stack (no parallel stack): the
> connection-method cards (USB / Bluetooth / Network) drive a manual
> connection form that pairs through `PrinterConfigService.pair(...)` — the
> same device-scoped path Settings ▸ Hardware uses — and "Test print" sends
> a real ESC/POS test page through `PrintDispatcherService.testPrint()`
> (the dispatcher receipts/Z-reports already use). The right pane previews
> the print on the shared `receipt_paper` keystone with TEST PAGE / KITCHEN
> / RECEIPT tabs (Khmer + EN). **Printer is optional:** the step completes
> on a pairing OR an explicit **"Skip for now — set up later in Settings ▸
> Hardware"**; the skip flag round-trips in the draft (`printer_skipped`),
> the paired state lives in `PrinterConfigService`. No new files in `core/`;
> only the step view + draft/controller/preview wiring.
>
> **Network discovery + honesty fix (POS-054, 2026-06-13).** The POS-016
> "no auto-discovery, USB/BT entered by hand" gap is now resolved for the
> only transport that prints:
> - The dead "automatic detection isn't available yet" note
>   (`storesetup.printer.noDiscoveryNote`, + km twin) is **removed** and
>   replaced by a real **"Scan my network"** action. It sweeps the local
>   /24 (`core/printing/printer_discovery.dart` pure + `data/services/
>   printing/network_printer_scanner.dart` `dart:io` probe) for ESC/POS
>   endpoints on :9100, shows IP/port/confidence/response-time, and a tap
>   fills the manual host/port for the **unchanged** pair flow. Manual entry
>   stays first-class; empty result is an honest "none found — check the
>   same Wi-Fi/LAN, or enter the IP" with no promises. Hidden on web. ZERO
>   new packages.
> - **USB/Bluetooth cards become non-selectable "Coming soon"** (still
>   visible, preserving the mockup's 3-card layout). Network is the only
>   pickable kind, so a pairing can never reach a transport sink that throws
>   `unsupported` — the "pair a USB printer that can't print" trap is gone.
>   The scan UI is the shared `components/printer_scan_panel.dart`, reused
>   verbatim by Settings ▸ Hardware ([17-thermal-printing.md]).
> - **Preview nit:** the TEST PAGE preview's cashier line was showing the
>   pairing state ("Cashier: NOT PAIRED"); it now shows the signed-in name,
>   and pairing/connection stays on the Connection row only.
>
> **Superseded gap (POS-016):** the transport sinks in
> `PrintDispatcherService` are still Epic-17 stubs for USB/BT (a successful
> network "Test print" means "handed to the dispatcher", not a confirmed
> "ink on paper" ack — raw TCP gives no device ack). The real driver matrix
> lives in **[17-thermal-printing.md]**.
>
> **Built in POS-017 (2026-06-10):** **Step 4 — Payment Methods** per mockup
> `_10`, wired to the REAL local payment-method cache. **Cash** is always on
> (USD/KHR + auto-change from the Step-2 rate). **Bakong KHQR** (RECOMMENDED)
> toggles the local `bakong` tender and captures merchant config — MID
> (digits, 6–20), merchant name (Latin-only, enforced via input formatter),
> city (uppercased) — persisted to GetStorage (`bakong_merchant_id` /
> `_name` / `bakong_city`; **net-new** — no prior on-device Bakong config
> existed). **Static Bank QR** (BACKUP — POS-055, 2026-06-12, superseding
> POS-017's hollow toggle): a **per-method list + "Add payment method"
> capture form** (scan the printed sticker / paste the EMV string / upload
> a PNG-JPG), authored LIVE into the local payment-method cache (gateway
> `static_qr`, serverId NULL). Per-method enable/edit/remove; enabling a
> content-less row routes into the form — "enabled but unconfigured" is
> impossible, and unconfigured rows are hidden at checkout. The checkout
> preview renders each method's REAL QR. **Mode-aware:** in offline mode
> the Bakong card is hidden entirely and dropped from the checkout preview
> (tender decision — `QrGateway.isOfflineCompatible` +
> `AppModeService.isOfflineMode`); cash + static carry.
> **Commit-on-complete** still upserts Cash + applies the Bakong
> enablement; static methods need no commit step (authored live).
> **Gating:** the step is always valid (Cash is always on) UNLESS Bakong
> is enabled online with an incomplete/invalid MID — that blocks Next with
> an inline error. Cross-notes: **[13-payments-khqr.md]** (Bakong
> dynamic-KHQR flow + actual KHQR generation stay that epic's job — this
> step only stores merchant config + the enable flag) and
> **[14-payments-static-qr.md]** (the POS-055 design of record: capture
> paths, EMV warn-not-block, render precedence, sync no-clobber).
>
> **Built in POS-018 (2026-06-10):** **Step 5 — Add Your Products** per
> mockup `_11`, implementing [06-product-import.md]'s three paths inside the
> wizard. **Quick-Start Template** loads a real bundled café pack
> (`assets/seed/template_coffee_shop/`, 7 categories / 48 items, EN + Khmer,
> USD prices; KHR derived from the Step-2 rate) through the catalog repos
> (additive `ensureLocalCategory` / `ensureLocalProduct`, **idempotent
> skip-by-code**) so products are sellable in the POS grid immediately.
> **Import CSV** is a real client-side flow (`core/catalog/csv_import.dart` —
> RFC-4180-enough parser + header auto-map + per-row validation, no backend)
> → preview → commit with a summary. **Add manually** routes into the
> products admin and refreshes the count on return. The step completes on ≥1
> product OR an explicit "Skip — I'll add products later" (`product_skipped`,
> draft-persisted). Full detail + per-story statuses: [06-product-import.md].
>
> **Built in POS-019 (2026-06-11):** **Step 6 — Try Your First Sale** +
> the **completion celebration** (mockups `_12`/`_13`), implementing
> [07-first-sale-demo.md]'s wizard half. An embedded, 100%-LOCAL practice
> POS (3 demo items → tap → cart → Charge → Cash → demo receipt) that is
> **provably side-effect-free** (zero orders/sessions rows, no print, no
> PosEvents emissions, no drawer kick — test-asserted). Closing the demo
> receipt OR "Skip — Go Live" completes the step and **flips
> `onboarding_completed`** — the exact flag `home_controller`'s offline soft
> gate (`_shouldOfferStoreSetup`) ANDs on, so the wizard stops re-offering
> (regression already covered by `home_controller_offline_test.dart`). The
> **first real sale** then fires a one-shot celebration: a permanent
> `FirstSaleCelebrationService` (registered in `pos_binding`) subscribes to
> the `sale_completed` bus event (never touches payment finalize) and shows
> the `_13` modal once, ever, gated on onboarding-complete + a persisted
> `first_sale_celebrated` flag — never pre-onboarding, never from demo. Full
> detail + per-story statuses: [07-first-sale-demo.md].

## What this is (and isn't)

A **post-login, first-run** experience for the **owner/admin** of a tenant. It runs once per business, after [Terminal Setup](05-setup-wizard.md) + login, when the server says the tenant hasn't finished onboarding.

**Architecture decision (2026-06-01):** the **Laravel back-office owns tenant configuration** (business identity, tax, payment methods, products, staff — already built there: `CompanySeeder` etc.). Store Setup on the terminal is therefore a **guided confirm/checklist layer over server-synced data**, *not* a set of terminal-side editors. It nudges the owner through what's already configured, surfaces gaps, deep-links device-scoped bits (printer) to Terminal Setup, and flips an `onboarding_completed` flag so it doesn't reappear.

**Not here:** signup / phone-OTP / tenant provisioning (marketing site + backend, per P01); terminal-side *writing* of tax/payment/products/staff (back-office owns it).

## Dependencies (gating)

- **Backend (pos-laravel):** a tenant `onboarding_completed` flag exposed on `GET /pos/v1/auth/user` (or a settings endpoint) + a `POST` to set it. **Does not exist yet** — this spec is blocked until it does.
- **FP-01 (Auth)** — runs after login; owner/admin role gate (`UserModel.role`).
- **FP-02 (Sync)** — reads synced business/tax/payment/product data.
- **FP-06 (Product Import)** / **FP-27 (Team)** — the product + staff portions defer to those specs.

## Stories (high-level — detail when unblocked)

### FP-05B-01 · Trigger & gating
After login, if the tenant's `onboarding_completed == false` **and** the user is owner/admin, route to Store Setup; otherwise go straight to the register picker. Cashiers never see it.

### FP-05B-02 · Business & tax confirmation
Show the synced business identity (name, address, tax/VAT rate + mode, GDT id) read from the server; "looks right" confirms, "edit" deep-links to the back-office (or a future terminal editor). Read-first, not a terminal editor (back-office owns writes).

### FP-05B-03 · Payment-method confirmation
Show enabled payment methods (cash currencies, Bakong, static bank QR) as synced; confirm or flag missing. Bakong/static-QR credentials are configured in the back-office.

### FP-05B-04 · Hardware nudge
Prompt "set up your printer" → deep-link to Terminal Setup / hardware settings (printer is device-scoped, FP-05-05 / FP-17).

### FP-05B-05 · Staff overview
Show the tenant's staff list + status (synced); "invite staff" defers to FP-27 (back-office / SMS-Telegram invite).

### FP-05B-06 · Completion
Mark `onboarding_completed=true` (server); never reappears for the tenant. "Finish → first sale" leads into FP-07.

## Open questions

- Does the back-office already expose enough of the tenant config on `auth/user` / a settings endpoint for a read-only confirm layer, or do we need a dedicated `GET /pos/v1/onboarding` summary endpoint?
- Should "edit" actions deep-link to the back-office (web) or wait for terminal-side editors? (Default: deep-link; revisit per demand.)

## References

- Device bootstrap: [`05-setup-wizard.md`](05-setup-wizard.md)
- Product spec: `features/P01-getting-started.md`
- Tenant config source of truth: `pos-laravel` back-office (Company/Tax/Payment/Product/Staff)
