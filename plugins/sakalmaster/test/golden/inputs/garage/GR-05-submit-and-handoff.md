# SakalPOS Garage · 05 · Job Submit & Hand-off to POS

> **Tier:** MVP · **Priority:** P0 · **Story prefix:** `GR-05-`
> **Consumes:** order pipeline (order_type=service), POS front desk
> **Status:** 🔴 Planned

## What to build

Close the loop: submit the captured job so it becomes an **open ticket on the front-desk POS** to
invoice and settle. This app takes **no payment** — it hands off. On apply, the server creates the
service order (order_type = `service`, "pending settlement"), deducts parts stock, and attaches the
photos. The tech sees the job's status flip as it syncs.

## Stories

### GR-05-01 · Submit the job
- [x] ✅ AC-1 — Submit sets the job `queued` → `SyncService` creates the service order server-side, order_type=`service`, vehicle + customer + service/part lines — `job_repository.dart:114` (`submit` → `queued`), `sync_service.dart:95` (`_drainJobs`) + `202` (`buildJobPayload`, `order_type: 'service'`), `api_provider.dart:78` (`POST /api/garage/v1/service-jobs`)
- [x] ✅ AC-2 — Idempotent by `job_uuid` — one ticket even on retry — `sync_service.dart:204` (payload key), tested `test/data/job_payload_test.dart:107`
- [x] ✅ AC-3 — Photos upload + attach (GR-04/GR-01) — the photo outbox drains independently and only after the job is `synced`, so submit never waits on it — `sync_service.dart:135` (`_drainPhotos`), `81` (drain order)
- [x] ✅ AC-4 — On success the job shows `synced` with the server ticket ref (parsed from `ticket_ref`/`order_no`) — `sync_service.dart:108`
- [x] ✅ AC-5 — Fully offline: `queued` regardless of connectivity, `sync()` guarded by online + fires on reconnect (GR-01) — `sync_service.dart:82` (guard), `48` (reconnect listener)

**Priority:** P0 · **Status:** ✅ Built

### GR-05-02 · Hand-off to the front desk
- [x] AC-1 — 🟡 The submitted job appears on the **POS as an open ticket** (vehicle, services, parts, total, photos) — *cross-surface with the POS.* Client's part built: `buildJobPayload` sends `order_type:service` + vehicle + service/part lines with `unit_price` (`sync_service.dart:202‑232`), photos attach via `uploadMedia` (`sync_service.dart:154`), and the returned ticket ref is displayed (`submit_view.dart:118`). POS-side rendering lives in the POS repo.
- [x] AC-2 — 🟡 Parts stock deducts server-side on apply (P08) — *server-side, not this app.* Client sends part lines (`type`/`product_uuid`/`qty`) at `sync_service.dart:215‑229`; deduction is a backend concern.
- [x] AC-3 — ✅ Membership redemption is flagged for the desk to confirm at settlement (GR-08): job-level `membership_ref` + per-line `membership_redemption` on the wire (`sync_service.dart:207,:228`), surfaced in the UI (`submit_view.dart:56,215`; `job_view.dart:528`), regression-pinned in `test/data/job_payload_test.dart`.
- [x] AC-4 — ✅ The tech's app is done at submit — no payment UI here: no payment/KHQR/cash UI in any module; the total is labelled an *estimate* the desk settles (`submit_view.dart:271`; `job_view.dart:506‑533`).

**Priority:** P0 · **Status:** 🟢 Client-side built (AC-1/AC-2 completed cross-surface in the POS/backend)

### GR-05-03 · Job status & open jobs
- [x] AC-1 — ✅ Built — the home screen is the open-jobs list for the active location (`modules/home/home_view.dart` ← `AppDatabase.watchJobsForLocation` `data/database/app_database.dart:78-83`), now grouped **Draft / Submitted / Settled** (`_JobSection` `home_view.dart`; group getters `home_controller.dart` `draftCards`/`submittedCards`/`settledCards`). `settled` is a first-class terminal status (`core/enums.dart:11`, state machine `synced→settled` `core/job/job_state_machine.dart:17-20`), rendered on the chip + card accent (`components/status_chips.dart:18`, `home_view.dart`). The POS owns settlement — the client only renders it: `SyncService` maps a server-reported settled ack → `settled` (`data/services/sync_service.dart` `_isSettled`). *Delivery of the settled status on a later sync (re-poll of a synced job) remains a backend dependency — see below.*
- [x] AC-2 — ✅ Built — `HomeController.openJob` reopens a `draft` in the editable builder (`Routes.job`) and opens any submitted job in the read-only receipt (`Routes.submit`); `SubmitController.submit()` no-ops unless `isDraft` (`modules/home/home_controller.dart:116-123`, `modules/submit/submit_controller.dart:31-40`). Corrections are a new job (append-only state machine).
- [x] AC-3 — ✅ Built — the submit screen shows an uploading spinner + count (`modules/submit/submit_view.dart:309-352`), and the open-jobs card now carries a per-job "N uploading" indicator (`_UploadingPill` `home_view.dart`; count via `AppDatabase.uploadingPhotoCountForJob`, surfaced as `JobCardData.isUploading`).

**Priority:** P1 · **Status:** 🟡 (client rendered; settled-status re-poll is a backend dependency)

> **Backend dependency (settled on sync):** the app renders `settled` and maps it from the submit ack, but a synced job is not re-polled, so the settled status only lands today if the idempotent submit ack itself reports it. A POS→bay status feed (a `GET service-jobs/{uuid}` re-poll, or a push) is needed for settlement to flow back after the desk closes the ticket. Consistent with the epic's "proposed/partly exists" note.

## Dependencies
- **GR-03/04** — the job + proof being submitted; **GR-01** — capture/sync; **GR-08** — membership flag
- **POS front desk** — consumes the open ticket + settles (cross-surface)
- **Backend** — service-order create (order_type=`service`, pending-settlement) + parts deduction + photo attach **(proposed/partly exists — README §3)**

## Test strategy
- **Unit (`core/`):** submit state machine; idempotency; service-order payload builder (vehicle, lines, photos ref).
- **Widget:** submit flow + status; open-jobs list; photos-uploading indicator.
- **Integration (with backend):** submit → one service ticket on the POS → parts deducted → photos attached; offline submit → syncs once; settled status returns.
- **Manual QA:** submit a job → appears on the POS → cashier settles → status returns to the app.

## References
- Order pipeline: `POST /pos/v1/orders` (Order `channel`/type) · Parts: P08 / `POS_INVENTORY_INTEGRATION.md` · POS settle: pos-flutter · Membership: GR-08
