# WASLA V2 — Commerce Orders Architecture

## 1. Purpose

Define the first order lifecycle for WASLA Store and WASLA Shops.
This specification is the prerequisite for database migrations and API implementation.
It does not create or modify production data.

## 2. Scope of the first release

The first order foundation supports:
- A signed-in personal user placing an order from one store.
- Multiple product lines from that same store.
- Immutable product, price, currency, and delivery-address snapshots.
- Atomic stock deduction, order creation, order-line creation, inventory movements, and audit records.
- Buyer access to their own orders.
- Store-member access to orders belonging to a store they are authorized to manage.
- Explicit order status transitions and cancellation handling.

The first release does not process card details, capture payments, calculate carrier rates, create shipping labels, or promise delivery dates. Payment and shipping integrations are separate later phases.

## 3. Core entities

### orders

An order belongs to exactly one buyer (users) and one store (stores).
Required attributes:
- id (UUID)
- order_number (public, non-secret identifier)
- buyer_user_id
- store_id
- status
- currency (ISO 4217, three uppercase letters)
- subtotal, discount_total, shipping_total, tax_total, grand_total (fixed-precision numeric)
- shipping_address_snapshot (JSONB, validated and immutable after placement)
- buyer_note (optional, length-limited)
- idempotency_key (buyer-scoped unique key)
- created_at, updated_at, cancelled_at

Constraints:
- Grand total equals subtotal minus discount plus shipping and tax.
- All monetary amounts are non-negative and use the same currency.
- An order cannot contain products from multiple stores.
- Buyer and store references are protected by foreign keys.
- Order records are retained; cancellation is a status transition, not deletion.

### order_items

Each line belongs to one order and references the source product for traceability.
Required attributes:
- id
- order_id
- product_id
- product_title_snapshot
- sku_snapshot (nullable)
- unit_price_snapshot
- quantity (positive integer)
- line_subtotal
- created_at

The product title, SKU, and unit price are snapshots. Later catalog edits must not rewrite historical orders. A product deletion must not erase the order line; use a restrictive or nullable reference strategy and preserve the snapshots.

## 4. Order lifecycle

Initial statuses:
- placed
- accepted
- processing
- shipped
- completed
- cancelled

Allowed transitions:
- placed -> accepted
- placed -> cancelled
- accepted -> processing
- accepted -> cancelled (only before fulfillment starts)
- processing -> shipped
- processing -> cancelled (only with an authorized stock-restoration operation)
- shipped -> completed

No arbitrary status patching is allowed. Each transition is validated on the server and recorded in order status history and audit logs. Terminal states (completed and cancelled) cannot be reopened through the ordinary API.

Payment status is deliberately separate from order status and will be introduced with the payment integration. Do not imply that an order is paid merely because it is placed or accepted.

## 5. Inventory consistency

Order placement must use one database transaction:
1. Validate buyer session and active user.
2. Validate active store and product ownership.
3. Lock all requested product rows in a deterministic product-ID order.
4. Verify every product is active, belongs to the selected store, and has sufficient stock.
5. Recalculate prices and totals on the server; never trust client-supplied prices or totals.
6. Insert the order and immutable order-item snapshots.
7. Deduct stock for every line.
8. Insert corresponding outbound inventory movement records with the order number as reference.
9. Insert audit records.
10. Commit only if every step succeeds.

If any line is invalid or out of stock, roll back the entire order; do not create partial orders or partial stock deductions.

Cancellation before shipment must restore each line's stock exactly once, insert corresponding inbound inventory movements, and update order status/history in the same transaction. Use row locks and a guarded status transition to prevent duplicate restoration under concurrent requests.

## 6. Authorization and privacy

- A buyer can read only orders where buyer_user_id equals the authenticated user.
- A store operator can read/manage orders only when they hold an active authorized account or store role for that exact store.
- A buyer cannot change store workflow statuses.
- A store operator cannot change buyer identity, order lines, prices, or totals after placement.
- Shipping-address snapshots are private buyer data and must not appear in public store/product responses.
- Platform-level access requires a separate explicit platform permission; account ownership is not platform administration.

## 7. Idempotency and concurrency

Order creation requires an idempotency key generated by the client for each checkout attempt. The database enforces uniqueness per buyer. Repeating the same key returns the original order result rather than deducting stock again.

Product rows are locked in deterministic order during checkout. Status transitions and cancellation restoration use guarded updates/transactions to prevent overselling and duplicate stock restoration.

## 8. Money and validation

- Prices and totals use PostgreSQL NUMERIC, never floating-point storage.
- Currency is fixed for the entire order and must match the store's supported checkout currency.
- The API calculates all totals from trusted catalog values.
- Quantities are positive safe integers within database limits.
- The API validates address fields and limits their size.
- No payment-card numbers, CVV, or bank credentials are stored by WASLA.

## 9. Audit and history

Sensitive actions must create audit entries:
- order.placed
- order.accepted
- order.processing
- order.shipped
- order.completed
- order.cancelled

An order status history table records previous status, new status, actor, reason, and timestamp. Inventory movement references connect stock changes to the order. Audit and history writes must be atomic with the operation they describe.

## 10. Implementation sequence

1. Review this specification against the existing account, store, product, and inventory schemas.
2. Add versioned migrations and Drizzle schema for orders, order items, and status history.
3. Add transaction-level database integration tests for atomic checkout, oversell prevention, idempotency, and cancellation restoration.
4. Implement buyer order placement and buyer order listing.
5. Implement store order listing and guarded status transitions.
6. Add bilingual buyer and store interfaces.
7. Keep payment and shipping integrations deferred until the order foundation is stable.


## 11. Implemented API foundation

The feature branch now includes these API operations:

- `POST /api/orders`: buyer checkout for one store, multiple unique product lines, and a required buyer-scoped idempotency key.
- `GET /api/orders`: the authenticated buyer's recent orders.
- `GET /api/orders/:orderId`: one order and its immutable line snapshots, visible only to its buyer.
- `GET /api/stores/:slug/orders`: recent orders for store owners and store managers with active membership in that exact store.
- `PATCH /api/stores/:slug/orders/:orderId/status`: guarded store workflow transitions.

Checkout recalculates catalog prices using integer minor-unit arithmetic, requires one currency across the order, locks product rows in sorted ID order, and commits order, order items, stock deductions, inventory movements, status history, and audit entries together. Replayed idempotency keys return the original order without a second stock deduction.

Store cancellation is allowed only from placed, accepted, or processing. It locks the order and affected product rows, restores available product stock, writes inbound inventory movements, and records the status/audit event in the same transaction. Shipped, completed, and cancelled orders cannot be cancelled or reopened through this endpoint.

Automated API unit tests cover authentication, checkout validation, successful stock deduction, insufficient stock rollback, idempotent replay, cancellation restoration, and invalid status transitions. These are mocked transaction tests; dedicated PostgreSQL concurrency/integration tests for checkout and cancellation remain a required next validation step.

## 12. Production boundary


All implementation work is developed on the feature branch and validated in CI.
No production migration, deployment, merge to main, payment integration, or paid service change is authorized by this specification.
