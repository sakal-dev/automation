# Storefront · 07 · Checkout — Address, Delivery & Payment

> **Status:** 🟡 Partial — core + **payment confirmation built** (SF-07-03, `5ebdd39`); delivery
> options remain (backend-gated) · **Story prefix:** `SF-07-`
> **Implements:** P21 US-P21-01 AC-4/AC-5, US-P21-04 (customer side)

## Implementation status (scanned)
Present: `modules/checkout` — `address_selection_view` + `checkout_address_controller`,
`payment_view` + `checkout_payment_controller`, `checkout_stepper` (Step 1 address → Step 2 payment).
The payment controller requires a selected `addressId`, posts with `paymentMethod` (e.g.
`aba_payway`), and on `{ checkout_required, checkout_url }` **opens the gateway via `url_launcher`**.
Endpoints: `payment/v1/methods`; address via `customer/v1/addresses`. **Gaps:** delivery-zone/fee
resolution + **pickup time-slot** (address model has `deliveryFee` but selection UI/logic unclear);
**post-redirect confirmation** (how success returns — deep-link/poll); min-order enforcement.

## Stories

### SF-07-01 · Address selection (step 1)
- [x] AC-1 — Select a delivery address from the address book (SF-11); continue to payment
- [x] AC-2 — Requires an address before payment (`addressId` guard)
- [ ] AC-3 — **Pickup** option (vs delivery) with time-slot — verify/gap
- [ ] AC-4 — **Delivery zone → fee** shown per address; **min-order** block ("add $X more") — P21 US-P21-04 — gap

**Status:** 🟡

### SF-07-02 · Payment method + gateway (step 2)
- [x] AC-1 — Choose a payment method (`payment/v1/methods`, e.g. `aba_payway`)
- [x] AC-2 — Order/checkout request → `{ checkout_required, checkout_url }` → open gateway (`url_launcher`)
- [ ] AC-3 — **KHQR/Bakong** in-app option (vs external redirect) — verify which methods exist
- [ ] AC-4 — Order total incl. delivery fee + discount is correct at pay time

**Status:** 🟡

### SF-07-03 · Post-payment confirmation (the risk area)
- [x] AC-1 — After the gateway, poll `orders/{id}` (via `OrderHistoryProvider.getOrderDetails`) on a
  timer **and** on app-resume (`WidgetsBindingObserver`); a `PaymentFlowState.confirming` overlay
  shows meanwhile, then routes to the order-success screen (SF-08) when the order advances past `draft`
- [x] AC-2 — **Never "paid but no order":** on ~2-min poll timeout we route to unpaid/pending orders
  rather than guessing success; a manual "check now" is offered. *(Depends on the backend leaving the
  order `draft` until payment settles — verify live, see Open Q1.)*
- [x] AC-3 — `failed`/`cancelled` order status → snackbar + cart kept intact + a fresh attempt allowed
- [x] AC-4 — Idempotent: draft order id is reused and `_paymentInitiated` blocks a second
  `createPayment` on re-tap (returning user re-checks the existing payment instead of double-creating)

**Status:** 🟢 implemented (`5ebdd39`) — **verify the paid-status contract live** (Open Q1)

> **Status detection contract:** success = order `status` past `draft` (`OrderStatusEnum`: `draft` =
> "payment not completed" → `pending` = "payment completed, awaiting merchant confirmation"). Failure =
> `failed`/`cancelled`. If the backend instead exposes a separate `payment_status` (`unpaid`→`paid`),
> switch the poller's `_pendingStatuses`/`_failedStatuses` sets — `FulfilledOrderModel` doesn't parse
> `payment_status` today, so `status` is the only available signal.

## Dependencies
- SF-06 (cart), SF-08 (order success + unpaid), SF-11 (addresses); `next_action_handler`.
- Backend: methods + checkout `checkout_url` **(exist)**; delivery zones/pickup slots **(verify/propose — P21 US-P21-04)**.

## Test strategy
- Verify (priority): full pay via gateway → return → order created + success; cancel → cart intact;
  double-submit idempotency; delivery fee in total; pickup path if present.

## References
- P21 US-P21-01 AC-4/5, US-P21-04 · Payments: P03 · Confirmation: SF-08
