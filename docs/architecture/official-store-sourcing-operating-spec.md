# Official WASLA Store — Supplier and Public Catalogue Rules

Status: implementation guardrails  
Date: 2026-11-07

## Supplier discovery and import

- Product payloads may be imported only from an approved, owner-controlled source registry entry or an explicitly supplied authorized merchant feed.
- Imports create sourcing candidates only. Every imported candidate starts as `unverified` and `needs_owner_review`; direct-to-customer shipping is false by default.
- Imported image URLs are references only. No image is copied or published automatically; image rights remain unreviewed until a human verifies them.
- A registered source is usable only when it belongs to the importing owner, has `permission_status='approved'`, and its provider matches the import adapter.
- No arbitrary marketplace crawling, unauthorized scraping, supplier contact, purchase or autonomous negotiation is implied by import.

## Source-offer approval

An offer may be approved only after all required evidence is present and current:

- Supplier identity verified.
- Exact product specifications verified.
- Supplier and product evidence URLs recorded.
- Single-unit direct-to-customer shipping confirmed.
- MOQ explicitly equals one.
- Availability is available or limited.
- Quote has a future expiry.
- Offer's material terms have not changed since approval. A material price, quote, availability, identity, specification or shipping change returns an approved offer to review.

## Public product visibility

A public official-store product must be published, the official store must be active, and its availability must be available or limited. It must also have at least one linked source offer that is approved and satisfies all of the following at read time:

- Direct-to-customer shipping confirmed.
- Supplier identity and specifications verified.
- MOQ exactly one.
- Shipping cost and currency present.
- At least one destination country recorded.
- Minimum and maximum delivery estimates present.
- Quote has not expired.
- Verification timestamp present.

The public catalogue response selects only customer-facing product title, description, price, currency, availability and image fields. It never selects supplier identity, supplier cost, supplier reference, source URL, shipping cost or private offer evidence.

## Customer and legal disclosure

Supplier identity and supplier costs remain private internal sourcing data, but this does not remove required seller-of-record, origin, customs/tax, delivery, warranty and returns disclosures. The customer must receive accurate product variant and delivery terms. Never silently substitute a different variant or supplier offer.

## Operational boundary

Passing these checks means a product may be shown in the public catalogue; it does not mean stock is reserved, an order is accepted, payment is collected or fulfillment is guaranteed. Those require their own verified order, payment and fulfillment workflow.
