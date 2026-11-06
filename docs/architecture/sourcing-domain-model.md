# WASLA V2 — Sourcing Domain Model and API Contract

## Status
Implementation contract for the accepted demand-led sourcing decision. This document is additive and does not change the current checkout, schema, migrations, production database, or deployment. The existing store checkout remains isolated and must not be treated as the buyer sourcing flow.

## Existing foundations confirmed
- Identity is represented by `users`; business identities are `accounts` with account types including `supplier` and `manufacturer`.
- Supplier-side access should be grounded in active `account_members` membership and the account's active status. A supplier offer belongs to an account, not to the platform or an individual AI agent.
- Store catalog/inventory is represented by `stores`, `store_products`, and `store_inventory_movements`; it is merchant-owned data.
- Current `orders` require a `store_id` and the current checkout decrements `store_products.stock_quantity`. That shape cannot represent an order sourced from a supplier offer independently of a store.
- API handlers use the Node HTTP server, Better Auth session lookup, and PostgreSQL pool. Database schema definitions live in `apps/api/src/db/schema.ts`; Drizzle migrations are generated under `apps/api/drizzle`.

## Domain records

### sourcing_requests
A buyer-owned request for supply. Suggested fields:
- `id` UUID primary key; `buyer_user_id` FK to users.
- `status`: draft, submitted, searching, offers_available, buyer_selected, fulfilled, cancelled, expired.
- `item_title`, `description`, `specifications` JSONB, `quantity`, `unit_of_measure`.
- `destination_country_code` (ISO 3166-1 alpha-2), `destination_city`, optional region/postal code and delivery-address snapshot.
- `preferred_currency` (ISO 4217), `allow_cross_border` boolean, delivery requirements, buyer note.
- idempotency key, created/updated/submitted timestamps.
- Index buyer + created time, status + submitted time, and destination country + status.
- Validate positive quantity and bounded text/JSON payloads. The destination is explicitly supplied by the buyer; never infer it from the buyer's current IP/location.

### supplier_offers
A supplier's time-bounded commercial offer against one sourcing request. Suggested fields:
- `id` UUID primary key; `sourcing_request_id` FK; `supplier_account_id` FK to accounts.
- `status`: draft, submitted, availability_pending, available, unavailable, withdrawn, expired, accepted, rejected.
- Supplier product reference is optional and must not be treated as platform stock. Store supplier-entered title/specification snapshot and explicit match notes.
- `origin_country_code`; quantity offered; unit price and ISO currency; item subtotal.
- Supplier availability status, `availability_confirmed_at`, optional `availability_valid_until`, and confirmation actor/member. A displayed catalog quantity is not confirmation.
- Delivery method/terms, estimated dispatch and delivery windows, shipping amount/currency, known duties/taxes/fees or an explicit unknown/not-included state, and supplier notes.
- `quote_valid_until` only when the supplier provides a validity deadline. Do not invent a platform-wide reservation or stock-hold duration.
- created/updated timestamps and an audit trail for material changes.
- Index request + status + price; supplier account + created time; validity deadlines for expiry processing.

### sourcing_offer_events
Append-only history for submission, availability confirmation/rejection, withdrawal, expiry, material edits, buyer selection/rejection, and actor identity. Keep prior commercial values in event metadata or immutable version snapshots; do not silently overwrite an offer after buyer selection.

### sourcing_orders (or a future generalized orders model)
The accepted supplier offer creates a separate sourcing order. Do not force it into the current store-bound `orders` table without a reviewed migration and complete dependency plan.
- Unique accepted `supplier_offer_id` prevents multiple orders from one offer.
- Buyer, supplier account, sourcing request, selected offer, and immutable commercial snapshot.
- Snapshot includes supplier identity, item/specification, quantity, unit price/currency, shipping, known fees/taxes, final total or an explicit unresolved-cost state, destination, delivery terms, and the supplier availability confirmation used at acceptance.
- Order creation and offer acceptance occur atomically after rechecking buyer ownership, offer status/validity, supplier/account status, availability confirmation, currency/amount consistency, and idempotency.
- Payment and shipment remain separate linked domains and do not become successful merely because an order exists.

