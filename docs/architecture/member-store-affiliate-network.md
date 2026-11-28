# WASLA Member-to-Member Affiliate Network

Status: proposed implementation specification. This document does not enable affiliate tracking, create commission liabilities, publish offers, or authorize payouts.

## Product intent

Let a member operate an independent WASLA store and, separately, promote products from other participating WASLA stores for an agreed commission. A member may be a buyer, merchant, affiliate, supplier, or more than one of these at the same time.

The network must attract members rather than restrict shopping:
- Every visitor may discover and view publicly published products from eligible stores.
- An affiliate may choose which participating stores and eligible products to feature.
- A merchant keeps ownership of products, prices, stock, fulfilment, customer relationship, and store administration.
- A merchant's participation is opt-in. No store or product is enrolled automatically.
- The affiliate relationship never grants access to another store's private dashboard, customers, orders, inventory controls, or supplier data.

## Roles and terminology

- Merchant: the account that owns the source store and product.
- Affiliate: an authenticated member account promoting an eligible product.
- Customer: the buyer; no affiliate account is required.
- Program: a merchant-owned agreement describing eligible products, commission basis, rate, attribution window, exclusions, and return/cancellation rules.
- Application: an affiliate's request to join a merchant program or promote selected products.
- Attribution: immutable association between an eligible order line and the affiliate who referred the customer.
- Commission: a calculated ledger amount. It is not a payment, wallet balance, or guarantee of payout.

## Merchant controls

1. A merchant explicitly enables an affiliate program for their store.
2. The merchant chooses eligible products individually or by a clearly previewed selection.
3. The merchant sets the commission rate or fixed amount, currency, attribution window, eligible markets, and terms.
4. The merchant can approve or reject affiliate applications and pause future referrals.
5. Changes to terms apply prospectively only. Existing accepted applications and attributed orders retain a versioned terms snapshot.
6. The merchant can revoke a product from future promotion without erasing historic clicks, orders, or ledger entries.

## Affiliate experience

1. A member can browse participating programs and inspect their terms before applying.
2. An affiliate can apply to a program and optionally select specific eligible products.
3. Once approved, WASLA generates a unique, unguessable referral token and shareable product/store links.
4. The affiliate can add approved products to their own store as clearly labelled partner listings. The listing links to the merchant's canonical product page; it is not a copied inventory item.
5. The affiliate dashboard shows clicks, attributed orders, conversion, pending/approved/reversed commission, and the applicable terms.
6. Affiliate listings must disclose the commercial relationship clearly in Arabic and English.

## Attribution and order lifecycle

- Capture a valid referral token when a customer opens a merchant product/store page.
- Attribute only when the token maps to an active, approved affiliate relationship and an eligible product/program at the time of click.
- Persist the attribution server-side with a bounded expiry and first/last-click rule explicitly shown in program terms. Initial default recommendation: last eligible click within 30 days.
- On checkout/order creation, copy attribution and the accepted terms version to the order line in the same database transaction. Never trust a browser-submitted affiliate user ID or commission rate.
- Prevent self-referrals, duplicate attribution, tampering, and cross-store product substitution.
- Commission is first recorded as pending. It becomes eligible only after merchant acceptance/fulfilment and the configured return/cancellation window has elapsed.
- Cancelled, refunded, disputed, fraudulent, or returned quantities reverse or reduce commission through compensating ledger entries; never delete or rewrite a posted ledger event.
- If the merchant's current order flow cannot establish paid/fulfilled/returned state reliably, keep commissions informational/pending and do not label them payable.

## Initial commission calculation

- Support percentage of eligible net merchandise subtotal and fixed amount per eligible unit as separate, explicit methods.
- Exclude shipping, taxes, duties, tips, discounts, refunded quantities, and ineligible products unless the merchant's accepted terms explicitly and lawfully state otherwise.
- Store rates as decimal values with bounded precision; calculate monetary amounts in integer minor units using the order currency's fraction digits.
- Snapshot rate, method, currency, eligible subtotal, affiliate, merchant, program, product, order line, and terms version at attribution/order time.
- Never combine currencies or convert without a recorded, approved FX source and timestamp.
- Display estimates separately from confirmed ledger amounts.

## Data model proposal

