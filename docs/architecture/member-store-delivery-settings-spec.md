# Member-store delivery settings and order readiness

## Goal

Let each merchant describe where and how it fulfils orders without implying that WASLA provides a global carrier network, guarantees delivery, collects payment, or confirms a shipment.

This is a merchant-configured delivery declaration and an order-time snapshot. It is not a carrier integration.

## Merchant settings

Add a bilingual settings panel to the authenticated shop-management page with:

- Fulfilment methods: merchant delivery, customer pickup, or both.
- Delivery coverage: explicit country and region/city entries maintained by the merchant. Do not default to worldwide coverage.
- Delivery fee and currency, including an explicit "fee confirmed with buyer" option when the merchant cannot publish a fixed fee.
- Estimated preparation/transit window as a merchant estimate, not a guarantee.
- Merchant instructions and a contact route.
- Settings are disabled until the merchant explicitly saves them. An empty coverage list means delivery coverage is not declared.

Validation:
- Require at least one fulfilment method.
- Require at least one explicit coverage entry before enabling delivery.
- Fees must be non-negative decimal amounts and use a valid ISO currency.
- Do not accept a delivery method or coverage value from the buyer that is not in the store's currently saved settings.
- Changes must be audited and authorized by the existing store/account update permissions.

## Buyer order request

Extend the existing member-store order request flow only after the merchant settings UI/API is implemented:

1. Buyer selects one of the store's enabled methods.
2. For delivery, buyer selects a merchant-declared destination entry and supplies only the minimum delivery details needed by the merchant.
3. The server validates the selected method and destination against the store settings inside the order transaction.
4. Snapshot the exact method, destination label, fee/currency (or fee-to-be-confirmed flag), estimate and settings version onto the order. Never recalculate an old order from subsequently edited store settings.
5. If the fee is pending confirmation, show it clearly as excluded from the recorded merchandise subtotal and require merchant confirmation before the buyer accepts a final quote.
6. Keep the current order state as a request pending merchant review. It is not paid, confirmed, or dispatched.

## Merchant order desk

Show the saved fulfilment snapshot on each order. The merchant must explicitly confirm or correct the final delivery fee and delivery estimate before the buyer accepts the final quote. Shipping carrier, tracking number and URL remain separate shipment evidence fields and must not be fabricated from the delivery declaration.

## Privacy and security

- Do not expose customer delivery details in public catalog responses.
- Return delivery details only to the order's buyer and authorized store/account order managers.
- Do not put full addresses in notifications, analytics, audit metadata, or public URLs.
- Apply existing authorization and account/store isolation checks.
- Validate all input server-side; client-side validation is supplementary.
- Preserve immutable order event history and record changes to the confirmed fulfilment terms.

## Release gates

- Additive, idempotent database migration with safe defaults that leave existing stores with no declared delivery coverage.
- API tests for authorization, cross-store isolation, invalid destinations, currency/fee validation, and snapshot immutability.
- Web tests for Arabic/English merchant settings and buyer request flow.
- Two separate authenticated accounts (buyer and merchant) tested end-to-end against a deployed environment.
- Confirm that no payment is collected, no inventory is represented as reserved before merchant acceptance, and no carrier integration is implied.
- Do not enable this in production until the migration, tests, privacy review and hosted end-to-end checks pass.

## Current implementation boundary

The repository already has member-store order requests, merchant accept/reject, order events, carrier/tracking fields, and a buyer-facing store page. The present shop settings API only updates the shop name; the current order request records product lines and buyer note but does not collect a delivery method or destination. This document defines the next additive slice and deliberately does not change production behavior.
