# WASLA Orders and Fulfillment — Operating Specification

Status: implementation guardrails for the next commerce milestone  
Date: 2026-11-07

## Separate order models

### Member-owned store orders

- The member merchant remains the seller of record and owns the customer payment, order acceptance, stock/availability representation, packing, shipping, returns and customer service.
- WASLA may provide catalog, inquiry, order-status and communication tools, but it does not hold member-sale funds, split payments or pay out merchants.
- A member checkout may use the merchant's approved checkout provider. An order is marked paid only after a verified provider webhook or an authenticated merchant-side confirmation supported by the agreed integration.

### Official WASLA Store orders

- The official store is a separate selling operation. WASLA is responsible for its customer-facing price, seller disclosures, payment, tax/customs disclosures, delivery promises, returns and support.
- Supplier identity, supplier cost and private source offers remain owner-only. Customer-facing legal disclosures (seller, origin, duties/taxes, delivery and returns) must not be hidden.
- Supplier-direct fulfillment is permitted only when the exact variant/specification, supplier identity, stock, final cost, destination coverage, direct-shipping capability, delivery estimate, tracking and return terms are verified.
- No silent product substitution. If the exact offer becomes unavailable or changes materially, obtain customer approval or refund according to policy.

## Payment verification

- Never mark an order paid from a browser redirect, screenshot, client-side flag or unverified API response.
- A payment event must have a verified provider signature, provider event ID, order reference, amount and currency match, and idempotent processing.
- Duplicate, delayed, out-of-order or mismatched events must not duplicate fulfillment or change the wrong order.
- Refunds, chargebacks, disputes, new supplier onboarding and exceptional procurement require explicit human approval.
- The provider, merchant account, settlement country/currency and applicable legal entity must be approved before production checkout is enabled.

## Order lifecycle baseline

`draft → pending_payment → paid → processing → shipped → delivered`

Alternative states: `payment_failed`, `cancelled`, `refund_requested`, `refunded`, `disputed`.

- `paid` is reachable only through verified payment confirmation for the relevant order type.
- `processing` requires an accepted seller/fulfillment commitment.
- `shipped` requires a carrier/tracking reference or a documented manual fulfillment record.
- `delivered` requires a supported delivery confirmation, not a seller-entered free-form claim alone.
- Refund and dispute transitions retain the complete event history.

## No central inventory

- Member inventory remains controlled by each member merchant.
- The official store does not maintain speculative stock. It validates supplier availability at quote/order time and records the evidence timestamp.
- Product source offers and their private supplier details are separate from public product records.

## Release gates

- Choose and approve the payment provider(s), merchant-of-record model, supported countries/currencies and settlement process.
- Complete legal review for consumer rights, taxes, customs, privacy, returns and seller disclosures in launch markets.
- Implement signed webhook verification, idempotency, order/payment event history and negative tests.
- Test buyer and seller accounts end-to-end with real approved test-mode provider credentials before any live transaction.
- Verify supplier direct-shipping, tracking and return evidence for official-store orders before enabling automated procurement.
