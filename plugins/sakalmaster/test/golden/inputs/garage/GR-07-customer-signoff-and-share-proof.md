# SakalPOS Garage · 07 · Customer Sign-off & Share Proof

> **Tier:** Near-term · **Priority:** P1 · **Story prefix:** `GR-07-`
> **Consumes:** proof (GR-04), job (GR-05), P15/P23 (share channels)
> **Status:** 🟡 Partial — GR-07-01 (customer sign-off) is built client-side; GR-07-02 (share the proof pack) has the client share pack but its hosted proof page + share channel are backend/product-pending.
> **Implementation synced:** 2026-07-22 · Legend: ✅ built · 🟡 partial (client-only, or gaps) · 🔴 not built

## What to build

Turn the proof into a trust moment: the customer **signs off** on the job (agreeing the work + parts)
on the tech's phone, and the shop **shares the proof pack** — before/after photos + services + parts —
to the customer via Telegram/SMS/link. This is the branded, structured upgrade of the informal "we
sent you the photos on Telegram" habit.

## Stories

### GR-07-01 · Customer sign-off
- [x] AC-1 — ✅ Built — on-screen signature capture attached to the job. `SignoffView` (`lib/app/modules/signoff/signoff_view.dart`) captures with a `SignatureController` and, on save, stores the PNG via `MediaRepository.attachBytes(kind: PhotoKind.signature)` and stamps the path with `JobFlowController.setSignaturePath` (`job_flow_controller.dart:145`).
- [x] AC-2 — ✅ Built — the job summary (`_WorkSummary`) and the before/after shots (`_BeforeAfterStrip`) sit above the pad so the customer reviews the work before signing (`signoff_view.dart`).
- [x] AC-3 — ✅ Built — the signature is stored as a `JobPhotos` outbox row (`PhotoKind.signature`) via `MediaRepository.attachBytes` (`media_repository.dart:41`) — captured offline and uploaded by the media queue like any other photo.
- [x] AC-4 — ✅ Built — sign-off is optional: reached only from the submit screen (`SubmitController.goSignoff`, `submit_controller.dart:42`), never gates `submit()`, and the screen states `signoff.optional`.

**Priority:** P1 · **Status:** ✅ Built

### GR-07-02 · Share the proof pack
- [~] AC-1 — 🟡 Partial — after submit, the proof pack (photos + services + parts + **shop name**) goes out via the OS share sheet (Telegram/SMS/etc. reachable): `SubmitController.performShare` (`lib/app/modules/submit/submit_controller.dart:75`) → `Share.shareXFiles`; message built by the pure `ProofPackSummary` (`lib/app/core/share/proof_pack.dart`). Shop name is populated from the bound branch (`LocationContextService.activeLocationName`) in `buildShareMessage` (`submit_controller.dart:57`). Gap: the *"share channel (proposed)"* / a hosted link is still backend/product (AC-2/AC-4).
- [ ] AC-2 — A hosted proof page (link, no login) the customer can open later — reuses the digital-receipt idea (P15 US-P15-07)
- [ ] AC-3 — Uploads must finish (GR-04) before the pack is complete; share gracefully waits/notes pending photos
- [ ] AC-4 — Opt-in / owner-configurable
- [ ] AC-5 — The hosted proof page carries an owner-configurable **"book again / review us / refer a friend"** footer (link or phone) — the proof pack doubles as the retention + referral hook *(added 2026-07-21; KiotViet in-product-referral pattern, `Business/research/ecosystem/pos-ecosystem-kiotviet.md`)*

**Priority:** P2 · **Status:** 🟡 Partial — client share pack built (photos + services + parts + shop name); hosted proof page + share-channel opt-in are backend/product (`sakal-dev/garage-module#7`).

## Dependencies
- **GR-04** — the photos; **GR-05** — the submitted job; **GR-06** — history the pack links to
- **Backend** — share/hosted-proof endpoint + a notification channel **(proposed — P15/P23)**

## Test strategy
- **Unit (`core/`):** signature attach; proof-pack assembly; pending-photo gating.
- **Widget:** sign-off capture; review-before-sign; share sheet/channel selection.
- **Manual QA:** sign → job carries signature; share to Telegram/SMS → customer receives the before/after pack; link opens the hosted proof.

## References
- Proof: GR-04 · Digital receipt/hosted page: P15 US-P15-07 · Notifications: P23
