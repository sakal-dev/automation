# Owner App — User Journeys (OA-J1 … OA-J7)

> **Spec-home copy, imported verbatim 2026-07-29** from
> `owner-flutter/docs/specs/00-user-journeys.md` @ `4b8f9bb`, which is being
> removed under ruling R1. Everything below the rule is byte-identical to that
> file from its line 2 onward — the narratives were sole-copy and this import
> is what makes the deletion non-destructive (contract A3.3).
>
> Key mapping (see `Business/.sakal/journeys.yaml`): OA-J1 = Journey A ·
> OA-J2 = B · OA-J3 = C · OA-J4 = D · OA-J5 = E · OA-J6 = F · OA-J7 = G.
> Letters are the **owner app's** scheme only — journey keys are per-app
> namespaced and other surfaces use numeric indices (driver/agent 1–15).

---


> Narrative flows the app must support. Actors: **Owner** (buys + runs the business, often absent),
> **Manager** (delegated oversight, permission-limited). Each step notes the epic that delivers it.
> The through-line: an owner who is **not at the shop** stays in control.

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

---

## Journey B — Alert-driven intervention (MVP — the fraud radar)

1. Mid-afternoon, the owner is at another job. A **push alert** arrives: *"⚠️ Large refund $45 —
   Cashier Dara — Shop 1."* → *OA-03*
2. Tapping it opens the alert detail: order, amount, reason, cashier, time; a link to the order and
   to that cashier's recent activity. → *OA-03, OA-09*
3. The owner sees it's a legitimate return. Marks it read. If it looked wrong, the owner can call the
   shop or (once built) require that such refunds need **approval** next time. → *OA-03 → OA-06*
4. Later: a second alert — *"Terminal offline 20 min — Shop 2."* The owner messages the manager to
   check the wifi. → *OA-03, OA-07*

**Success:** the events an absent owner would never have known about now reach their phone in seconds.
This is the remote fraud-control loop.

---

## Journey C — Remote approval (near-term — the killer differentiator)

1. A cashier tries to void a paid order / give a 30% discount / take a $50 paid-out. The POS is
   configured to require owner approval above a threshold, so it **raises an approval request** and
   blocks the action. → *OA-06 (POS/backend side)*
2. The owner gets a **push: "Approval needed — void $18, Table 4, Shop 1."** → *OA-03/OA-06*
3. The owner taps **Approve** or **Deny** (with a reason); the decision returns to the POS, which
   unblocks or cancels the action. → *OA-06*
4. Every decision is recorded in the audit feed. → *OA-09*

**Success:** sensitive actions don't wait for the owner to drive over, and nothing sensitive happens
without a record. (Until this backend workflow exists, the POS falls back to a local manager-PIN.)

---

## Journey D — Multi-shop compare (near-term)

1. End of week, the owner opens **Locations**. → *OA-05*
2. A side-by-side compare: per-shop revenue, orders, avg ticket, top product, tender mix — best shop
   highlighted green, worst amber. → *OA-05*
3. Owner drills into the amber shop → full single-shop dashboard → sees refunds are high there. →
   *OA-05 → OA-02/OA-04*
4. Owner checks that shop's cashier report and audit feed to understand why. → *OA-04, OA-09*

**Success:** the owner spots the underperformer and the likely cause without visiting.

---

## Journey E — Cash & session oversight (near-term)

1. At closing time the owner opens **Sessions**: which registers are open, who's on them, live
   expected-cash. → *OA-07*
2. Shop 1 closes with a **$12 variance** — an alert fires and the session shows the count vs expected
   and the drawer movements (safe-drops, paid-outs). → *OA-03, OA-07*
3. Owner reviews the Z-report summary from the phone; if the variance pattern repeats for one
   cashier, that's a signal to act. → *OA-07, OA-09*

**Success:** cash discipline is visible remotely — the classic skim vector gets daylight.

---

## Journey F — Manage the team (later)

1. A new hire starts tomorrow. The owner opens **Team**, creates a cashier (name, PIN/temp password,
   assigned register, POS role), and hands over the credentials. → *OA-08*
2. Owner sees who's currently clocked in across shops, and each cashier's sales/refund stats. →
   *OA-08*
3. A cashier leaves; the owner **deactivates** their access from the phone. → *OA-08*

**Success:** staffing changes don't require a laptop or a trip to the shop.

---

## Journey G — Money & account (later)

1. The owner opens **Billing**: the portfolio view — cloud subscription, any offline licenses,
   invoices, next charge. → *OA-10*
2. A card fails; a dunning banner appears with a fix-payment action; core POS keeps working through
   the grace period (P17 rules). → *OA-10*

**Success:** the owner keeps the account healthy from the phone; the shop never gets surprised-locked.

---

## Notes

- Journeys A & B are the **MVP** must-haves — they carry the product's core promise on their own.
- C, D, E are the near-term differentiators and depend most on **new backend work** (approvals,
  multi-location summary, session API).
- Everywhere the owner "acts" (approve, create staff, change a setting) requires connectivity and
  confirms against the backend — this app never fabricates a write offline.
