# SakalPOS Agent · 13 · Settings, Hardware & Diagnostics

> **Tier:** Later · **Priority:** P2 · **Story prefix:** `AG-13-`
> **Status:** 🔴 Planned

## What to build

Device/app configuration and the operator's window into the outbox: a **mobile invoice/receipt
printer** (for field sales), scanner mode, language/theme, and the **sync + media diagnostics** surface
(from AG-01) to see and recover pending documents. Keeps the field kit usable.

## Stories

### AG-13-01 · App settings
- [ ] AC-1 — Language (EN/KM), theme; currency display; cash-in-hand remind threshold (AG-06-02)
- [ ] AC-2 — About / version / logout
- [ ] AC-3 — Persisted + reloaded on launch

**Priority:** P2 · **Status:** 🔴

### AG-13-02 · Hardware — printer & scanner
- [ ] AC-1 — Pair a portable **invoice/receipt printer** (Bluetooth/USB ESC/POS, reuse P04 patterns) + a test print
- [ ] AC-2 — Scanner mode (camera / USB HID) for barcodes on stock/sale + a test scan
- [ ] AC-3 — Graceful with no hardware (share digital invoice instead)

**Priority:** P2 · **Status:** 🔴

### AG-13-03 · Sync & media diagnostics
- [ ] AC-1 — The AG-01 diagnostics surface: queued sales/collections/returns/remittances/counts + media, errors + manual retry + rejection reasons
- [ ] AC-2 — Manual catalog/stock/account refresh + last-synced
- [ ] AC-3 — Never delete an unsynced document silently (confirm + record)

**Priority:** P2 · **Status:** 🔴

## Dependencies
- **AG-01** — capture/outbox this surfaces; **AG-05** — invoice printing; P04 — printing patterns; P25 — settings

## Test strategy
- **Unit (`core/`):** setting persistence.
- **Widget:** settings; printer/scanner test; diagnostics + retry.
- **Manual QA:** print a field invoice; force an errored doc → retry from diagnostics.

## References
- Printing: P04 · Settings: P25 · Capture/outbox: AG-01 · Sale invoice: AG-05
