# SakalPOS Garage · 12 · Check-in Resolution & Vehicle Holds

> **Tier:** MVP (car care + garage) · **Priority:** P0/P1 · **Story prefix:** `GR-12-`
> **Consumes:** GR-02 (vehicle check-in), GR-05 (job lifecycle), GR-11 (bay operations)
> **Status:** 🔴 Planned
> **Added:** 2026-07-18 — from the check-in state review

## What to build

Check-in asks the plate one question and today handles two possible answers: *matches found*, or
*open a blank form*. There are at least nine, and two of the missing ones are not cosmetic.

This epic covers what happens **after the lookup returns** — every resolution state, plus the vehicle
**hold** (blocked/on-hold) concept, which does not exist anywhere in the app or the specs today.

### The two that are not cosmetic

1. **Duplicate check-in bills the customer twice.** Two technicians at two bays checking in the same
   car is an ordinary busy morning, not an edge case. It produces two job documents → two service
   orders → two invoices → parts deducted twice. Nothing detects it: not on the device, not on the
   server. This is the only item here that costs money on a normal day.
2. **A plate typo silently splits a car's history.** One mistyped character creates a second vehicle.
   The service history splits, any warranty disappears, the membership does not attach — and **no
   error is shown**, because a new plate is indistinguishable from a new car. It quietly destroys the
   two features car care is sold on (history and membership), and it surfaces months later as a
   customer arguing about a warranty.

## Stories

### GR-12-01 · Duplicate check-in guard
- [x] AC-1 — ✅ Built — on resolving a plate, `_findConflict` calls `openJobForPlate` (filters `draft`/`queued`/`submitted`, scoped to the active location) and, on a hit, routes to `CheckinState.duplicate` rather than starting a second job (`checkin_controller.dart:198-211,238-245` → `app_database.dart:114-131`). The panel shows the existing job (`checkin_view.dart:517-565` `_DuplicatePanel`).
- [x] AC-2 — ✅ Built — the duplicate panel offers **open the existing job** (`openConflictingJob` → resume + route, `checkin_controller.dart:218-223`) as the primary action and **check in anyway** as the second (`_confirmOverride` → `proceedAnyway`). Widget-tested: `test/widget/checkin_resolution_test.dart` "a duplicate offers the existing job as the primary action".
- [x] AC-3 — ✅ Built — "check in anyway" records the deliberate duplicate: `proceedAnyway('Override: Duplicate check-in')` sets `overrideNote`, folded into the job note by `_buildAuditNote` so it travels to the desk/owner (`checkin_controller.dart:213-217,247-256`).
- [🟡] AC-4 — 🟡 Partial (client done; backend pending) — local same-device detection is built (`openJobForPlate` reads local Drift); **cross-device** detection is a backend dependency (needs the GR-11-04 location-wide job list) and is out of the client's reach.
- [x] AC-5 — ✅ Built — matching is by **normalised plate**, not vehicle uuid, so an offline-created twin still collides (`openJobForPlate` normalises both sides, `app_database.dart:122-134`). Unit-tested: `test/data/checkin_conflict_test.dart` "matches regardless of how the plate was typed".

**Priority:** P0 · **Status:** ✅ Built (client scope; AC-4 cross-device is backend-dependent)

### GR-12-02 · Near-match (typo) detection
- [x] AC-1 — ✅ Built — on no exact match, `_resolveNoMatch` ranks the cached vehicles (`recentVehicles(limit:30)`) for near matches **before** offering new/offline (`checkin_controller.dart:143-170` → `PlateSimilarity.rank`).
- [x] AC-2 — ✅ Built — near match = weighted edit distance ≤ 2 on the **normalised** key, with confusable pairs (0/O, 1/I/L, 8/B, 5/S, 2/Z, plus 6/G) costing half an ordinary edit (`core/plate/plate_similarity.dart`). Unit-tested (`test/core/checkin_resolution_test.dart`).
- [x] AC-3 — ✅ Built — never auto-corrected: candidates are presented and the tech confirms (`acceptNearMatch` only fires on tap). Each candidate now shows **make · colour** and **last visit** so two look-alike plates can be told apart (`NearMatch` view-model, `checkin_controller.dart:50-60`; `_NearMatchTile`, `checkin_view.dart:400-440`; widget test "near match shows enough detail to choose"). Visit count is not carried on the client vehicle payload (server-owned history); make/colour/last-visit give sufficient disambiguation.
- [x] AC-4 — ✅ Built — "add as a new vehicle" stays present and unambiguous via `rejectNearMatches` (`checkin.reallyNew`; widget test "offers the candidate AND an explicit add-new escape").
- [x] AC-5 — ✅ Built — scoring is pure `core/` logic (`plate_similarity.dart`, no Flutter), unit-tested against real Cambodian plate formats (`test/core/checkin_resolution_test.dart`).