## State transition rules
- Request: draft -> submitted -> searching -> offers_available -> buyer_selected -> fulfilled; cancellation/expiry are explicit terminal paths. Offers may arrive while searching.
- Offer: draft -> submitted -> availability_pending -> available/unavailable; available -> accepted/rejected/withdrawn/expired. A supplier material edit after buyer selection invalidates that selection and requires buyer reconfirmation; never silently alter an accepted snapshot.
- Supplier availability is not guaranteed by AI ranking or listing publication. Only a supplier-authorized confirmation with timestamp can mark it confirmed.
- An offer is selectable only while available, within supplier-provided validity, for the requested quantity or a clearly disclosed partial quantity.
- Cross-border offers are explicitly labelled and grouped separately from destination-country offers. Never silently replace local sourcing with an imported result.
- No payment capture, supplier payout, commission, refund, or live shipment integration is included in this first domain slice.

## API contract (implemented foundation; discovery is not yet AI-powered)
- `POST /api/sourcing-requests`: authenticated buyer creates a submitted request; idempotent; request and submission event are committed atomically. It does not create an order or reserve stock.
- `GET /api/sourcing-requests`: buyer lists only their own requests.
- `GET /api/sourcing-requests/:id`: buyer-owned detail with offers visible to that buyer.
- `GET /api/sourcing-opportunities`: authenticated active supplier/manufacturer members receive open requests grouped into destination-country matches first and cross-border requests second. The response includes only active supplier accounts belonging to the signed-in user and does not expose buyer contact or delivery-address data.
- `POST /api/sourcing-requests/:id/offers`: authorized supplier account member submits an offer. The API verifies active supplier/manufacturer membership and derives origin country from the supplier account. Availability starts pending.
- `PATCH /api/sourcing-offers/:id/availability`: supplier member confirms or rejects availability; offer update, request status update, and event log are transactional.
- `POST /api/sourcing-requests/:id/accept-offer`: buyer explicitly accepts an eligible offer; idempotent and transactional; creates a sourcing order snapshot in `awaiting_payment`. It does not initiate payment.
- Malformed JSON is rejected as a client validation error. Request quantities are bounded to the database integer range and offer prices/shipping are validated against database precision.
- Supplier membership and account status are rechecked at offer acceptance. A requested currency, when supplied, must match the selected offer currency.
- AI sourcing/search is not implemented yet. The current opportunity feed is a transparent supplier-facing discovery endpoint, not an AI search result and not a claim of verified live availability or price.

## Current implementation boundaries
- The current first slice does not yet implement supplier offer editing/versioning, sourcing order list/detail APIs, payment, supplier payouts, shipment tracking, dispute/refund workflows, or external supplier discovery.
- Store catalog and inventory remain merchant-owned. The sourcing request/offer/order path does not reserve or decrement store inventory.
- The `sourcing_request_events` table is the current append-only event record used for request and offer activity in this slice.
- Buyer and supplier web entry points exist for request submission, request/offer review, supplier opportunity browsing, and offer submission. Full end-to-end UI verification still requires authenticated test accounts and a connected test database.

## Authorization and abuse controls
- Derive buyer identity from the Better Auth session, never from request-body user IDs.
- Derive supplier account access from persisted active account membership and account status; never trust a submitted account ID alone.
- Buyers may read only their own requests/offers/orders. Suppliers may read/respond only to requests explicitly made available to them and may mutate only their own offers.
- Add explicit permission keys and role mappings after reviewing the current shared permission registry and database role seeding together. Do not rely on UI-only checks.
- Apply request-size limits, strict schemas, rate limits, idempotency, audit logging, and safe error responses.
- Do not expose buyer contact/address data to suppliers until the buyer has selected the offer and the approved fulfilment workflow requires it.

## Implementation sequence
1. Add shared domain types and pure state-transition/validation tests.
2. Add Drizzle table definitions for requests, offers, offer events, and sourcing orders, plus a generated, reviewed migration. Keep current store inventory tables intact.
3. Add authenticated API handlers and route registration with buyer/supplier ownership tests.
4. Add transactional offer acceptance, uniqueness/idempotency and concurrency tests; test that sourcing request creation and offer creation never mutate `store_products` or inventory movements.
5. Build buyer and supplier UI workflows, then connect a real supplier discovery provider only after its source, terms, and reliability are defined.
6. Reconcile legacy store checkout separately; do not enable it as the sourcing purchase path.
7. Run CI and review migration SQL before any deployment. Production migration and deployment require explicit approval.

## Decisions still required before live commerce
Payment provider and merchant-of-record model; supplier payout/settlement; marketplace commission; tax/customs calculation responsibility; shipping/carrier integrations; supplier verification standard; dispute/refund policy; legal jurisdiction and consumer/business terms. These must remain configurable or explicitly out of scope until approved.
