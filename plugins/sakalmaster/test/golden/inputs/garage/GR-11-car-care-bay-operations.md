# SakalPOS Garage · 11 · Car-Care Bay Operations

> **Tier:** MVP (car care) · **Priority:** P0/P1 · **Story prefix:** `GR-11-`
> **Consumes:** GR-02 (vehicle), GR-03 (catalog), GR-08 (membership), Customer (P07), Membership (P19), Loyalty (P18)
> **Status:** 🟡 Partial — the client-side surfaces are largely built; every backend-dependent AC (server-wide job list, phone/membership lookup, server-side redemption validation, role claim) is unbuilt.
> **Added:** 2026-07-18 — from the car-care focus review
> **Implementation synced:** 2026-07-21 · Legend: ✅ built · 🟡 partial (client-only, or gaps) · 🔴 not built

## What to build

The gap between what GR-01–08 built (a **single technician** capturing one job at a time) and what a
real car-care center actually runs on: finding a customer by whatever they hand you, quoting a price
without starting a job, honouring a membership without letting it be double-spent, and a
**supervisor** who can see the whole bay rather than one phone.

This epic exists because the earlier epics modelled exactly one persona. A car-care center has at
least two — the person at the bay and the person answering for the shift — and the second has no
surface at all today.

### Why this is car-care shaped, not generic

Read [`car-care-center-discovery.md`](../../../Business/plan/03-verticals/car-care-center-discovery.md)
first. Its §2a is the load-bearing claim: **a POS alone does not stop cash skimming.** The anti-fraud
engine is KHQR-to-owner + prepaid membership check-in + loyalty capture — so at the bay, the
membership flow *is* the product, not a loyalty nicety bolted on. Two consequences:

1. **Membership integrity is a fraud control, not a feature.** §2d of the brief warns that
   multi-location membership without synced redemption means customers double-dip across branches.
   GR-08-02 AC-3 (the double-redemption guard) is **now built and unit-tested client-side**
   (`core/membership/redemption_guard.dart`) — the within-visit hole is closed at the bay. The
   remaining exposure is cross-branch: server-side entitlement validation (the server as the
   authority) is still unbuilt, so multi-location double-dipping is not yet caught.
2. **Capture is a check-in, not a sale.** The bay never takes money (GR-05). That rule stands here.
   Everything below is lookup, capture and verification.

## Stories

### GR-11-01 · Unified search — plate, phone, or membership
- [x] AC-1 — ✅ Built — `SearchQuery.parse` infers plate/phone/membership with no mode toggle (`core/search/search_query.dart`, unit-tested); the UI hint shows the inferred kind (`search_view.dart`).
- [ ] AC-2 — 🔴 Not built — phone lookup is deliberately routed to `SearchOutcome.unsupported` (`search_controller.dart`). `ApiProvider.lookupCustomer` still exists, is **never called**, and still posts `{'phone': ...}` to `/api/pos/v1/customers` rather than the `?query=` endpoint. Both ends unfixed.
- [ ] AC-3 — 🔴 Not built — membership-number lookup is also routed to `unsupported`; no endpoint exists.
- [x] AC-4 — ✅ Built — a single plate match navigates straight to the vehicle record instead of rendering a one-item list (`search_controller.dart` → `search`, `if (found.length == 1) openHistory(found.first)`); multi-match still renders the disambiguation list. *(GR-11-01a)*
- [x] AC-5 — ✅ Built — an offline plate miss now resolves to `SearchOutcome.offline` and shows a distinct "can't check while offline" message rather than `notFound`; the rule is pure and unit-tested (`core/search/search_outcome.dart` → `plateLookupOutcome`, `test/core/search_outcome_test.dart`; wired in `search_controller.dart`, rendered by `_Offline` in `search_view.dart`). *(GR-11-01a)*
- [ ] AC-6 — 🟡 Partial — the home search bar now routes to unified search, but the **History screen keeps its own plate-only search** (`history_controller.dart`), so unified search is an *added* surface, not yet a *replacement*.

**Priority:** P0 · **Status:** 🟡 Partial (plate path built; phone/membership lookup unbuilt; history search not yet replaced)

