# WASLA V2 — Demand-Led Sourcing (Architecture Decision)

## Status
Accepted product direction. This decision supersedes any assumption that WASLA centrally owns, purchases, warehouses, or reserves goods. It does not authorize production deployment or payment activation.

## Core business model
WASLA is a demand-led sourcing and commerce platform. A buyer describes what they need and where they need it. WASLA AI searches for suitable suppliers and offers in the buyer's requested destination country first, presents comparable options, and helps the buyer choose. The buyer reviews supplier identity, product/service details, origin, availability confirmation, price, currency, delivery terms, estimated timing, and applicable fees before paying.

The goods remain owned and held by the independent supplier until the supplier fulfils the transaction. WASLA does not operate a central warehouse and does not maintain platform-owned stock.

## Buyer journey
1. Buyer submits a sourcing request: item/specification, quantity, destination country/city, acceptable alternatives, and delivery requirements.
2. AI interprets and structures the request, then searches eligible suppliers and listings in the same country as the requested destination.
3. If no suitable local-country match is found, AI may present cross-border alternatives separately and clearly identify country of origin, shipping, customs, and timing implications. It must not silently substitute another country.
4. AI returns sourced offers with supplier identity/verification status, exact match or differences, supplier-confirmed availability and timestamp, item price/currency, delivery estimate/terms, fees, and total payable where determinable.
5. Buyer compares offers, selects one, and confirms final order details and total.
6. Payment is initiated only against the selected supplier offer and a server-validated payable amount. Payment confirmation must come from a verified provider event or an authorized, audited manual confirmation—not a browser redirect.
7. Supplier receives the confirmed order and fulfils it. Shipment/tracking is handled as a separate lifecycle.

## Inventory boundary
- No platform-wide or AI-managed warehouse stock.
- No decrement of platform stock when a buyer submits a sourcing request.
- No inventory reservation merely because an AI search result or quote is displayed.
- Supplier availability is external, supplier-owned information. Store its source, confirmation timestamp, and expiry/valid-until when supplied.
- A supplier may confirm or reject availability and may update its offer before buyer acceptance. Material changes require buyer re-confirmation.
- If a supplier operates a WASLA storefront, any catalog quantity shown belongs to that supplier/store, not to WASLA centrally. Do not treat it as guaranteed until the supplier confirms it for the selected request.
- A buyer request is not a paid order; an offer is not a confirmed order; a payment initiation is not a successful payment.

## AI responsibilities and safeguards
AI may classify the request, search and rank offers, explain differences, detect missing details, and prepare a comparison. AI must not invent stock, supplier confirmations, prices, delivery promises, fees, or payment success. Search ranking must disclose relevant factors and must not hide a suitable same-country offer solely to promote a cross-border option. Supplier selection and payment require the buyer's explicit choice and confirmation.

## Required domain separation
Model these as distinct records/states:
- Sourcing request: draft, submitted, searching, offers_available, buyer_selected, fulfilled, cancelled, expired.
- Supplier offer/quote: draft, submitted, availability_pending, available, unavailable, withdrawn, expired, accepted, rejected.
- Order: created only from the buyer-accepted offer; its commercial snapshot is immutable except through an explicit, audited change/confirmation flow.
- Payment: pending, authorized/captured or provider-normalized equivalents, failed, cancelled, refunded; independent of order and shipment status.
- Fulfilment/shipment: supplier acceptance, preparation, dispatched, in_transit, delivered, failed, returned/cancelled as applicable.

Use supplier ownership and authorization boundaries throughout. A supplier may access only its own offers and orders. A buyer may access only their own requests, selected offers, orders, payments, and delivery details. AI/admin tools must respect these same permissions and audit sensitive actions.

## Commercial and operational requirements
- Make the destination country the primary sourcing scope, not the buyer's inferred current location.
- Capture country, city/region, currency, quantity, specifications, and delivery terms explicitly enough to compare offers.
- Show cross-border alternatives separately, including known shipping/customs/tax uncertainties.
- Persist the exact accepted offer snapshot: supplier, product/specification, quantity, unit price, currency, fees, delivery terms, availability confirmation, and total.
- If final shipping/tax cannot be determined before checkout, disclose that and obtain buyer confirmation of the final amount before collecting payment.
- Supplier payout, marketplace commission, refunds, disputes, and legal merchant-of-record responsibilities require a separate approved commercial/legal design before live payments.

## Implementation impact and current gap
The current PR implementation is a single-store catalog checkout. Its apps/api/src/orders.mts flow locks store_products, requires sufficient stock_quantity, decrements that quantity at order placement, and restores it on cancellation. This is not the approved demand-led sourcing flow and must not be represented as compliant with this decision.

Before this PR can be considered ready for the intended WASLA business model:
1. Keep the current code isolated from production; do not deploy or enable live checkout.
2. Design sourcing requests and supplier offers as first-class domains.
3. Replace buyer checkout against a platform/store stock assumption with buyer selection and acceptance of a supplier-confirmed offer.
4. Remove any central/platform inventory deduction or reservation from the sourcing-request path.
5. Define supplier-side availability confirmation and quote expiry without pretending that supplier stock is platform-owned.
6. Create an order only from a buyer-accepted offer, with an immutable commercial snapshot.
7. Add authorization, audit, idempotency, concurrency, and integration tests for offer changes, buyer acceptance, duplicate payment events, and supplier fulfilment.
8. Review and reconcile existing test data/migrations on the feature branch only; do not reinterpret or alter production data.

## Explicit non-goals
This decision does not select a payment provider, carrier, commission rate, payout method, supplier verification vendor, or legal jurisdiction. It does not authorize production migrations, deployment, or live transactions.