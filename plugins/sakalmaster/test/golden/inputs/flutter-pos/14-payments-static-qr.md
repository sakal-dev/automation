# Flutter POS · 14 · Payments — Static Bank QR

> **Implements:** P03-selling-and-payments.md (US-P03-05)
> **Status:** 🟢 Shipped (POS-055, 2026-06-12) — see per-story notes
> **Priority:** P0
> **Story prefix:** FP-14-
> **Last updated:** 2026-06-12 (POS-055 — self-served supply side)

> **Owner verdict that drove POS-055 (2026-06-12):** *"when you enable
> static KHQR, then what? Nothing. This lies to the user. I want full
> working now."* The checkout side already rendered a configured QR; the
> wizard toggle flipped enablement with no way to put a QR into the
> method. POS-055 closed the supply side: **collect → persist → render,
> offline-first, self-served on the terminal.**

## What shipped (design of record)

A static bank QR is now a **terminal-authored payment method**: created in
the Store Setup wizard (Step 4) or Settings ▸ Payment Methods, stored as a
local `payment_methods` row (`serverId NULL`, gateway `static_qr`, Drift
v39 adds `local_image_path`), and rendered at checkout + customer display
with zero network.

**Three capture paths** fill the same method:

1. **Scan the printed bank sticker** — the barcode scanner is a keyboard
   wedge; `ScanService` captures the typed EMV payload into `qr_data`.
   EMV payloads are ≤ 512 chars (spec cap), well within one wedge burst.
2. **Paste the EMV string** — from the bank portal / Telegram.
3. **Upload a PNG/JPG** — decode-validated (`dart:ui` codec; corrupt files
   are rejected before anything persists), then **copied** into the
   app-owned `payment_qr_images/` dir (slideshow local-image pattern) so
   the QR survives the source file/USB disappearing.

**EMV sanity check** (`core/payments/emv_qr.dart`): TLV parse +
CRC-16/CCITT-FALSE over the payload, merchant-name extraction (tag 59),
and a dedicated warning when a **dynamic** (single-use, tag 01 = "12")
QR is pasted where a standing one belongs. Verdicts **WARN, never
block** — Cambodian banks deviate from the spec in the wild; the copy
tells the owner to test-scan with a bank app.

**Multiple methods** (ABA + Wing side by side): each its own row with its
own enable switch, edit, and remove. **"Enabled but unconfigured" is
impossible** — enabling a content-less row routes into the capture form;
legacy content-less rows render a "needs setup" state in the wizard /
settings and are **hidden at the checkout rail**
(`PaymentController.availablePaymentMethods` filters
`QrGateway.isUnconfiguredStaticQr`) — never an empty QR panel.

**Render precedence** (cashier pane `_QrCard` + customer display):
`local_image_path` (Image.file, zero network) → `static_qr_url`
(disk-cached network image) → `qr_data` (regenerated QR widget, zero
network), each tier falling through on failure. The customer display
mirrors a locally-uploaded image as a base64 data URI over the existing
`qrImage` IPC seam.

**Sync posture:** terminal-authored methods (`serverId NULL`) **survive
server pulls** — `PaymentMethodRepository._cacheMethods` replaces only
server-mirror rows (parked-order "client wins" precedent). There is **no
push contract** for terminal-authored methods (reported gap, not
invented); they are terminal-local by design. Settings authoring is
mode-gated per the catalog precedent: offline/hybrid author locally;
online terminals stay a pure server mirror.

Key code: `core/payments/emv_qr.dart` · `core/payments/qr_gateway.dart`
(`isStaticShaped` / `hasStaticQrContent` / `isUnconfiguredStaticQr`) ·
`data/stores/static_qr_image_store.dart` ·
`PaymentMethodRepository.{createStaticQrMethod,updateStaticQrMethod,deleteLocalMethodByCode,nextStaticCode}` ·
wizard `steps/static_qr_method_dialog.dart` + reworked
`step_04_payment_methods.dart` · settings `payment_method_form_view.dart`
+ shared `components/qr_scan_capture_dialog.dart`.

## Stories

### FP-14-01 · Static QR display
**Implements:** US-P03-05 AC-1, US-P03-05 AC-2
**Status:** 🟢 Shipped

- [x] AC-1 — Each configured static method is its own row in the payment
      modal's method rail (multiple banks side by side); unconfigured
      ones never appear.
- [x] AC-2 — QR rendered locally (uploaded image / cached image URL /
      EMV payload → QR widget); no network call required.
- [x] AC-3 — Pane shows bank name + description, the QR (large), the
      total in both currencies with the live rate, and a 3-step
      how-to-pay (amount is NOT pre-filled in a static QR — copy says so).
- [x] AC-4 — Mirrored on the customer display, including locally-uploaded
      images (data-URI over the `qrImage` IPC seam).