### GR-11-02 · Catalogue & price lookup
- [x] AC-1 — ✅ Built — a standalone read-only catalogue reachable from home (`home_controller.openCatalogue → Routes.catalogue`); `CatalogueView` starts no job.
- [x] AC-2 — ✅ Built — size-based pricing via `CatalogItem.priceForSize`; size chips default to the in-context vehicle's size (`catalogue_controller.dart`, `catalogue_view.dart`).
- [x] AC-3 — ✅ Built — works offline from `catalog_cache` with a manual refresh, and now shows a **"prices updated N ago"** line (warning-toned when never refreshed) so a stale price reads as stale: persisted source `data/database/app_database.dart` (`catalogLastUpdated`, max row `updatedAt`) → `data/repositories/catalog_repository.dart` (`lastRefreshedAt`) → `modules/catalogue/catalogue_controller.dart` (`lastRefreshed`, loaded on init + after refresh) → `modules/catalogue/catalogue_view.dart` (`_LastRefreshed`). Covered by `test/data/catalog_cache_test.dart`.
- [x] AC-4 — ✅ Built — each row has a **"Start a job with this"** action (`modules/catalogue/catalogue_view.dart` `_Row` action → `catalogue_controller.dart:startJobWith`): with a job already open it adds the item and jumps to the job screen; with none open it seeds the item and routes through check-in, and `JobFlowController.startForVehicle` drops the seeded line onto the new job (`data/services/job_flow_controller.dart`, `_pendingSeed`/`seedItem`, consumed on create, cleared on `clear`/`resume`). The label adapts (Add to job / Start a job).

> Today the catalogue is only reachable as a bottom sheet inside the job builder, so answering
> "how much is an oil change for a pickup?" means starting a job you then abandon — which pollutes
> the draft list and, worse, trains staff to create throwaway jobs.

**Priority:** P1 · **Status:** ✅ Built (standalone browse + size pricing + stale-time + start-a-job)

### GR-11-03 · Membership integrity at the bay
- [x] AC-1 — ✅ Built — double-redemption is now **enforced, not display-only**: `toggleMembershipRedemption` runs `RedemptionGuard` before flagging, and refuses a second redemption on the same visit unless the plan allows it (`core/membership/redemption_guard.dart`, unit-tested).
- [x] AC-2 — ✅ Built — `MembershipModel.balanceLine` shows remaining **and** expiry, used at check-in and in the job view. The old `summary`-drops-expiry gap is closed.
- [ ] AC-3 — 🔴 Not built — no server-side validation before submit (no endpoint) and no "captured optimistically / flagged **unverified**" offline mechanism; redemption is trusted locally.
- [x] AC-4 — ✅ Built (client) — an expired/exhausted membership is refused at the bay with a reason via `MembershipModel.refusalReason` / `redeemable` feeding the guard (unit-tested in `test/core/membership_test.dart`).
- [x] AC-5 — ✅ Built — loyalty progress is now shown at check-in (`core/loyalty/loyalty_progress.dart` in `checkin_view.dart`); `loyaltyVisits` is no longer cached-but-invisible. (Shared with GR-08-03 AC-2.)

**Priority:** P0 · **Status:** 🟡 Partial (within-visit guard, balance/expiry, refusal, loyalty built; server-side validation pending)

### GR-11-04 · Supervisor bay board
- [ ] AC-1 — 🟡 Partial (local-only) — a bay board exists but reads the **local** Drift DB via `jobsForLocationAll()`, so a phone still only knows its own jobs. The limitation is surfaced honestly by `_LocalOnlyNotice`; the server-backed list the AC requires does not exist.
- [x] AC-2 — ✅ Built — cards show vehicle, technician, status, elapsed time, and **proof completeness** via `ProofStrip` + a missing-shot warning (`bay_board_view.dart`).
- [ ] AC-3 — 🟡 Partial (local-only) — verify/reject is built (`ProofReviewView`, reason-gated return to `draft`); `approve` is a deliberate local no-op. No **server** retract of an already-accepted job.
- [ ] AC-4 — 🔴 Not built — **no role gating**; the bay board is visible to everyone. `UserModel.roles` exists but is deliberately not used to gate UI, and no role claim drives it.
- [ ] AC-5 — 🔴 Not built — no reassign-to-technician action exists.

**Priority:** P1 · **Status:** 🟡 Partial (local board + proof cards + verify/reject built; server-wide list, role gating, reassign pending)

