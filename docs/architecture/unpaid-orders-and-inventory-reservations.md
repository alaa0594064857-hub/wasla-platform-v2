# WASLA V2 — Unpaid Orders and Inventory Reservations

## 1. Status and production boundary

This document defines the design required before changing checkout inventory behavior or connecting a payment provider. It is an architecture decision record, not a payment policy decision.

- Applies to the current single-store order model.
- Does not select cash on delivery, online prepayment, bank transfer, or any other merchant payment method.
- Does not choose a reservation duration or promise a stock-hold window.
- Does not mark any order as paid.
- Does not authorize production migrations, deployment, or changes to live data.

The business policy remains configurable and unresolved until WASLA's merchant model, legal entity, and payment methods are confirmed.

## 2. Current behavior and identified risk

The current checkout transaction:
1. Locks the selected product rows.
2. Verifies available stock and server-side prices.
3. Creates the order and immutable line snapshots.
4. Immediately decreases `store_products.stock_quantity`.
5. Writes outbound inventory movements with the reason "Stock reserved for customer order".

This is atomic and prevents overselling, but it treats a newly placed, unpaid order as a completed stock deduction. There is no payment-status field, reservation expiry, or scheduled release process. A buyer who never pays or a store that never acts on the order can therefore leave stock unavailable indefinitely.

The current order status describes the shop's fulfilment workflow. It must not be reused as a payment status.

## 3. Decision: keep payment, fulfilment, and inventory states separate

The implementation should model three independent concerns:

### Payment state

Suggested vocabulary (final names can be normalized during migration):
- `not_required`: the order uses an explicitly configured offline/manual collection policy.
- `pending`: payment has been initiated but not verified.
- `paid`: verified provider confirmation or an authorized, audited manual confirmation exists.
- `failed`: a provider reports a final failure.
- `cancelled`: the payment attempt was cancelled.
- `refunded`: a refund has been confirmed.

An order must never become paid because it was placed, accepted, shipped, or because a browser reports success. Provider webhooks must be signature-verified and idempotent. Manual confirmation must require a permission-protected action, a reason/reference, and an audit record.

### Inventory reservation state

Use explicit reservation records rather than treating a stock decrement as an untracked hold:
- `active`: quantity is held for the order and reduces available-to-sell quantity.
- `consumed`: the reserved quantity has been committed to fulfilment/stock deduction.
- `released`: the hold was deliberately released.
- `expired`: the hold expired under an explicitly configured policy.

Each reservation line should identify order, product, quantity, state, creation time, optional expiry, and the actor/reason for terminal transitions. Enforce one effective active reservation per order/product line or use a uniqueness strategy that safely supports reservation attempts.

### Fulfilment state

Keep the existing order workflow for store operations. Guard every transition against both payment policy and inventory state. For example, a store must not mark an online-prepayment order as ready to ship until payment is verified and the inventory allocation is valid.

## 4. Inventory accounting model

Separate physical on-hand quantity from reserved quantity and available-to-sell quantity:

`available_to_sell = on_hand - active_reserved_quantity`

- Product stock remains the physical on-hand quantity until a documented fulfilment/dispatch event consumes it.
- Creating a reservation is not an outbound physical stock movement.
- Consuming a reservation creates the corresponding outbound inventory movement exactly once.
- Releasing or expiring a reservation increases available-to-sell quantity but does not create an inbound physical movement, because the goods never left on-hand inventory.
- Manual stock adjustments must lock the product and must not reduce on-hand below active reservations.
- Every reservation transition and physical stock movement must be transactional and auditable.

The migration must reconcile the current model carefully: existing order placement already decrements stock. Do not reinterpret historical outbound movements as active reservations or restore historical stock automatically. Any migration from the current model needs an explicit, tested reconciliation plan.

## 5. Policy options that remain open

WASLA must choose a policy per supported store/payment method before enabling automatic reservation expiry:

1. **Online prepayment** — reserve when checkout begins or the order is created; define a short payment window; release only after the expiry worker confirms the order is still unpaid and the reservation is active.
2. **Manual/offline payment** — define whether stock is held while the buyer transfers money, how the seller confirms receipt, and when an unconfirmed order is released.
3. **Cash on delivery / pay on delivery** — define whether stock is held at order placement and how long; payment is collected outside the online gateway and must not be represented as an online payment success.
4. **No reservation at order placement** — accept the order request without guaranteeing stock, then revalidate and allocate stock when the store accepts it. The buyer-facing wording must clearly state that the order is not confirmed until the store accepts it.

No option is enabled by this document. The platform must not silently default to one.

## 6. Expiry and concurrency requirements

When a merchant policy eventually defines an expiry:
- Store the exact expiry timestamp on each reservation; do not derive it from a mutable global setting after creation.
- Use a background worker or scheduled job to find due active reservations.
- Claim due reservations safely with row locks (for example, `FOR UPDATE SKIP LOCKED`) and transition them exactly once.
- In the same transaction, release reservation quantities, update order/payment state only when the policy requires it, append history, and write audit/outbox records.
- A payment confirmation racing with expiry must serialize on the same order/reservation rows. Exactly one terminal outcome may win; a late payment must be reconciled/refunded or escalated according to a documented policy, never silently resurrect expired stock.
- Idempotency keys must protect webhook events, expiry processing, and manual actions.
- Retries must be safe after partial worker failure.

## 7. Required authorization and customer communication

- Buyers can view their own order, payment, and reservation status.
- Store staff can act only with the relevant permission for that store.
- Only verified provider events or an explicitly authorized manual action can confirm payment.
- Store staff cannot edit immutable order prices, quantities, or address snapshots through status actions.
- Customer-facing pages must distinguish "order received", "awaiting payment", "payment confirmed", "awaiting store acceptance", and "cancelled/expired" as applicable.
- Do not show an order grand total as final while shipping/tax/discount amounts are unresolved. Current checkout explicitly warns that online payment is not collected and delivery fees are not included.

## 8. Implementation and test sequence

Before code changes:
1. Decide which payment/collection methods V1 of WASLA will actually offer.
2. Decide when stock becomes reserved, when it is consumed, and the expiry/cancellation rules for each method.
3. Define who may confirm manual payment and what evidence/reference is required.
4. Define shipping fee ownership and when the final payable total is known.

Then implement on a feature branch:
1. Add payment state and reservation schema with constraints and indexes.
2. Add a migration/reconciliation plan for existing orders and already-decremented stock.
3. Refactor checkout to create reservations or use the explicitly selected no-reservation policy.
4. Add idempotent consume, release, expiry, cancellation, and payment-confirmation operations.
5. Add a scheduled worker only after an expiry duration is configured.
6. Add bilingual buyer/store status UI.
7. Add PostgreSQL integration tests for concurrent checkout, duplicate webhooks, expiry/payment races, cancellation, worker retries, stock adjustments, and exact-once inventory movements.
8. Run CI and review the migration without applying it to production.

## 9. Non-goals

This design does not select or integrate a payment provider, shipping carrier, settlement bank account, COD provider, or merchant legal jurisdiction. A personal receiving account or IBAN is not proof of merchant acquiring or payout eligibility.