- [x] AC-5 — No countdown (static QRs don't expire); method switching
      returns to the rail.
- [x] AC-6 — Multiple bank QRs each appear as their own method; the
      cashier picks the one the customer wants.

### FP-14-02 · Manual confirmation with bank reference
**Implements:** US-P03-05 AC-3, US-P03-05 AC-4
**Status:** 🟢 Shipped (pre-POS-055; unchanged)

> **⚖️ AMENDED 2026-07-18 (Socheat).** The reference is **OPTIONAL by
> default** — only strict companies turn it on via the
> `require_bank_reference` tenant policy (the 2026-07-08 settings
> migration made optional the default; `allowsOptionalReference` covers
> the default path). "Required before Charge" below reads as: required
> **when the tenant policy requires it**.

- [x] Reference field (last 4–6 digits) below the QR; required before
      Charge (`QrGateway.requiresReference` **&& the
      `require_bank_reference` policy**) — optional at default settings
      by decision.
- [x] Optional manager-PIN authorize gate
      (`static_qr_requires_approval` policy).
- [x] Payment row persists gateway + reference + currency/rate/base
      amount through the canonical payload builder; session totals
      exclude it from expected CASH (non-cash tender — J2 proves the
      drawer math).

### FP-14-03 · Offline operation and audit
**Implements:** US-P03-05 AC-5
**Status:** 🟢 Shipped

- [x] Entire flow works offline (`QrGateway.isOfflineCompatible` keeps
      static QR selectable offline; Bakong is hidden).
- [x] No server call anywhere in the flow; orders queue and sync on
      reconnect (J5 proves pending→synced).
- [x] Reference + cashier attribution ride the order/payment rows for
      bank-statement reconciliation.

### FP-14-04 · Self-served supply side (POS-055)
**Implements:** the owner verdict above
**Status:** 🟢 Shipped

- [x] AC-1 — Wizard Step 4: Cash stays always-on; **+ Add payment
      method** opens the capture form (v1 type: Static bank QR only — no
      coming-soon vaporware; Bakong keeps its own card, hidden offline).
- [x] AC-2 — Label + ABA/ACLEDA/Wing quick chips; three capture paths
      (scan / paste / upload); EMV warn-not-block verdicts; live preview
      in the form AND the step's checkout-preview pane renders the real
      QR per method row.
- [x] AC-3 — Per-method enable/edit/remove; enabling an unconfigured row
      opens the form; removing a local row hard-deletes (+ owned image
      file); legacy server rows deactivate instead.
- [x] AC-4 — Settings ▸ Payment Methods gains the same capture
      affordances (shared scan dialog + upload + EMV note + preview),
      mode-gated: offline/hybrid author locally, online stays a server
      mirror. "Needs setup" / "This terminal" chips in the list.
- [x] AC-5 — Locally-authored methods survive sync pulls (no-clobber,
      regression-tested).

## Dependencies

- **FP-05b (Store Setup)** — Step 4 hosts the capture form.
- **FP-11 (Cart & Checkout)** — Charge transition provides order total.
- **FP-15 (Split Tender)** — static QR can be one leg (J2 journey).
- **FP-16 (Customer Display)** — QR mirrored; data-URI seam for images.
- **FP-02 (Offline & Sync)** — order rows sync on reconnect; method
  rows deliberately do NOT (terminal-local).

## Test inventory (POS-055)

- `test/app/core/payments/emv_qr_test.dart` — CRC vector, valid/CRC-bad/
  garbage/truncated/oversized payloads, dynamic-QR flag, lowercase hex,
  whitespace tolerance.
- `test/app/data/repositories/payment_method_repository_static_test.dart`
  — local CRUD, code-collision generation, image import (real PNG copied
  to owned dir; survives source deletion + repo restart; garbage
  rejected with nothing persisted), content replacement cleans the old
  file, server-row refusals, **sync no-clobber**, QrGateway
  classification.
- `payment_controller_test.dart` — unconfigured static hidden at the
  rail; image-backed local method visible (FP-35-04 group).
- `store_setup_controller_test.dart` + `store_setup_view_test.dart` —
  per-method enable/disable write-through, refuse-enable-unconfigured,
  save-from-paste round trip, remove semantics, full dialog round trip
  (chip → paste → EMV note → save → row + switch).
- Manual QA still owed: real ABA/ACLEDA sticker scans with a physical
  wedge scanner (payload completeness), real bank-app scan of an
  uploaded photo rendered on the customer display.

## Open / out of scope

- **Server push contract** for terminal-authored methods (multi-terminal
  shops would want the ABA QR on every till): server-side work, not
  invented here.
- **QR image decoding** (extracting the EMV payload from an uploaded
  photo) needs a QR-decode package — zero-new-packages constraint; the
  photo renders as-is, which is what the bank sticker is anyway.

## References

- Product spec: `features/P03-selling-and-payments.md` (US-P03-05)
- Cambodia banking context: ABA, ACLEDA, Wing are the three most common
  bank apps used for QR payments at small shops
