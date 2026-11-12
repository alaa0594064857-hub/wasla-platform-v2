# WASLA Affiliate Commerce Integration — Phase 1

Status: architecture specification only. No affiliate links, product data, images, prices, or checkout are enabled by this document.

## Goals

- Add a compliant affiliate-commerce channel without changing WASLA's existing merchant-owned store or official-store sourcing/order workflows.
- Start with Amazon.com Associates using the approved tracking store ID `waslatrade-20`.
- Keep the US Amazon program distinct from any future Turkey-local affiliate program. Do not assume the US Associates account authorizes referrals to Amazon.com.tr or other Amazon marketplaces.
- Preserve WASLA Arabic/English presentation and destination-aware browsing.

## Commercial and user-flow boundaries

1. WASLA displays eligible editorial/product discovery content and a clearly identified affiliate action.
2. The customer follows the outbound link and completes checkout, payment, shipping, returns and customer service with Amazon.
3. WASLA does not collect the Amazon order total, promise Amazon fulfilment, place orders on the customer's behalf, or represent the affiliate channel as WASLA inventory.
4. Affiliate earnings are commission referrals, not WASLA checkout revenue. Do not create a WASLA order or payment record for an Amazon referral.
5. Show a clear disclosure near affiliate links and on the relevant page, for example: “As an Amazon Associate I earn from qualifying purchases.” Provide an Arabic equivalent where the page is Arabic.
6. Do not publish Amazon product links before the Associates account is eligible/approved for the intended use. Track the initial 180-day qualified-sales review requirement separately from the account's initial registration and tax/payment setup.

## Data and connector design

Create an isolated affiliate connector contract rather than extending supplier offers:

- `program`: provider, marketplace/domain, country, currency, tracking ID, status, disclosure text, terms-reviewed timestamp.
- `affiliate_item`: provider item identifier (e.g. ASIN), localized title/description only when licensed, marketplace, destination eligibility, source attribution, last verified timestamp, publication state.
- `affiliate_link`: canonical outbound URL, tracking ID association, link type, locale, active/disabled state, audit metadata.
- `affiliate_click`: item/program reference, timestamp, anonymous or consented attribution token, page/locale and coarse destination; never store Amazon credentials or sensitive payment data.

Keep provider data and referral links separate from WASLA-owned products, supplier offers, supplier costs, customer quotes, and WASLA order lifecycle.

## Data rights and freshness gates

- Use Amazon's approved Product Advertising API or another explicitly authorized Amazon-provided mechanism for product content. Do not scrape Amazon pages.
- Do not copy product images, ratings, reviews, availability or prices from Amazon pages or search snippets.
- Do not invent products, ASINs, prices, discounts, delivery promises or stock.
- Apply Amazon's current rules for API access, display, attribution, refresh/caching, link formatting, trademark use and required disclosures before enabling any data feed.
- If approved API access is not available, keep the affiliate catalogue unpublished; a manually curated editorial page must still use only content and links that Amazon's terms permit.
- Disable stale or unverified price/availability claims rather than showing cached values as current.

## Market routing

- Amazon.com US: the only initial Amazon affiliate program in scope, using tracking ID `waslatrade-20`, and only for eligible traffic and products under that program's terms.
- Turkey: do not redirect Turkish visitors to Amazon.com as though it were a local Turkish affiliate program. First evaluate a Turkey-eligible partner/program and its terms. Until then, show non-affiliate editorial content or a neutral marketplace notice without an unapproved tracking link.
- Do not geo-redirect automatically without an understandable user choice. Provide a visible marketplace selector and explain when the selected marketplace changes currency, shipping destination, or merchant checkout.

## Security and operations

- Keep API credentials server-side in the deployment secret store; never commit or expose them to browser code.
- Use separate credentials/configuration per marketplace and environment.
- Owner-only controls for enabling/disabling programs, publishing items and reviewing disclosures.
- Record changes to program status, tracking IDs, product publication and outbound links in an audit log.
- Do not place affiliate tracking IDs in customer order records or merchant settlement flows.

## Release gates

Do not mark the feature live until all applicable gates pass:

1. Associates account status and marketplace permissions verified.
2. API access/terms reviewed and credentials configured securely, if product data API is used.
3. Affiliate disclosure visible in Arabic and English on listing/detail/outbound-action surfaces.
4. US/Turkey marketplace separation tested.
5. Outbound links tested for correct tracking ID and destination.
6. No Amazon referral represented as a WASLA checkout/order.
7. Legal, privacy, cookie/analytics and consumer disclosure review completed for intended launch markets.
8. Hosted smoke tests and owner acceptance completed.

## Phase 1 implementation order

1. Add owner-managed program configuration and disclosure settings.
2. Add a private, unpublished affiliate-item workspace and provider-neutral data model.
3. Add a read-only public affiliate catalogue that returns only explicitly published and currently eligible items.
4. Add safe outbound-link handling and privacy-conscious click measurement.
5. Integrate Amazon's approved product data source only after access and terms are confirmed.
6. Add a separate Turkey program only after eligibility and provider approval are established.

Until these gates are complete, this is a planning specification and not a claim that WASLA's affiliate storefront is operational.
