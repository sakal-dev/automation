---
key: OA-J1
title: The morning glance: know the state of the business in 15 seconds
goal: OA-G1
persona: owner
source: sakal-dev/sakalpos:specs/journeys/owner-app-journeys.md#journey-a@9cf7c6f
---

## Journey A — The morning glance (MVP)

1. Owner opens the app at breakfast; **biometric unlock** (Face/fingerprint) — no re-login. → *OA-01*
2. The **home dashboard** loads instantly from cache, then refreshes: today's revenue, order count,
   average ticket, Δ vs yesterday and vs same-day-last-week, tender mix (cash / Bakong / QR), and the
   dine-in/takeaway split. → *OA-02*
3. If the owner runs multiple shops, the header shows **"All shops"** with a tap to switch to one
   shop. → *OA-05 (context selector lives in OA-01)*
4. Owner sees yesterday closed clean and today is tracking up 8%. Closes the app in 15 seconds. Done.

**Success:** the owner knows the state of the business without a call or a drive.