**Priority:** P0 · **Status:** ✅ Built (client scope; visit-count detail is backend-owned)

### GR-12-03 · Vehicle holds (blocked / on hold)
- [x] AC-1 — ✅ Built (client renders a server-set hold) — `VehicleHold` (reason / setBy / setAt / reference / severity) is parsed off the lookup payload (`vehicle_model.dart:131-160`, `VehicleHold.fromJson`) and surfaced at check-in with its reason **and** who set it/when (`_HeldPanel`, `checkin_view.dart:458-514`; `attribution` line, `vehicle_model.dart:162-171`). The hold model itself is authored server-side (backend dependency), which the client does not own.
- [x] AC-2 — ✅ Built — a hold never dead-ends: the held panel always offers an override (`_HeldPanel` → `_confirmOverride` → `proceedAnyway`, `checkin_controller.dart:213-217`), so the tech is never forced to route around it under a wrong plate.
- [x] AC-3 — ✅ Built (client scope) — override is always recorded: `proceedAnyway('Override: <hold reason>')` folds the act + the hold it was against into the job note via `_buildAuditNote` (`checkin_controller.dart:247-256`), attributed by the job's own `createdBy`/`createdAt`, and travels to the server with the job. (A dedicated structured audit record is server-side.)
- [x] AC-4 — ✅ Built (as specified) — override is **open and recorded**, not role-gated, exactly because the app has no role concept yet (GR-11-04). Matches the AC's stated interim behaviour.
- [x] AC-5 — ✅ Built — the client renders whatever hold the server sends and owns no policy: the reason is server-authored free text (`VehicleHold.fromJson`), the client only displays it.
- [🟡] AC-6 — 🟡 Partial (backend-dependent) — an unpaid-balance hold already shows the amount **inside** the server-authored reason string (e.g. "Unpaid balance $84.00"), but there is no dedicated read-only outstanding-balance field: that needs the customer balance on the lookup payload (backend dependency; the ledger is P07/Payment).

**Priority:** P1 · **Status:** ✅ Built (client scope; AC-6 dedicated balance field is backend-dependent)

### GR-12-04 · Unfinished draft for this vehicle
- [x] AC-1 — ✅ An existing open job (incl. an unsubmitted `draft`) for the plate is detected and offered to resume rather than starting a second one — `checkin_controller.dart` `_findConflict` + `CheckinState.duplicate` + `openConflictingJob` (a draft resumes into `Routes.job`), rendered by `checkin_view.dart` `_DuplicatePanel` ("Open that job", the primary action)
- [x] AC-2 — ✅ The panel now shows what is already captured — line count + photo count — loaded in `_findConflict` (`conflictLines`/`conflictPhotos`) and rendered in `_DuplicatePanel` ("Already on it: N line(s) · M photo(s)"); widget-tested in `test/widget/checkin_resolution_test.dart`
- [x] AC-3 — ✅ For a `draft` only, "Discard & start over" is offered behind a confirmation dialog (`checkin_view.dart` `_confirmDiscard`) that names what will be deleted; `CheckinController.discardConflictingDraft` removes the photo files then the draft (never silent) and starts a clean job. A queued/submitted job cannot be discarded. Widget-tested (confirm required, cancel keeps it, non-draft has no discard)

**Priority:** P1 · **Status:** ✅ Built

### GR-12-05 · Odometer sanity check
- [x] AC-1 — ✅ A reading **lower** than the vehicle's last known odometer is flagged at entry — `core/vehicle/odometer_check.dart:44` (`OdometerVerdict.wentBackwards`), surfaced live in `checkin_controller.dart` (`odometerMessage`) and shown in `checkin_view.dart` (`_OdometerField`); tested in `test/core/checkin_resolution_test.dart` ("a reading lower than last time is flagged")
- [x] AC-2 — ✅ An implausible jump (configurable, default > 50,000 km since last visit) is flagged the same way — `core/vehicle/odometer_check.dart:35,45` (`maxJumpKm = 50000`, `OdometerVerdict.implausibleJump`); tested ("an implausible jump is flagged", "the jump ceiling is configurable for a truck fleet")
- [x] AC-3 — ✅ **Warn, never block** — the check only returns a message; `checkin_controller.dart` (`startWithSelected` → `_start`) proceeds regardless, and `_buildAuditNote` folds the discrepancy into the job note so it travels to the server rather than being silently corrected; `checkin_view.dart` (`_OdometerField`) renders it as a warning, not a gate
- [x] AC-4 — ✅ Service-interval hints consume this: the reading is persisted on the job (`checkin_controller.dart` `_start` → `job_flow_controller.dart` `startForVehicle` → `job_repository.dart` `startDraft` `odometer`), and last-known odometer is cached (`vehicle_cache.lastOdometer`) and drives the check via `VehicleModel.lastOdometer`