- `store_affiliate_programs`: store_id, status, default terms, attribution window, attribution rule, created_by, version, timestamps.
- `store_affiliate_program_products`: program_id, product_id, commission_method, commission_rate_or_amount, currency, eligibility, active state.
- `store_affiliate_applications`: program_id, affiliate_account_id, requested scope, status, decision metadata, timestamps; unique active application per affiliate/program.
- `store_affiliate_links`: application_id, product_id nullable, token_hash, status, created_at, revoked_at; store only a hash of the secret token.
- `store_affiliate_clicks`: link_id, clicked_at, minimal privacy-safe event metadata; apply retention limits and avoid storing raw IP addresses.
- `store_order_attributions`: order_line_id unique, link/application/program IDs, merchant/affiliate account IDs, terms version snapshot, click time, attribution expiry.
- `store_affiliate_commission_ledger`: append-only entries for pending, approved, reversed, adjusted, and manually settled states; unique idempotency key and source order-line reference.
- `store_affiliate_events`: append-only audit trail for applications, decisions, terms changes, product enrollment, link revocation, and ledger actions.

All foreign keys must be scoped and validated against the same merchant store, product, program, and affiliate application. Add indexes for merchant dashboards, affiliate dashboards, token lookup, and idempotent order-line attribution.

## API and UI work packages

1. Merchant program management:
   - `GET/POST /api/stores/:slug/affiliate-program`
   - `PATCH /api/stores/:slug/affiliate-program/:programId`
   - product eligibility and commission-term management
   - merchant application review inbox
2. Affiliate discovery and applications:
   - `GET /api/public/affiliate-programs` (only active, discoverable programs and public terms)
   - `POST /api/affiliate/applications`
   - `GET /api/affiliate/applications`
   - accept/reject actions scoped to the owning merchant
3. Link and attribution:
   - authenticated link creation for approved applications
   - public redirect/click endpoint using hashed tokens
   - referral context capture on public product pages
   - transactional order-line attribution in the existing member-store order creation flow
4. Dashboards:
   - merchant: referred clicks, orders, pending and approved commissions, reversals
   - affiliate: active programs, promoted products, clicks, orders, estimated and confirmed commission
5. Support and disputes:
   - immutable event history, reasoned adjustments, merchant/affiliate dispute path, owner audit access.

## Security, privacy, and legal safeguards

- Every merchant operation must verify active account/store membership and the exact store-scoped permission server-side.
- Affiliate actions must verify the authenticated affiliate account owns the application/link.
- Public endpoints expose only published product facts and public program terms, never customer, merchant-private, supplier, cost, or order data.
- Use CSRF protections consistent with existing authenticated APIs, strict input validation, rate limits, token hashing, and idempotency.
- Do not use client-provided rates, affiliate IDs, order totals, or statuses as authoritative values.
- Provide clear disclosures, consent/cookie handling where required, privacy retention rules, tax/legal review, and market-specific eligibility.
- No wallet, escrow, split payment, automatic payout, or custody of merchant funds in the first release. Manual settlement records are evidence-only and must not imply a payment provider is connected.
- Pause the program globally or per store without deleting historic attribution or ledger records.

## Release gates and tests

- Two-account isolation: merchant A cannot read or modify merchant B's program, applications, links, orders, or ledger.
- Affiliate isolation: affiliate A cannot access affiliate B's private analytics or links.
- Buyer journey: eligible referral click -> merchant product page -> order line -> attribution persisted exactly once.
- Non-eligible, expired, revoked, self-referral, cross-store, and tampered tokens create no attribution.
- Terms changes never retroactively alter an existing application/order snapshot.
- Cancellation, partial return, full refund, and duplicate webhook/event tests create correct compensating ledger entries.
- Concurrent clicks/order submissions are idempotent and do not duplicate commission.
- Currency precision, rounding, discount allocation, tax/shipping exclusion, and zero/negative subtotal tests.
- Arabic/English disclosure and accessible merchant/affiliate UI tests.
- Do not enable public enrollment or claim commissions are payable until all release gates and hosted two-account end-to-end tests pass.

## Phased delivery

- Phase 1: merchant opt-in programs, product eligibility, applications, approval, public program discovery.
- Phase 2: referral links, privacy-safe click tracking, attribution capture on member-store orders.
- Phase 3: immutable commission ledger, returns/reversals, merchant and affiliate dashboards.
- Phase 4: manual settlement evidence and export; any actual payouts require separate legal, tax, provider, and owner approval.

The public shopping experience remains open: anyone may view and buy published products regardless of whether they are an affiliate or paid subscriber.