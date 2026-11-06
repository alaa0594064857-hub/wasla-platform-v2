# WASLA V2 — Payments and Shipping Integration Foundation

## 1. Purpose and boundary

This document defines a provider-neutral integration contract for online payments and physical-order fulfillment. It is an architecture specification only: it does not add database tables, call a payment processor, create carrier accounts, store credentials, or change production services.

For demand-led sourcing orders, the accepted supplier offer snapshot is the source of truth for supplier, item, quantity, price, currency, shipping, and order totals. WASLA does not reserve or deduct a central warehouse stock balance; supplier-owned availability is confirmed per request. Legacy catalog-order records remain isolated for historical compatibility. Payment and shipment lifecycles are separate from the existing order workflow status.

## 2. Payment domain

### 2.1 Payment records

When a provider is selected, introduce a payment-attempt record linked to an order. Keep the order's immutable currency and grand total as the authoritative amount due.

Recommended fields:
- Internal UUID and order UUID.
- Provider key and provider account/environment identifier (never a secret).
- Provider payment/intent reference, nullable until created.
- Amount and ISO-4217 currency copied from the order at payment initiation.
- Internal status: pending, requires_action, authorized, captured, failed, cancelled, partially_refunded, refunded.
- Idempotency key unique within the provider/account scope.
- Safe provider status/code fields and timestamps for creation, authorization, capture, failure, cancellation, and refund.
- Created/updated timestamps.

Do not store PAN, CVV, bank credentials, or reusable raw payment credentials. Use provider-hosted checkout or provider tokenization/SDK flows so sensitive payment details go directly to the provider.

Allow multiple attempts for an order, but prevent more than one successful capture for the order's payable balance. Amounts and currencies must be checked server-side against the immutable order total before a payment attempt is created or finalized.

### 2.2 Provider adapter contract

Keep provider-specific SDKs and API details behind a server-side adapter with operations equivalent to:
- create checkout/payment intent for a known order amount and currency;
- retrieve the authoritative provider payment state;
- capture an authorized payment, if the chosen provider and business policy use separate authorization/capture;
- cancel an uncaptured authorization/payment;
- issue a full or partial refund;
- verify webhook signatures using the unmodified request body and the provider's signing secret.

The adapter must return normalized internal results. Provider names, event names, status strings, and raw payloads must not leak into order business logic.

No provider is selected in this phase. Selection must account for WASLA's actual legal entity and country of registration, supported merchant countries, settlement bank availability, buyer countries, currencies, local payment methods, fees, dispute handling, marketplace/split-payment needs, and onboarding requirements. Do not assume that a provider supports a business solely because buyers can access its checkout.

### 2.3 Payment state and order state

**Authority rule:** only a verified server-side payment integration may transition a sourcing order into `paid`. Buyers, suppliers, browser redirects, client-submitted status values, and manual tracking updates are never payment evidence. Supplier endpoints accept only `paid → fulfilment_pending` and `fulfilment_pending → shipped` as fulfillment transitions; they cannot set `paid`. Until a provider-backed payment verification flow exists, accepted sourcing orders remain `awaiting_payment` and fulfillment stays blocked.



Payment status is not order status. A placed order is not automatically paid. Store workflow actions must not imply payment completion.

Before enabling real checkout, define the fulfillment policy explicitly:
- whether stock is deducted at order placement or reserved for a limited payment window;
- whether unpaid orders expire and how stock is restored exactly once;
- whether capture occurs before acceptance, before shipment, or at another defined point;
- which order states are allowed after payment failure, cancellation, or refund.

Until that policy and provider integration are implemented, the current checkout must be described as order placement / cash-on-delivery or manual-payment capable only if that option is explicitly configured. It must never display a false “paid” state.

### 2.4 Webhook inbox and reconciliation

Webhook handling must:
- read the raw request bytes before JSON parsing;
- verify the provider signature and timestamp according to the provider's official rules;
- reject invalid signatures;
- persist a unique provider event ID before processing;
- process each event idempotently and tolerate duplicate/out-of-order delivery;
- retrieve the payment from the provider when event data is insufficient or conflicts with local state;
- verify provider account, order reference, amount, and currency;
- update payment state and write an audit record in one database transaction;
- never accept a browser redirect/query parameter as proof of payment.

Persist only the minimum provider event metadata needed for replay, audit, and reconciliation. Redact secrets and payment data from logs. Add a scheduled reconciliation process for payments left in pending/unknown states.

## 3. Shipping and fulfillment domain

### 3.1 Shipment records