**Priority:** P2 · **Status:** ✅ Built

### GR-12-06 · Honest offline wording + server-side merge
- [x] AC-1 — ✅ Offline with no cached match resolves to `CheckinState.offlineUnknown` (`checkin_controller.dart` `_resolveNoMatch` / `rejectNearMatches`), rendered as "No signal — no record on this device. It may already exist on the server." (`checkin_view.dart` `_NewVehiclePanel`, i18n `checkin.offlineUnknown`) — never "new vehicle"
- [ ] AC-2 — 🔴 **Backend dependency (proposed).** Plate-normalised merge on sync is server-side; the client cannot solve it (it has no way to know what the server already has). No client work possible — tracked for the backend.
- [x] AC-3 — ✅ `VehicleRepository.lookup` now bounds the server call with a short lookup-specific timeout (`_defaultLookupTimeout` = 4 s, injectable), far below the global 20 s API timeout; a `TimeoutException` is caught like any other failure and the lookup falls back to the cache. Tested in `test/data/vehicle_lookup_timeout_test.dart` (a hanging online lookup returns the cached vehicle)

**Priority:** P1 · **Status:** 🟡 Client done — AC-2 is a backend dependency

### GR-12-07 · Vehicles with no plate
- [ ] AC-1 — Support check-in without a plate — new cars on paper or dealer plates are common in Cambodia and today **cannot be checked in at all**, so the job goes unrecorded
- [ ] AC-2 — Identify by customer phone plus make/model/colour, with a plate photo standing in for the plate
- [ ] AC-3 — Flag the record so the plate can be filled in on a later visit rather than creating a second vehicle

**Priority:** P2 · **Status:** 🔴

### GR-12-08 · Cancel a wrong check-in
- [x] AC-1 — ✅ The job screen now offers "Discard this job" in an overflow menu (`job_view.dart` AppBar action → `_confirmCancel`), wired to `job_controller.dart` `cancelDraft` → `JobRepository.deleteDraft` (`job_repository.dart:158`), which was previously wired to nothing
- [x] AC-2 — ✅ Confirmation dialog before anything is deleted (`job_view.dart` `_confirmCancel`); only a `draft` is cancellable — the rule lives in `core/job/job_state_machine.dart` `canCancel` (draft only) and gates both the menu (`JobController.canCancel`) and the action; tested in `test/core/core_test.dart` ("only a draft can be cancelled")
- [x] AC-3 — ✅ Photo files are removed before the DB cascade: `JobController.cancelDraft` deletes each `MediaRepository.deletePhoto` (file + outbox row) then `deleteDraft`, so no JPEGs are orphaned in the media directory (`deleteJobCascade` only clears rows)

**Priority:** P2 · **Status:** ✅ Built

## Decisions the owner still owes

These change what gets built and are not technical calls:

1. **Who may override a hold?** Assumed: owner sets, supervisor overrides, technician never. If a
   technician can override, the hold is decorative.
2. **Is membership attached to the customer or the vehicle?** Affects what check-in shows for a
   member's second car, and whether one plan covers three vehicles.
3. **Should "check in anyway" over an open job be allowed?** Allowing keeps the tech unblocked;
   forbidding guarantees no double billing. Recommendation: allow and record.
4. **What actually causes a hold in your shops?** Assumed unpaid balance. Damage disputes or barred
   customers change the wording and the who-set-it.
5. **Require a plate photo at check-in?** Makes the typed plate verifiable and strengthens every
   proof pack, at the cost of one tap on every job.

## Dependencies

- **GR-02** — the lookup this resolves; **GR-11-04** — the location-wide job list duplicate detection needs to work across devices; **GR-06** — history and warranty shown on an exact match
- **Backend** — hold model on vehicle/customer, plate-merge on sync, location-wide open-job query **(all proposed)**

## Test strategy

- **Unit (`core/`):** near-match scoring including confusable characters; duplicate detection by normalised plate; odometer sanity bands; the resolution state machine (exact / near / ambiguous / new / offline-unknown / held / duplicate / stale-draft).
- **Widget:** each resolution panel; hold with override; duplicate warning with both paths; odometer warning that does not block submission.
- **Manual QA:** two devices check in the same plate; mistype one character of a known plate and confirm the near match appears; a held vehicle overridden and the record checked.

## References

- Check-in state design: the annotated states artifact (2026-07-18)
- Car-care wedge: [`car-care-center-discovery.md`](../../../Business/plan/03-verticals/car-care-center-discovery.md)
- Bay operations: [`GR-11`](GR-11-car-care-bay-operations.md) · Vehicle check-in: [`GR-02`](GR-02-vehicle-checkin.md)