### GR-11-05 · Shift & staff performance
- [x] AC-1 — ✅ Built — the shift rollup shows jobs, revenue, proof rate **and average time per job** (check-in→submit): `ShiftJob.durationAtBay` / `ShiftSummary.averageJobDuration` (`core/shift/shift_summary.dart:42-59,~120`, unit-tested in `test/core/shift_summary_test.dart` "average time per job"), rendered as a caption (`shift_summary_view.dart` `shift.avgTime` + `_formatDuration`).
- [x] AC-2 — ✅ Built — per-technician tallies via `TechnicianTally` / `byTechnician`, rendered per tech (`shift_summary_view.dart`).
- [x] AC-3 — ✅ Built — read-only and shallow by construction; no deep reporting here.
- [ ] AC-4 — 🔴 Not built (server-backed) — the aggregation runs over `jobsForLocationAll()` (local only); only the offline fallback exists, flagged by a `localOnly` notice.
- [ ] AC-5 — 🔴 Not built — when part-cost capture lands (GR-03-02 AC-3), the rollup adds **margin** (revenue − parts cost) per shift and per technician — the Poster live-food-cost pattern applied to the bay *(added 2026-07-21, `Business/research/features/pos-features-qashier-poster.md`)*

> Open question for the owner: does the supervisor need this **at the bay**, or is the Owner app the
> right home? If the Owner app covers it, cut this story rather than build a second reporting surface.

**Priority:** P2 · **Status:** 🟡 Partial (per-tech rollup built, local-only; avg-time + server-backed pending)

### GR-11-06 · Warranty visible at the bay (car-care subset)
- [ ] AC-1 — 🟡 Partial — warranty periods are computed and displayed with the deciding limit + reason (`core/warranty/warranty.dart`, unit-tested), but on a **separate screen** — not shown at point-of-capture and not printed/shared on the proof pack.
- [ ] AC-2 — 🔴 Not built (at check-in) — active warranty is reachable only from the **History** screen, not surfaced during the check-in flow, so the tech does not see it before quoting unless they open it manually.
- [ ] AC-3 — 🔴 Not built (claim workflow) — no warranty-claim flow (correctly out of scope per the note below); the job link exists (`WarrantyEntry.jobUuid` / `ticketRef`) but no claim action references the original job.

> Scope note: full warranty tracking is **GR-09-05**, part of the deferred repair-garage layer. This
> story is the read-only car-care slice — display and surface only, no claim workflow, no RO
> lifecycle. If the garage layer is promoted (see below), fold this into GR-09-05 rather than
> building it twice.

**Priority:** P2 · **Status:** 🟡 Partial (warranty compute + display built on its own screen; check-in surfacing + proof-pack pending)

## Dependencies

- **GR-02** — vehicle lookup this extends; **GR-03** — the catalog; **GR-08** — the membership model
- **Backend** — customer-by-phone filter **(exists but broken — the `phone` param is dropped)**; membership lookup by number, location-wide job list, role claim on auth, supervisor verify/reject **(all proposed)**
- **Cross-surface** — the Owner app owns deep reporting; do not duplicate it here

## A decision this epic does not make

The owner has named **two** focus verticals: car care *and* mechanic/garage service. The second is
[`GR-09`](GR-09-garage-layer.md) — inspection, estimate→approve-before-work, labor lines, RO
lifecycle, warranty — which is currently marked *"do NOT build until the car-care core is validated
+ shipped."*

If garage service is genuinely a parallel focus rather than a later one, that gate needs an explicit
decision, because GR-09 is a larger build than everything in this epic combined. **This spec assumes
the gate still holds** and scopes car care only. Revisit before starting GR-09.

## Test strategy

- **Unit (`core/`):** search-input type inference (plate vs phone vs membership); double-redemption guard; warranty-active window; shift aggregation.
- **Widget:** unified search + disambiguation; catalogue browse with size-band pricing; membership badge with remaining/expiry/refusal states; bay board cards; role gating (supervisor controls absent for a technician).
- **Integration (with backend):** phone lookup returns the right customer; redemption validated server-side; the bay board shows another device's job.
- **Manual QA:** search a member by phone → see their three cars → open history → start a job with an active warranty surfaced; try to redeem twice → refused; supervisor rejects a job missing its "after" photo → returns to the tech.

## References

- Car-care wedge + fraud thesis: [`car-care-center-discovery.md`](../../../Business/plan/03-verticals/car-care-center-discovery.md) §2a, §2d
- Membership: P19 · Loyalty: P18 · Customer: P07 · Garage layer: [`GR-09`](GR-09-garage-layer.md)