When shipping implementation begins, support one or more shipments per order so partial fulfillment is possible. A shipment should reference its order and store and contain:
- internal UUID and a stable shipment number;
- fulfillment status: pending, ready, booked, in_transit, delivered, failed, cancelled, returned;
- carrier/provider key, nullable for manual fulfillment;
- service code and a snapshot of the selected service/rate;
- recipient/destination snapshot copied from the order, with restricted access;
- tracking number and tracking URL only when supplied by the carrier;
- provider shipment/label references, not credentials;
- label metadata or a protected file reference, never a public unrestricted URL;
- shipped/delivered timestamps and created/updated timestamps.

Shipment line items must record which quantities of each order line are included. The total shipped quantity across shipments must never exceed the ordered quantity.

### 3.2 Carrier adapter contract

A carrier adapter may later expose:
- service/rate lookup for a validated destination and parcel dimensions/weight;
- shipment booking;
- label purchase and retrieval;
- tracking lookup and normalized tracking events;
- cancellation/void where supported;
- return-label workflow where supported.

Carrier capabilities differ. The normalized interface must represent unsupported operations rather than pretending all carriers support them. Manual fulfillment and tracking entry should remain possible without a carrier API.

Do not promise shipping rates, delivery estimates, customs handling, or service availability until they are returned by a configured carrier and validated for the origin/destination.

### 3.3 Shipping cost and order totals

Shipping charges must be quoted and persisted as a server-validated immutable order amount before payment. A carrier response must not silently rewrite a placed order's grand total. If a quote expires or changes, require a new buyer confirmation or a controlled adjustment workflow with an auditable record.

The initial release can use a store-configured flat rate, free-shipping rule, or manual quote, provided the exact method and amount are shown to the buyer before order placement. Do not call a placeholder zero amount a carrier quote.

### 3.4 Privacy and access

Shipping addresses and recipient phone numbers are private personal data. Expose them only to the buyer, authorized staff fulfilling that store's orders, and the minimum server-side integration required by the selected carrier. Public storefront/catalog/search endpoints must never return these fields.

Use least-privilege access, short-lived signed downloads for labels where needed, retention rules, and redaction in logs and support tools.

## 4. Audit, reliability, and tests

- Record payment initiation, authorization, capture, failure, cancellation, refund, webhook rejection, and reconciliation outcomes.
- Record shipment quote selection, booking, label creation/void, tracking updates, delivery, failure, and return events.
- Use idempotency keys for every externally mutating provider operation.
- Use transactional outbox/inbox patterns for reliable asynchronous work; do not hold a database transaction open while making a network call to a provider.
- Retry only transient failures with bounded exponential backoff and jitter; send exhausted jobs to a reviewable dead-letter state.
- Never let a duplicate webhook, retry, or worker replay capture money twice, refund twice, ship duplicate quantities, or restore inventory twice.
- Test signature verification, forged and replayed webhooks, duplicate/out-of-order events, amount/currency mismatch, provider timeouts, idempotency, partial refunds, partial shipments, tracking updates, and authorization boundaries.
- Keep all provider calls mocked in CI. Use provider sandbox credentials only after a provider is deliberately selected; never place live credentials in source control or test fixtures.

## 5. Delivery sequence

1. Confirm WASLA's legal merchant entity/country and settlement capability before choosing a payment provider.
2. Compare eligible providers and choose one based on merchant eligibility, international reach, payment methods, currencies, fees, disputes, and future marketplace requirements.
3. Agree on unpaid-order expiry, stock reservation, capture, cancellation, and refund policy.
4. Add payment tables, migration, adapter interface, webhook inbox, audit events, and provider-mocked tests.
5. Implement sandbox checkout and end-to-end verification; keep live mode disabled.
6. Confirm shipping origin, fulfillment model, parcel data, target countries, and preferred carriers.
7. Add shipment tables, shipment-line quantities, manual fulfillment, then carrier adapters and mocked tests.
8. Run CI and review the feature branch. Production migration, deployment, live payment activation, and paid carrier account changes require separate explicit approval.

## 6. Current implementation truth

At this stage WASLA has a demand-led sourcing order workflow. Supplier order status changes are audited in `sourcing_order_events`; the supplier workspace permits `paid → fulfilment_pending` and `fulfilment_pending → shipped`, and requires a manual tracking reference before the latter transition. The buyer order list displays the supplier's shipment status and manually supplied tracking reference/carrier. This is supplier-entered tracking metadata, not carrier-verified live tracking. Buyers and authorized members of the supplier account can read the order activity timeline through the order-history endpoint; access is scoped to the order buyer or an active member of the supplier/manufacturer account. No payment gateway, payment webhook, carrier-rate integration, label purchasing, or live carrier tracking is implemented. Buyer delivery confirmation is a buyer-reported receipt action after the supplier marks an order shipped; it is not carrier-verified proof of delivery. Orders remain `awaiting_payment` until a separately verified payment integration changes that state; suppliers cannot mark an unpaid order as paid or ship it.
