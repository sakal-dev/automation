# Storefront · 12 · Notifications (In-app + Push)

> **Status:** 🟡 In-app built · **push NOT built** (scanned 2026-07-13) · **Story prefix:** `SF-12-`
> **Implements:** P23, P21 US-P21-05 AC-3

## Implementation status (scanned)
Present: `modules/notifications` (`notifications_view`, `notifications_controller`,
`notification_card`, `notification_model`) — an **in-app** notification inbox. **NOT present:** no
`firebase_messaging` / FCM / APNs / OneSignal dependency → **no push notifications**. So proactive
order-status alerts (P21 US-P21-05 AC-3) don't reach the customer when the app is closed.

## Stories

### SF-12-01 · In-app notification inbox
- [x] AC-1 — Notifications list + cards (`notification_model`)
- [x] AC-2 — Read/unread state (verify)
- [ ] AC-3 — Source endpoint for notifications (verify which API feeds it)

**Status:** 🟢 (in-app)

### SF-12-02 · Push notifications (order status + promos) — NOT BUILT
- [ ] AC-1 — Integrate FCM (Android) + APNs (iOS); request permission; register a device token
- [ ] AC-2 — Register token with the backend (`customer/v1/devices` or similar — **propose**)
- [ ] AC-3 — Order-status push (Placed→…→Completed) deep-links to the order (SF-08); P21 US-P21-05 AC-3
- [ ] AC-4 — Promo/marketing push (opt-in); respects a preference toggle (SF-13)
- [ ] AC-5 — Foreground/background/terminated handling + deep-link routing

**Status:** 🔴 Not built — **backend push infra (P23) + a token-register endpoint are dependencies**

## Dependencies
- SF-08 (status → push), SF-13 (push prefs); **backend P23 notification infra + device-token endpoint (propose)**.

## Test strategy
- In-app: verify list source + read state.
- Push (once built): permission; token register; status push deep-links; opt-out honoured.

## References
- P23 (notifications) · P21 US-P21-05 AC-3 · Order tracking: SF-08
