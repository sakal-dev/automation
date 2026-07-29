# Sakal Stock · 08 · Serial / IMEI Capture & Lookup

> **Tier:** Later · **Priority:** P2 (gates Phone-shop vertical) · **Story prefix:** `SS-08-`
> **Implements:** P08 US-P08-06 (serial / IMEI tracking)
> **Status:** 🔴 Planned

## What to build

Per-unit serial tracking for serialized goods (phones, electronics). Capture each unit's serial/IMEI on
**receive** (SS-05), validate it, and let staff **look up** any serial to see its history (received when,
sold to whom, warranty). The sale-side capture is the POS's job; Sakal Stock owns the **stock-in**
capture and the lookup. This gates the phone-shop vertical.

## Stories

### SS-08-01 · Capture serials on receive
**As a** phone-shop clerk receiving a shipment
**I want** to scan each phone's IMEI as I receive it
**So that** every unit has a serial trail from inflow

**Acceptance criteria**
- [ ] AC-1 — For products flagged serial-tracked (P02), the receive flow (SS-05) requires one serial per received unit; count must equal received qty
- [ ] AC-2 — IMEI validated with a 15-digit Luhn check (P08 US-P08-06 AC-2); invalid → reject with a clear message
- [ ] AC-3 — Duplicate serial (already in stock) → blocked with a message
- [ ] AC-4 — Serials attach to the receipt line and submit with it (`document_lines.serials`)
- [ ] AC-5 — Scan or manual entry; rapid multi-scan for a carton

**Priority:** P2 · **Status:** 🔴

---

### SS-08-02 · Serial lookup
**As a** shop owner
**I want** to look up any IMEI/serial
**So that** I can answer warranty / anti-theft questions

**Acceptance criteria**
- [ ] AC-1 — Search/scan a serial → its record: product, where received (PO/receipt), when, current state (in-stock / sold), sold-to (if attached), warranty remaining (US-P08-06 AC-4)
- [ ] AC-2 — Reads from the backend serial registry (Inventory) — online; cached recent lookups
- [ ] AC-3 — Clear "not found / not tracked" states

**Priority:** P2 · **Status:** 🔴

---

### SS-08-03 · Trade-in intake (optional)
**As a** phone shop taking a trade-in
**I want** to capture the old device's IMEI into a pending bucket
**So that** it enters resale inspection with a trail

**Acceptance criteria**
- [ ] AC-1 — Capture a trade-in device serial → "resale pending inspection" bucket (US-P08-06 AC-5)
- [ ] AC-2 — Links to the customer/sale if provided (POS-side); this app captures the intake
- [ ] AC-3 — Defer if the trade-in workflow isn't prioritized

**Priority:** P2 · **Status:** 🔴

## Dependencies
- **SS-05** — receive flow hosts serial capture; **SS-03** — product resolution
- **Backend** — serial registry + lookup endpoint (proposed); P02 serial-tracked flag on products
- **POS side** — serial capture on **sale** (P08 US-P08-06 AC-1) is the terminal's job
- **P08 US-P08-06**

## Test strategy
- **Unit (`core/`):** Luhn/IMEI validation (valid/invalid/length); serial-count-equals-received-qty; duplicate detection.
- **Widget:** serial capture on receive (multi-scan, reject invalid/dupe); serial lookup states.
- **Integration:** receive 5 phones with IMEIs → each validated + attached → lookup one → shows received record.
- **Manual QA:** receive a serialized shipment; look up a sold unit; try an invalid IMEI.

## References
- Product spec: P08 US-P08-06 · Serial flag: P02 · Sale-side capture: POS/terminal
