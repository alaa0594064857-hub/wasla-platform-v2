# WASLA V2 — Master Plan Implementation Status

Last reviewed: 2026-11-08
Repository: `alaa0594064857-hub/wasla-platform-v2` (`main`)

This is an evidence-based implementation tracker, not a claim that the platform is commercially launch-ready. A feature is marked **Implemented** only where code exists and/or its production deployment or database state was verified. A live deployment does not by itself prove a complete end-to-end user journey.

## Product principles — approved

- Bilingual Arabic and English, with RTL/LTR support.
- Global commerce platform, serving individual sellers, traders, businesses, suppliers, factories, and brands.
- No central WASLA inventory.
- Member merchants own their products, customer payments, fulfilment, and shipping.
- WASLA does not take member sales commissions, hold merchant funds, split payments, or pay out merchants.
- WASLA revenue is separate: membership subscriptions and sales from the official WASLA Store.
- Official WASLA Store is separate from member-owned stores and is intended to be managed by an AI operations manager under the human platform owner's authority.
- The official-store catalogue may unify verified equivalent products from multiple external sources into one WASLA listing, while preserving separate supplier offers, variants, source provenance, image rights, costs and fulfilment records.
- Private member messages are not automatically visible to platform administrators or the official-store AI.

## Official-store customer experience and sourcing — approved principles

- Customers see WASLA as the store and their direct point of contact. Supplier marketplace names, supplier identities, supplier product URLs, sourcing notes, supplier purchase references, supplier costs and internal fulfilment communications are private operational data and must never appear in public product APIs, customer pages, receipts, order tracking or customer support messages.
- Supplier discovery is source-agnostic: local Turkish manufacturers, wholesalers, shops and distributors are eligible, as are verified suppliers in other countries and marketplaces such as Alibaba. Choose by product match, supplier reliability, landed cost, delivery and legal feasibility—not by marketplace brand.
- Suppliers may fulfil orders directly to customers, but the customer-facing experience, order communications and after-sales support remain branded and managed by WASLA.
- A product may only be listed with specifications supported by evidence. Verify supplier identity, exact model/variant/material/size/compatibility and other material attributes, current price and availability, shipping terms and direct-shipping commitment. Sample inspection or an independent inspection is preferred for material/high-risk products.
- Do not silently substitute a different model, material, size, configuration or quality grade. If the exact advertised item is unavailable, pause the offer or obtain the customer's explicit agreement to a clearly described alternative before payment/dispatch.
- Show only confirmed product availability to customers. Do not expose internal states such as awaiting supplier confirmation. Provide legally required seller, shipping, customs, returns and consumer-rights disclosures; brand consistency must never become concealment of legally material information.

## Status by area

| Area | Status | Evidence / remaining work |
|---|---|---|
| Fresh V2 repository and deployment | Implemented | Separate V2 repository; API and web services deploy from `main`. |
| Authentication foundation | Implemented, needs end-to-end retest | Better Auth integration and account flows exist; email delivery is still limited by Resend test-mode/domain verification. |
| Unified user profile | Implemented, needs retest | Profile route and user identity/profile services exist. |
| Business accounts and membership | Implemented foundation | Accounts, business profiles, account members and role/permission tables exist; full workflows need broader testing. |
| Member stores | Implemented foundation | Member store management and store tables exist. |
| Member product catalog | Implemented foundation | Product schema and seller-owned checkout URL exist; real product lifecycle needs testing. |
| Public store and product pages | Implemented foundation | Public catalog API and bilingual public pages exist; no production product records were available during prior review. |
| Member direct messages | Implemented foundation | Private conversation API and bilingual inbox exist; real two-account and access-isolation tests remain. |
| Product inquiries | Implemented foundation | Separate inquiry/reply/status API and bilingual seller inbox exist; real two-account tests remain. |
| Network/follows | Implemented foundation | Network tables and services exist; broader interaction tests remain. |
| Platform owner console | Implemented, read-only areas | Owner authorization, user directory and live account/store overview exist; many management actions are deliberately not enabled. |
| Platform security/audit | Partial | Owner authorization and audit foundations exist; security review and full audit coverage remain. |
| Subscription billing data model | Implemented foundation, verified in Render DB | Four tables exist: `subscription_plans`, `subscriptions`, `subscription_invoices`, `subscription_payment_events`. All are empty; no plans, subscriptions, invoices, or payment events have been created. |
| Subscription plan administration | Partial — deployed | Owner-only plan API and bilingual `/owner/subscriptions` console are deployed; Render API and web deploys for commit `ce6e2025e13270ab849afde03c5f9cedcc12771f` are both confirmed `live` (2026-11-07 review). Plans remain empty until the owner creates them. Public catalogue is read-only and only exposes active/public plans. End-to-end authorization/CRUD tests remain; customer self-service and subscription lifecycle are not implemented. |
| Subscription payment provider | Not implemented | Deferred until legal entity, operating jurisdiction, provider eligibility, pricing, tax and settlement requirements are confirmed. No live billing. |
| Official WASLA Store | Partial — public catalogue, supplier sourcing and multi-source offer administration deployed | Public catalogue and owner sourcing console `/owner/official-store/sourcing` are deployed. Latest web and API deploys for commit `6d5e7d92a18af1701dde89496721a05cd4f7d8b9` are confirmed `live` (2026-11-07). Render Postgres confirms source platform/URL, MOQ, direct-shipping, shipping countries/cost/estimates, quote expiry, supplier identity/specification/sample verification columns. Public catalogue SELECT excludes supplier identity, contact, source URLs, sourcing notes and supplier costs; exposes only published, active, available/limited products with confirmed direct shipping. New code foundation adds canonical product identifiers/specifications, separate source-offer records for multiple suppliers, source-specific price/shipping/availability/quote data, and media-rights provenance. An owner-only candidate matcher scores possible duplicates using GTIN, brand, model, MPN, title tokens and comparable attributes; owners can explicitly save a canonical identity after reviewing a match. This matcher and its bilingual owner UI are committed but their latest deployment/build validation is pending. The matcher is deterministic groundwork, not yet an LLM-based AI importer or live external-site crawler. A new owner-only import adapter endpoint now accepts authorized Shopify product payloads and normalized merchant-feed records, expands product variants into separate review candidates, and preserves source/image references as unreviewed evidence without copying or publishing images. This is an ingestion adapter only: it does not crawl arbitrary websites or fetch live supplier catalogs. Its latest deployment is pending validation. Render API startup completed successfully with the new schema initialization, and the bilingual owner source-offers page plus navigation link are deployed. The API build and web build succeeded for the relevant commits. Owner-only source-offer CRUD/review and full database-backed end-to-end behavior still require direct production testing. No live supplier discovery integration, AI runtime, checkout, supplier purchasing, or end-to-end sales workflow tested. |
| Official-store pricing engine | Preview foundation committed; deployment/build validation pending | Added owner-only `/api/platform/official-store/pricing/preview` calculation route. It converts supplier and shipping costs only when explicit FX rate, timestamp and source are supplied; accepts separately itemized verified additional costs (e.g. payment fees, taxes or customs); applies an explicit percentage and fixed margin; rounds using the target currency's minor-unit precision; returns a cost breakdown and warnings. Preview only: does not update catalogue prices, publish products, or place orders. No live FX feed, tax/customs estimator, persisted pricing rules or customer-facing price automation is claimed. |
| Official-store AI operations manager | Not implemented — sourcing policy and manual owner review foundation deployed | Source-agnostic policy supports Turkish local suppliers and global suppliers; the owner console captures supplier evidence, exact-specification evidence, supplier identity/specification verification flags, MOQ, direct shipping, shipping terms and quote expiry. This is a manual review queue, not AI research or verification. Planned next: external-source discovery, canonical product matching and variant separation, multi-supplier offer aggregation, bilingual content enrichment, authorized image provenance, owner-controlled sale pricing and offer refresh. No AI runtime, supplier search/contact automation, negotiation, pricing engine, order API, payment, or autonomous purchasing exists yet. |
| Official-store orders, checkout and fulfilment | Schema foundation added; APIs/workflow not implemented | Added order/event tables and fields for source marketplace, supplier purchase reference/status, direct-ship tracking, supplier cost and shipping. Need order APIs, supplier acceptance, dedicated official-store payment provider, seller-of-record, tax/import duties, returns and shipping integrations. Live checkout stays disabled until legal/provider arrangements are approved. |
| Orders and order management | Not implemented | Member sales remain outside WASLA payment custody; platform can optionally coordinate order information without becoming payment intermediary. |
| Trade/deal management | Deal negotiation, private opportunity intake, indicative matching and bilateral brokerage-term acknowledgement implemented; production verification pending | `apps/api/src/trade.mts` provides account-scoped deal negotiation. `apps/api/src/trade-opportunities.mts` provides private buyer/supplier submissions, account-scoped listing, owner review and deterministic indicative matching. `apps/api/src/trade-brokerage-agreements.mts` adds owner-prepared brokerage terms, party-scoped read access, separate buyer/supplier acceptance or rejection, expiry handling and event history. Owner pages `/owner/trade/opportunities`, `/owner/trade/matches`, `/owner/trade/agreements`; business page `/trade/agreements`. Agreement activation requires both parties to accept; this records acknowledgement only, is not legal advice or a guarantee of enforceability, and WASLA does not collect underlying trade funds. No external supplier verification/discovery, outreach, commission invoicing/collection, or payment/escrow handling is implemented. Matching tests and API CI workflow added; CI execution, two-account authorization, agreement lifecycle and current deployment verification remain required.
| Notifications | Not implemented / incomplete | No complete notification delivery and unread-state workflow verified. |
| Ratings and reviews | Not implemented | No production module verified. |
| Complaints and disputes | Not implemented | No production module verified. |
| Mobile applications | Not implemented | Web-first foundation; Android/iOS apps remain future work. |
| Internationalization completeness | Partial | Arabic/English and RTL/LTR exist in several areas; every route, email, validation and workflow needs a localization audit. |
| Automated tests and release quality gates | Incomplete | Need unit, integration, authorization, migration, accessibility, and end-to-end tests before launch. |
| Domain and brand finalization | Deferred | No domain purchase yet; continue using current Render URLs while development proceeds. |

## Product opportunity assessment — first owner-only tool committed (2026-11-07)

- Added bilingual owner page at `/owner/official-store/opportunities`, linked from the supplier source-offers console.
- Added owner-permission-gated API `POST /api/platform/official-store/opportunities/assess`.
- Transparent preliminary score: demand evidence strength/freshness (40 points), gross margin before unentered costs (25 points), and supplier readiness checks (10 points).
- Requires an HTTPS demand evidence URL and date, target market, explicit currency, selling price and cost inputs. Missing supplier/specification evidence and unconfirmed direct shipping/returns are surfaced as blockers.
- Assessments are persisted in owner-scoped history and can be retrieved for later review. The score is preliminary and transparent; it is not independently verified market intelligence or net profit.
- It does not fetch Amazon/marketplace data, verify suppliers independently, publish products, contact suppliers, create orders or make payments. Costs must be entered in one currency; use the pricing preview with documented FX inputs before comparing currencies.
- The bilingual owner page, assessment API and persistence foundation are deployed. Authenticated production CRUD and authorization-boundary end-to-end tests remain.

## Immediate build order

1. Verify database initialization and readiness after every schema change. Latest official-store sourcing schema migration is confirmed in Render Postgres (2026-11-07); web and API deploys for commit `6d5e7d92a18af1701dde89496721a05cd4f7d8b9` are both `live`.
2. Subscription plan management and the safe public plan catalogue are deployed; next verify owner authorization, create/update behavior and public-catalogue filtering in production. Keep payment collection disabled.
3. Build subscription lifecycle and entitlements with audited manual state changes; never mark a paid subscription active from a browser redirect.
4. Recheck public official-store catalogue/homepage deployments and test owner product CRUD/permissions; then implement AI sourcing/product lifecycle, supplier confirmation and owner policy controls.
5. Validate and connect the owner-only pricing preview to source offers and product administration; then implement persisted pricing rules, approved FX-rate sourcing, price/stock/shipping refresh and customer-price publication gates. Continue external catalogue aggregation with canonical WASLA product records linked to multiple independently verified source offers; robust duplicate/variant matching; bilingual fact-grounded content; image-rights provenance; and exact-source order linkage.
6. Implement official-store order/event foundations and the AI Store Manager workflow: scoped product research, supplier evidence, bilingual listings, publication policy, customer enquiries, order coordination and owner escalation. Keep live payment disabled until legal/provider prerequisites are approved.
7. Complete the owner command center for subscriptions, official store, security and audit.
8. Test messaging and inquiries with two distinct accounts and verify that each party can access only their own records.
9. Test member product publishing and seller-owned checkout link end to end.
10. Extend the existing Trade foundation with buyer requests, supplier opportunities, authorized matching, human-reviewed introductions, brokerage agreements and a separate commission ledger; then complete order workflows, notifications, ratings and complaints.
11. Run full security, privacy, performance, accessibility, bilingual and deployment checks.
12. Only then prepare legal/provider onboarding, public launch, domain purchase and investor/accelerator presentation.

## Release gates

WASLA must not be described as commercially ready until all of the following are true:

- A real user can register, verify email, sign in, manage a profile, and recover access.
- Business/store owners can create and manage their own stores and products.
- A buyer can view a public product and complete the seller-owned purchase path.
- Messages and inquiries work between separate accounts with verified authorization boundaries.
- The official store is separate from member stores and has a tested order workflow.
- Subscription plans, billing records, provider webhook verification, idempotency and customer entitlements are tested before paid billing is enabled.
- Owner actions are permission-gated and audited.
- Privacy, tax, consumer protection, payment-provider and jurisdiction requirements are reviewed before commercial launch.

## Explicit non-goals / safeguards

- Do not create fake customers, products, orders, reviews, revenue or analytics.
- Do not alter or remove the original platform owner's role or existing company/store records.
- Do not move V1 HTML files into V2.
- Do not route member merchant payments through WASLA.
- Do not activate subscriptions or trials without an approved policy and trusted evidence.
- Do not claim that an architecture decision is an implemented feature.

## Product opportunity discovery — strategic target approved (2026-11-07)

WASLA's official-store sourcing roadmap includes a reverse-sourcing / product-opportunity capability: begin with evidence of customer demand or product traction in relevant markets, identify the exact product and variants, then discover and compare suitable manufacturers, wholesalers, distributors and authorized marketplace suppliers. The goal is a WASLA-branded customer experience with supplier identity, sourcing links, supplier costs and internal fulfilment notes kept private, while preserving legally required seller, origin, shipping, customs, returns and consumer disclosures.

### Required workflow and safeguards

1. **Demand discovery:** collect product and category signals from permitted, documented sources (official marketplace APIs, licensed data providers, authorized merchant feeds, supplier catalogs and owner-provided research). Do not assume Amazon provides unrestricted access to sales rank, sales volume, reviews or competitor data; do not scrape or bypass access controls, rate limits, CAPTCHAs or terms.
2. **Evidence and freshness:** store each signal with source, retrieval time, market/country, currency, metric definition, coverage and confidence. Clearly distinguish observed facts, estimates and owner-entered assumptions. Never invent sales volume, demand, trend or profit.
3. **Canonical product identity:** match exact GTIN/brand/model/MPN and material attributes; preserve size, color, model and bundle variants separately. Similar-looking products are not interchangeable.
4. **Supplier discovery:** search local Turkish suppliers and international manufacturers, wholesalers, distributors and marketplaces without preferring a marketplace brand. Preserve independent offers and source evidence for each supplier.
5. **Landed-cost and margin analysis:** include supplier price, shipping, currency conversion with timestamp/source, customs, taxes, duties, payment and fulfilment costs where applicable. Flag missing costs; never label gross margin as net profit.
6. **Risk and feasibility:** assess supplier identity, specification match, quote validity, MOQ, stock, direct-shipping commitment, destination coverage, delivery estimate, returns capability, product restrictions and legal/import feasibility.
7. **Human approval gates:** AI may research, normalize, compare, summarize and recommend. It may not publish listings, promise availability, contact/commit to suppliers, place purchase orders, charge customers or pay suppliers without explicit owner policy and appropriate human approval.
8. **Customer experience:** WASLA remains the customer's store and support contact; internal supplier details remain private, but legally material disclosures are always provided.

### Delivery stages (not yet implemented)

- Stage A: documented source connectors and evidence model; manual/authorized imports first.
- Stage B: demand-signal ingestion and freshness/confidence tracking by target market.
- Stage C: product opportunity scoring with transparent factor breakdown and missing-data warnings.
- Stage D: canonical product/variant matching and multi-supplier comparison.
- Stage E: landed-cost, margin, risk and delivery feasibility ranking.
- Stage F: owner review queue and approved listing workflow; later order orchestration after legal/payment/returns readiness.

**Current implementation status:** this is an approved strategic target and design requirement only. Existing Shopify/authorized merchant-feed candidate import, deterministic product matching, supplier offer administration and pricing preview are groundwork; they do not yet provide Amazon data access, live market research, autonomous supplier discovery, AI scoring or automated purchasing.


## AI Store Manager — customer sales and end-to-end operations requirement (approved 2026-11-07)

A detailed operating specification is now recorded at `docs/architecture/ai-store-manager-operating-spec.md`. The requirement is one dedicated, bilingual WASLA AI Store Manager coordinating product/catalogue, sales conversations, supplier sourcing, pricing, order desk, procurement/fulfilment, customer care and operational reporting through separate least-privilege tools. It must use polished consultative sales language, answer from verified catalogue/policy data, preserve conversation context, avoid false claims or human impersonation, and keep internal supplier identity/costs private while retaining legally required customer disclosures.

The complete post-payment workflow is specified: signed provider webhook verification, exact amount/currency/order matching, idempotent payment and order events, supplier/variant/quote reconfirmation, controlled supplier purchase request, supplier acceptance, tracking, delivery, after-sales, and exception handling. Customer screenshots and browser redirects are never payment proof. Refunds, disputes, new suppliers, exceptional pricing, material substitutions and out-of-policy purchases require human approval. The model cannot write arbitrary order states or execute unrestricted database/payment actions.

**Implementation status: specification approved; runtime not implemented.** Existing product inquiries and messages are foundations only. The API currently has no configured LLM runtime/provider adapter, no dedicated AI service identity/tool policy/audit layer for this manager, and official-store checkout, payment provider, order lifecycle, supplier purchase and tracking integrations are not live. No AI-generated customer replies or autonomous transactions are claimed. Build sequence: AI foundation and kill switch; official-store-only bilingual sales inbox; grounded catalogue tools; audited order state machine; payment sandbox/webhook verification after legal/provider approval; supplier fulfilment and tracking; then end-to-end release gates.


## Continuous trend intelligence and opportunity radar — approved requirement (2026-11-07)

The AI Store Manager must proactively monitor permitted demand and trend signals across target markets and categories, detect emerging/accelerating/mature/declining opportunities, validate purchase intent across independent sources, identify exact products and variants, compare eligible suppliers, estimate landed cost and contribution margin, and rank opportunities for owner action. The owner dashboard must expose evidence, source freshness, confidence, competition, supplier readiness, delivery lead time, risk flags, score breakdown and recommended next action. A viral post alone is not proof of demand.

The detailed requirements, source controls, scoring dimensions, workflow and automation boundaries are specified in `docs/architecture/ai-store-manager-operating-spec.md`, section 10. The radar may ingest only approved APIs/licensed feeds/authorized integrations and permitted WASLA first-party events; it must not invent metrics or scrape/bypass access controls. It may score, rank, alert and prepare private drafts, but may not independently buy, publish, change live prices or commit supplier spend outside explicit owner-approved controls.

**Implementation status: requirement documented; continuous trend ingestion, signal aggregation, velocity/stage estimation and automated opportunity dashboard are not yet implemented.** Existing manual opportunity assessment and source registry are groundwork only. Required delivery stages: authorized signal connectors and event instrumentation; normalized timestamped observations; cross-source trend aggregation; transparent scoring and confidence; owner radar UI; tests for stale/conflicting/low-coverage signals; then controlled draft preparation.


### Product research provider shortlist (documented, not connected)

The AI Store Manager specification now includes a connector-evaluation shortlist: Google Trends, TikTok Creative Center/eligible TikTok commerce tools, Amazon Product Opportunity Explorer and category trend pages, Exploding Topics, Meta Ad Library, and authorized Shopify/merchant/supplier feeds. These are candidate sources only; none is represented as integrated by this documentation change. Before connection, validate official API/feed access, account eligibility, commercial-use and redistribution rights, market coverage, metric definitions, cost and refresh limits. Use triangulated demand evidence; social attention or low supplier cost alone is not sufficient proof of a profitable opportunity. Details are in section 10 of `docs/architecture/ai-store-manager-operating-spec.md`.


### Supplier-direct retail without pre-held inventory — requirement clarified (2026-11-07)

WASLA's official store may source an eligible item from an external supplier (illustrative supplier price $5), prepare a WASLA listing at a customer price (illustrative $15 only if cost/risk analysis supports it), and arrange supplier-direct shipment after a valid order and verified payment. No inventory needs to be purchased in advance for this model. The supplier's exact item/variant, offer, stock, current price, shipping-to-destination, delivery estimate, returns and direct-fulfilment permission must be reconfirmed before purchase. The customer must receive all legally required seller, origin, customs, delivery and returns disclosures.

Supplier photos/descriptions are not automatically reusable: store rights evidence and use them only with permission/license or another valid legal basis; otherwise create original or properly licensed WASLA media. Compute contribution margin after shipping, FX/payment costs, taxes/duties, returns and other known costs; do not describe the supplier/customer price difference as net profit. Never silently substitute a variant or supplier after customer consent. Supplier purchasing, payment and tracking integrations remain gated by verified payment, approved spending policy, idempotency and owner approval for new suppliers/exceptions.

Detailed operating controls are in section 10 of `docs/architecture/ai-store-manager-operating-spec.md`. **Status: requirement documented; end-to-end supplier-direct fulfilment is not yet implemented.** Existing supplier offers/import candidates/pricing preview are foundations only.


## Latest operational checkpoint — 2026-11-07

Both Render services are confirmed live on the latest commit `168b29f63a1bd308a633f8cb4e22597fdf27590e`: API `dep-dbnh6prm5ojs73fe6np0` and web `dep-dbnh6ptfi0pc73aitbsg`. The API build completed successfully and its runtime log reports `WASLA API listening on port 10000`; the web build completed and Next.js reports `Ready`. This confirms deployment and process startup, not a complete authenticated business journey.

### Supplier candidate-to-offer workflow — deployed foundation

- Imported candidates can be reviewed, returned for more evidence or rejected in the owner console.
- An eligible candidate can prefill the supplier-offer form. The owner still selects the canonical WASLA product and reviews the offer details/evidence before submitting.
- The API validates that supplier name, source platform, HTTPS product URL, currency and supplier price match the candidate record before linking it to a private supplier offer.
- A successful link marks the candidate `converted`; the new offer remains `needs_review`. Linking does not publish a product, charge a customer, place a supplier order or expose supplier data publicly.
- API and web builds/deployments are confirmed live. Authenticated production CRUD, candidate-to-offer database linkage, rollback/duplicate behavior and public-data leakage tests are still required.

### Current launch classification

- **Ready for:** continued owner testing, internal demonstration and carefully controlled inquiry-based pilot after access/security checks.
- **Not ready for paid commercial launch:** live checkout/payment provider and webhook handling, official-store order lifecycle, supplier purchase and acceptance, shipping/tracking, returns/refunds/disputes and legal/tax/consumer disclosures are not implemented or verified end to end.
- **Not ready to claim autonomous AI operations:** AI runtime/provider, live authorized trend/source connectors, automated supplier discovery/verification, AI product enrichment/publication and autonomous order orchestration are not implemented.
- **Domain/brand:** continue using Render URLs while validating the product. The WASLA name remains subject to final brand/domain/trademark checks; do not spend the limited domain budget until the chosen name is confirmed.

### Immediate one-hour work priority

1. Verify API health and key owner routes against the deployed services; confirm authenticated access and role boundaries.
2. Exercise supplier candidate review and candidate-to-offer linkage with a real owner session and safe test records; inspect resulting statuses and confirm public catalogue isolation.
3. Test registration/login/profile, public catalogue and member inquiry/message flows with separate test accounts where test credentials are available.
4. Record any blockers clearly. Keep payment collection, supplier purchases and public product publication disabled unless their required controls are independently verified.

Do not describe the platform as commercially launch-ready based only on successful builds or live service status.

## Deployment checkpoint — 2026-11-07 (candidate-link integrity)

- Commit: `f57dddc2fd552ad3fbe3f9c8a5f2fb0fff3a6de3`.
- Render API deployment `dep-dbnhbgvb9u1s73clvhqg`: confirmed `live`; build succeeded and runtime log reports `WASLA API listening on port 10000`.
- Render Web deployment `dep-dbnhbgvb9u1s73clvhng`: confirmed `live`; Next.js production build compiled, TypeScript passed, and all 28 static pages generated.
- Database schema now ensures `official_store_product_source_offers.sourcing_candidate_id` exists and has a partial unique index, preventing more than one source offer from being linked to the same non-null sourcing candidate.
- Candidate-to-offer creation remains transactional: candidate row lock, field-match validation, offer insert, candidate conversion, and commit/rollback.
- Scope remains private owner workflow. Offers are created as `needs_review`; no catalogue publication, customer checkout, supplier purchase, or payment is triggered.
- Verification boundary: deployment/build/runtime were confirmed. An authenticated owner-session end-to-end CRUD test has not yet been completed. Do not mark the candidate-link workflow production-verified until that test and negative authorization/duplicate-link tests pass.
- Next QA priority: run automated API test suite in CI or a controlled test environment, then execute authenticated owner tests for candidate review/linking, and negative tests for wrong owner, mismatched candidate details, rejected/converted candidates, and duplicate source-offer links.

## Security review checkpoint — 2026-11-07 (candidate review and platform authorization)

- API deployment for commit `2273300deafa7699e917d267eb3463d6471a8fc0` is confirmed Live on Render: `dep-dbnhgvvig07c739hsm00`. The matching Web deployment is confirmed Live: `dep-dbnhgvoqr7gs73a9tccg`.
- Candidate review transitions now execute in a database transaction: candidate state update and activity-log insertion commit or roll back together. A candidate in `rejected` or `converted` state cannot be changed by the review endpoint; missing candidates return 404 and terminal candidates return 409.
- Candidate-to-offer conversion remains transactionally locked and protected by a partial unique index, preventing duplicate links. The offer stays private and `needs_review`; no publication, payment, checkout, or supplier purchase occurs.
- Code inspection confirms the reviewed official-store endpoints call `authorizePlatformPermission`, which derives the actor from the Better Auth session, checks active user + verified email, and resolves effective platform permissions from active platform-scoped role assignments. Client-supplied user IDs/role claims are not used as the actor.
- Data-source registry GET/PATCH is scoped to `created_by`; opportunity history is scoped to `owner_user_id`; candidate enrichment is stored per `owner_user_id`. Sourcing candidates and source offers are intentionally platform-wide internal records guarded by `platform.manage`, not private per-member resources.
- Review scope included platform authorization, source offers, candidate enrichment/review, authorized import candidates, data-source registry, opportunity assessments, and relevant route wiring.
- Verification limitation: this is a source-code review plus successful production builds/deployments, not a live authenticated penetration test. Negative tests for unauthenticated requests, insufficient roles, cross-owner data access, mismatched candidate details, duplicate conversion, and terminal-state mutation still need to be run with controlled test accounts. Do not describe the workflow as fully security-tested.
- Commercial readiness remains unchanged: payment/webhooks, order fulfilment orchestration, returns/refunds/disputes, legal/tax/consumer disclosures, live authorized demand connectors, and the autonomous AI manager are not complete or production-verified.


## Deployment checkpoint — 2026-11-07 (supplier evidence prefill)

- Commit: `e6c79a98baf2dbcad016e94f800e464d7e73e3fb` (`feat: prefill supplier proof when linking reviewed candidates`).
- GitHub Actions run `42376645700` completed successfully. The quality job passed shared/API tests, database migrations and constraints, TypeScript checks, API build and web build.
- Render API deployment `dep-dbnic0vb9u1s73cmv44g` is confirmed `live`; Render Web deployment `dep-dbnic0vb9u1s73cmv420` is confirmed `live`. Both deploys reference the same commit.
- When linking a reviewed candidate to a supplier offer, the owner form now pre-fills supplier-evidence and product-specification evidence URLs from the candidate enrichment result when those evidence items exist.
- Evidence remains explicitly unverified. The owner must open and review the evidence and make the required identity/specification/direct-shipping confirmations. Prefill does not verify a supplier, approve an offer, publish a product or place an order.
- Verification boundary: CI and production deployment are confirmed. Authenticated owner-session browser/database end-to-end testing remains outstanding.



## QA hardening checkpoint — 2026-11-07 (member stores, messages, profile and audit integrity)

- Product-based private messaging now resolves the seller on the server from an active product; the public product payload no longer exposes an internal seller user ID. The resolution supports an active verified store owner, then store manager, then account owner/manager. The caller cannot start a conversation with themselves.
- Added automated tests for product-based seller resolution, self-conversation rejection and mutually exclusive recipient/product inputs.
- Member product creation and updates now commit the product mutation and audit-log row in the same database transaction.
- Store detail updates now commit the store mutation and audit-log row atomically.
- Product inquiry replies and their transition to `replied` are now atomic.
- Store listing now includes a store-only member even when that user has no separate account membership. Added a regression test for this authorization/visibility case.
- Product media and seller checkout URLs now pass strict URL parsing and must use HTTPS.
- Profile fields `bio`, `website` and `social_links` are represented in the Drizzle schema and added through migration `0004_extend_profiles.sql`. Runtime profile requests no longer execute schema-changing ALTER TABLE statements. Production already contains these columns; the migration is idempotent.
- GitHub Actions run `42399529081` passed all quality steps, including API tests, migrations, database constraints, TypeScript checks and API/web builds. Runs `42400123571`, `42400180878` and `42400200853` also passed all quality steps after the subsequent hardening changes.
- Render API and Web deployments for commit `9a9f114771e374fd132b562b34cae65e87581b0d` were confirmed Live. Later seller-manager routing and URL-validation changes are in the deployment queue and must be checked before being marked Live.
- Verification boundary: CI tests and deployment checks do not replace authenticated two-account browser testing. No fake customer, product, inquiry or order records were created. Supplier private data remains restricted to owner-side workflows; public catalog and legal disclosure review remain separate launch gates.


## Production authorization bootstrap checkpoint — 2026-11-07

- Production inspection found that several account/store roles and permission links existed in shared source definitions but had not been provisioned in the live database. This would have prevented normal account invitations and caused operation-level permission checks to deny valid store employees/managers.
- Added an idempotent startup bootstrap for the complete 14-role/51-permission shared authorization matrix. It updates role/permission definitions and links only; it does not create users, memberships or role assignments. Existing platform-owner bootstrap still runs afterward to grant the owner's additional platform security/audit permissions.
- The API now runs authorization bootstrap before opening its listener. This avoids relying on a one-time manual seed command in production.
- Production database verification after deployment confirms account_owner, account_admin, account_manager, account_employee, account_viewer, store_owner, store_admin, store_manager and store_employee role permission links. Employee/viewer read/create boundaries match the shared role definitions. The configured owner account remains active, verified and assigned platform_owner.
- Store products API now checks the appropriate scoped permission per operation: read for GET, create for POST, update for PATCH. Store detail updates and store listing also use scoped permissions instead of hard-coded role-name allowlists.
- Integration coverage verifies the role bootstrap is idempotent and that employee/viewer/store roles receive the intended permission boundaries.
- GitHub Actions run `42401768346` passed API tests, database migrations, authorization seed idempotency, database integration tests, TypeScript checks and API/Web builds.
- Render API deployment `dep-dbnmtafavr4c73al87l0` for commit `d122cf03738333273981347476eb0c82522fc6bb` is confirmed Live; runtime logs confirm the API listener started successfully. The owner assignment and production permission matrix were re-read after startup.
- Verification boundary: role data and startup were verified against production. Full browser-based tests of invitation acceptance and every role's UI actions with separate accounts are still required.


## Messaging and in-app notifications checkpoint — 2026-11-07

- Messaging now stores a separate last-read timestamp for each conversation participant. Opening a conversation updates only the signed-in participant's read timestamp; conversation lists return accurate unread counts, and the message workspace displays an unread badge.
- Conversation lists and message threads now use the member's saved profile display name and avatar when available, falling back to the authentication profile.
- Added a private in-app notification center with user-scoped listing, unread totals, mark-one-read and mark-all-read actions. The API never returns another user's notifications; mark-read updates are scoped to the signed-in user.
- The workspace header shows the unread notification count and refreshes it when notification state changes.
- In-app notifications are created transactionally for account invitations, incoming private messages, product inquiries and replies, and friend requests/acceptance. Invitation senders are also notified when an invitation is accepted or declined.
- Added versioned migrations `0004_extend_profiles.sql`, `0005_message_read_receipts.sql` and `0006_notifications.sql`; all are registered in Drizzle's migration journal. Startup schema checks remain idempotent for existing deployments.
- Added regression tests for private notification listing, read ownership, read-all scoping, message read receipts, unread-count query behavior and profile-aware conversation display.
- GitHub Actions run `42403323245` passed API tests, migrations on a fresh database, authorization seeding, database constraints, TypeScript checks and API/Web builds.
- Render API deployment for commit `0186745fb41f219468ca0fc2f65c3042dea5790b` is Live and its logs confirm successful startup. The notification schema and message read-receipt columns were verified in the production database.
- Scope boundary: this is an in-app notification system. Push notifications and email delivery for these event types are not implemented. No synthetic production notifications were created; the live notification table currently contains no event rows because there has been no real invitation/message/inquiry/friend activity yet.


## WASLA Trade foundation checkpoint — 2026-11-07

- Added the initial two-account trade-deal model: initiator and counterparty accounts, deal terms, optional line items, pending responder, lifecycle status and append-only event history.
- Added permissioned API endpoints to list deals, create private drafts, view authorized deal details and perform server-validated propose/counter/accept/decline/cancel/complete transitions.
- Drafts are private to the initiating account until proposed. Counterparties must have an active verified account member with `account.trade.negotiate` before a deal can be created for them.
- Scoped permissions are enforced for deal creation, negotiation, acceptance, cancellation and completion. Every state transition, event, audit entry and counterparty notification is written in a transaction.
- Trade acceptance is an internal human decision only. It does not create an order, charge a payment, reserve inventory, contact a supplier or trigger fulfillment.
- Added the bilingual `/trade` workspace and navigation entry. It supports business search, creating drafts, proposing, countering, accepting, declining, cancelling and marking an accepted deal complete.
- Added trade notification type support and migrations `0007_trade_deals.sql` and `0008_trade_notifications.sql`.
- Automated tests cover permissioned draft creation, counterparty readiness and draft privacy. GitHub Actions run `42404147925` passed API tests, migrations, authorization seeding, database constraints, TypeScript checks and API/Web builds.
- Production database confirms all three trade tables and the trade notification type constraint exist. The live trade tables contain zero deal/item/event rows; no fake commercial activity was inserted.
- Render API and Web deployments for commit `64eac6fa9c498af528409a841071458a9f4f0fa5` are confirmed Live. A follow-up API hardening change ensures cancelling an unproposed private draft does not notify or reveal it to the counterparty; that deployment is queued.
- Remaining Trade release gates: authenticated two-account end-to-end tests, review of real counterparty onboarding and deal permissions, richer line-item editing/counter-proposal history UI, and legal review before anyone treats a recorded acceptance as a binding contract.


## Platform audit viewer checkpoint — 2026-11-07

- Added `GET /api/platform/audit`, protected by the server-side `platform.audit.read` permission and bounded to a maximum of 100 recent entries.
- Added bilingual `/owner/audit` read-only page and a link from the owner security panel.
- The viewer displays action, resource type, account/store labels, actor email and timestamp. It deliberately omits raw metadata so unrelated private details are not surfaced by default.
- Regression tests verify the permission check, query bound and that denied requests do not read audit data.
- GitHub Actions run `42404850292` passed API tests, migrations, authorization seed, database constraints, TypeScript checks and API/Web builds.
- Render API deployment for commit `8fa91273e74c57524faa2df91d65a88ea64b28bf` is Live; runtime logs confirm the API listener started. Web deployment for commit `0df8e311bcc0d768a0b41f7590a76c11dbe614a9` is Live.
- The production audit table contains real historical entries; the endpoint has not been exercised in an authenticated browser session yet.


## Orders and fulfillment readiness checkpoint — 2026-11-07

- Added `docs/architecture/orders-and-fulfillment-operating-spec.md` to define separate member-store and official-store order models, no-central-inventory boundaries, verified payment rules, supplier-direct fulfillment evidence and release gates.
- Order/payment execution remains intentionally unimplemented. The payment provider, merchant-of-record model, settlement countries/currencies and approved legal entity are not yet selected. No payment or order status may be fabricated before a verified provider/merchant event exists.
- This is a genuine launch dependency, not a coding task to guess around. The schema/API can be implemented against the approved provider-neutral lifecycle, but live checkout and paid-state transitions remain blocked until provider credentials, signed webhook specifications and jurisdiction decisions are available.


## Privacy regression coverage checkpoint — 2026-11-07

- Added public-catalog regression tests proving the product and store-listing projections do not select or expose private supplier/source-offer fields and only return active public records.
- Added private-message regression coverage proving a non-participant receives no conversation content and the handler stops after the participant-membership check.
- Added product-inquiry regression coverage proving replies are restricted to inquiry participants, status changes are restricted to the assigned seller recipient, and the inbox is scoped to the signed-in seller.
- Included all new tests in the API CI test command.
- GitHub Actions run `42405555405` passed: API tests, database migrations/authorization seed/constraints, API TypeScript check, API build and Web build.
- Render API deployment for commit `8a2befac29f46ab7c07fc8766c6ccb7b3ff92fb4` is Live. The matching Web deployment is being checked separately; these commits change tests only, not customer-facing Web functionality.
- These are automated authorization/privacy regression tests; authenticated multi-user production browser testing remains a separate release gate.


## Official-store supplier and publication gate checkpoint — 2026-11-07

- Found and fixed a publication-path gap: the old public catalogue depended on a product-level `supplier_dropship_confirmed` flag that no owner product API could set. That could leave otherwise reviewed products permanently invisible, or encourage an unsafe manual database workaround.
- Public visibility now requires an actual linked `official_store_product_source_offers` row that is approved, currently available/limited, direct-to-customer confirmed, supplier-identity verified, specification verified, MOQ exactly one, has shipping cost/currency, non-empty destination-country array, delivery estimates, a future-valid quote and a verification timestamp.
- The public response still selects only customer-facing product fields; supplier name, source URL, supplier cost, shipping cost and private evidence are not returned.
- JSON destination validation uses a guarded CASE expression to avoid errors if legacy/malformed JSON is not an array.
- Added tests for the official-store public gate, approved data-source ownership/evidence rules, supplier imports remaining unverified and owner-review-only, and the earlier member-catalog/message/inquiry privacy checks.
- GitHub Actions run `42406174257` passed API tests, migrations/authorization seed/database constraints, API TypeScript check and API/Web builds. Earlier source import tests passed in run `42405875587`; data-source registry tests passed in run `42405772990`; official-store public-gate tests passed in run `42406066645`.
- Confirmed both official-store product and source-offer tables exist in the production Render database. No actual products or supplier offers are present yet, so the new publication gate has been verified by automated tests, not by a live customer product listing.


## Supplier-offer approval regression checkpoint — 2026-11-07

- Added API regression tests proving an offer cannot be approved without verified supplier identity, exact specifications, supplier/product evidence, direct-to-customer shipping, MOQ, current quote and availability.
- Added a test proving material changes cannot be combined with approval in the same request; the changed offer must be saved and reviewed in a separate action.
- Added the new tests to the standard API CI command. GitHub Actions run `42406409120` completed successfully, including API tests, database migration/authorization/constraint checks, API TypeScript check and API/Web builds.
- No supplier candidates, source offers or official-store products exist in the production database at this time. No fabricated records were added.


## Trade workspace multi-item checkpoint — 2026-11-07

- Expanded the WASLA Trade draft form from one optional line item to a repeatable multi-item list with add/remove controls and a 50-item UI cap matching the API limit.
- Each entered item requires a title, positive quantity and valid unit price; blank optional rows are ignored. The API remains authoritative and calculates the deal total from line items.
- Updated the trade operating specification to describe the V2 workflow (not V1) and the multiple-item limit.
- GitHub Actions run `42406523238` passed all API tests, database migration/authorization/constraint checks, TypeScript checks and both API and Web builds.
- The trade UI change is committed and awaiting its Render Web deployment verification.


## Navigation and membership catalogue checkpoint — 2026-11-07

- Corrected the public homepage so WASLA Trade and Messages link to their implemented workspaces instead of displaying "Coming soon".
- The WASLA AI card now links to the owner-only AI room and is clearly labelled "Owner only" / "خاص بالمالك"; this does not grant public users owner access.
- Added a bilingual `/plans` page backed by the existing public subscription-plan catalogue endpoint. It displays only active public plans and clearly states that enrollment/payment are not enabled. When no approved plans exist, it shows an honest empty state rather than invented prices or trial terms.
- Added a homepage link to the plans catalogue.
- GitHub Actions run `42406790981` passed API tests, migration/authorization/constraint checks, TypeScript checks and API/Web builds.
- Render Web deployment for these latest homepage and plans changes is still pending verification. Do not treat the code commit or successful build as proof that the live site has updated.


## Official WASLA Store order desk checkpoint — 2026-11-07

- Added an owner-only read-only API at `/api/platform/official-store/orders` with bounded list (100 orders) and detail/event-history lookup (250 events).
- API requires `platform.manage`, rejects write methods, validates order IDs, uses no-store/security headers and does not change order/payment/fulfillment state.
- Added bilingual owner page at `/owner/official-store/orders`, linked from official-store administration. It displays operational status and internal order/event details and explicitly warns that payment, supplier purchase and shipping are not enabled.
- Added regression tests for permission enforcement, bounded read-only listing, event history and write-method rejection; included them in the API CI test command.
- This is an operational visibility layer only. It does not create customer orders, collect payments, contact suppliers, purchase goods, generate tracking or confirm delivery. The production database currently has order tables but no live order workflow; keep checkout disabled until provider/legal/fulfillment gates are implemented.
- GitHub Actions run `42408902806` passed all API tests, database checks, TypeScript and API/Web builds. Render Web and API deployments for the order-desk code were verified live before the subsequent owner-metrics changes.


## Owner command-center live official-store indicators — 2026-11-07

- Extended the live owner overview API with real counts from the separate official-store order, product and source-offer tables, including orders/offers needing review.
- Updated the owner command-center "Orders" room to open the official-store order desk and display these live counts; it is explicitly labelled as official-store-only, not member-store sales.
- Added tests for the new metrics and permission gate. GitHub Actions run `42409112994` passed API tests, migrations, authorization seed, database constraints, API TypeScript and API/Web builds.
- Production database check at this checkpoint: 0 official-store orders, 0 official products, 0 source offers, 0 orders needing review, 0 offers needing review. The dashboard therefore reports real zeros, not fabricated activity.
- GitHub Actions run `42409112994` passed all tests, migrations, authorization seed, database constraints, TypeScript and API/Web builds. The API deployment containing the new metrics was verified live; the Web deployment containing the dashboard room was verified live.


## Public official-store delivery disclosure checkpoint — 2026-11-07

- Public official-store catalogue now selects the most recently verified currently-approved supplier offer that meets the existing strict publication gates, and exposes only customer-safe delivery countries and estimated delivery-day range.
- Supplier identity, supplier price, source URL, source reference, internal shipping cost and other sourcing details remain excluded from the public response.
- The bilingual product-details dialog displays delivery destinations and estimated delivery time before any future order confirmation.
- Regression tests assert the public response includes delivery information while excluding supplier/source/private cost fields.
- GitHub Actions run `42409560966` passed API tests, migrations, authorization seeding, DB constraints, API TypeScript/build and Web build.
- Render deployments for the latest API and Web commit are in progress; do not call this checkpoint live until both deployments report Live.
- This remains catalogue disclosure only; it does not create orders, collect payment, place supplier purchases or enable shipping.


## Customer official-store request workflow — 2026-11-07

- Added authenticated `POST /api/official-store/orders` to create a supplier-confirmation request only after explicit customer confirmation.
- The API rechecks the published product, active official store, current approved offer, supplier identity/specification verification, direct-to-customer confirmation, quote validity, MOQ=1 and destination-country coverage inside a transaction.
- The request is recorded as `awaiting_supplier`, `payment_status=not_enabled`, `supplier_purchase_status=not_placed`, and `owner_review_required=true`. A customer-attributed audit event stores the source-offer reference and explicitly records that no payment or supplier purchase occurred.
- Added authenticated `GET /api/official-store/orders` scoped to the signed-in customer; customer can only read their own requests.
- Added bilingual storefront request controls and a bilingual `/account/orders` history page. Customer sees that this is a confirmation request, not a completed purchase.
- Added tests for unauthenticated access, customer data scoping, explicit consent, verified-offer transaction, destination coverage and event logging.
- GitHub Actions run `42410336574` passed all API tests, migrations, authorization seeding, database constraints, API and Web TypeScript/build checks.
- API deployment for the request flow is Live at commit `aecb3b56e4df4b46e33a82c90ed0616c273759dd`. Web deployment for the request form is Live at the same commit. The bilingual customer request-history page is deployed Live. The owner-only order desk now displays the delivery destination country without exposing the full shipping address.
- Payment, supplier purchasing, confirmed checkout, carrier booking and shipment tracking remain disabled. The flow is a request for verification and owner review only.

## WASLA Trade implementation status correction — 2026-11-07

- The repository contains a bilingual `/trade` workspace, `apps/api/src/trade.mts`, API route `/api/trade/deals`, database schema initialization and `trade.test.ts`.
- Trade is implemented as a deal proposal/negotiation workflow with account-scoped permissions and event history; it is not accurate to label the module "not started".
- Settlement, payment collection, escrow, legal contract signing and fulfilment integration remain outside the implemented Trade foundation and require separate approved integrations and policies.


## Final verification — customer request history and owner destination visibility

- The customer `/account/orders` page is Live on the Web service.
- Owner order desk API now exposes only the destination country; the full shipping address, customer note and supplier order/tracking URLs remain excluded from the generic owner details panel.
- API and Web deployments for commit `5b8f197f4d5e6d594e589adf48984e73435c81c2` are both verified Live.
- GitHub Actions run `42410548912` passed all checks, including API tests, database migrations/constraints, API TypeScript/build and Web build.


## Owner supplier confirmation review and customer notifications — 2026-11-07

- Added owner-only `PATCH /api/platform/official-store/orders/:id/supplier-confirmation`.
- Owner must enter a review note; an acceptance requires an HTTPS evidence URL and revalidation of the exact original source offer, approved status, stock/availability, verified supplier identity/specifications, direct-shipping flag, MOQ, current quote validity and destination.
- Acceptance is blocked if the original offer, supplier identity, supplier cost, shipping cost/currencies or destination coverage changed. The customer must approve any materially changed quote through a future explicit flow; no silent supplier or price substitution.
- Accepted supplier confirmation moves the request to `awaiting_payment` while payment remains `not_enabled`, supplier purchase remains `not_placed`, and owner review remains required. Rejected/expired requests are closed without payment or procurement.
- Owner decision is recorded as a human-attributed order event with note and evidence URL. Customer receives an in-app notification linking to `/account/orders`.
- Added separate supplier item-cost currency and supplier-shipping currency fields; both are persisted and compared independently to avoid mixing currencies.
- Added API tests for owner permission, required evidence, exact-offer revalidation, price-change rejection, payment/purchase remaining disabled, and customer notifications.
- Functional API and Web code is deployed Live on Render; final CI run `42411107317` has passed API tests, DB migration/constraints and API TypeScript/build; Web build is still completing at the time of this update.


## Owner AI order-desk context — 2026-11-07

- Extended the owner-only Gemini assistant's read-only snapshot to include up to 50 recent official-store order requests alongside up to 30 products and 50 supplier offers.
- The order snapshot includes order number, product title, quantity, listed price/currency, destination country, supplier-confirmation status, payment status, shipping status, owner-review flag and supplier-purchase status.
- It deliberately excludes customer user IDs, email, name, phone, full address and customer notes. Supplier/cost context remains owner-only.
- Updated AI system guidance and capability metadata: it may analyze included order requests but cannot create orders, contact suppliers, collect payments or claim purchasing/fulfilment.
- Added tests for owner authorization, bounded order reads, no customer PII in the query/context, and explicit read-only capability/limitations.
- API deployment for commit `b652a3ed1d2cd9c99c3e68c4da634f00c3cc707d` is Live. GitHub Actions run `42411367873` passed all API tests, DB migration/constraints, TypeScript checks and API/Web builds.


## Member-store checkout transparency and URL hardening — 2026-11-07

- Public member-product details now disclose that checkout is completed with the member seller and that the seller is responsible for collecting payment, fulfilment, delivery, returns and after-sales service. This preserves the approved no-platform-custody/no-commission model.
- Member product image, video and external checkout URLs now require HTTPS, reject embedded URL credentials, and reject localhost/.local destinations.
- Added API regression tests for insecure HTTP, credential-bearing HTTPS, localhost and local-domain checkout URLs.
- GitHub Actions run `42411603607` passed API tests, DB migrations/constraints, API TypeScript/build and Web build. Render deployment verification is in progress.


## Supplier-confirmed pre-quote state — 2026-11-07

- Added explicit `supplier_confirmed` official-store request state. A supplier acceptance no longer moves the request to `awaiting_payment`.
- The owner must still prepare a final customer quote and obtain customer approval; payment remains disabled, no purchase is placed, and owner review remains required.
- Customer history now says the supplier confirmed availability but the final quote is pending. Owner review confirmation message and AI guidance reflect the same boundary.
- API schema initialization safely replaces the order-status check constraint to include the new state. CI validates the API tests and builds.
- API and Web deployments for commit `91c2aed900c39b0dce51a1813565804d861594b5` are both verified Live. GitHub Actions run `42411813187` passed all tests, database migration/constraint checks, TypeScript checks and both builds.


## Expanded live owner dashboard metrics — 2026-11-07

- Extended the owner overview API with actual counts for member products/active products, message conversations, product inquiries, WASLA Trade deals, subscription plans/active plans and subscriptions/active subscriptions.
- Added bilingual owner dashboard rooms for the member product catalogue, messages, Trade, subscriptions and product inquiries. Trade/messages/subscriptions link to their existing workspaces; metrics expose counts only and do not reveal private message contents.
- Added explanatory safeguards: a Trade deal record does not mean settlement/payment; subscription counts do not mean billing is enabled; member checkout remains seller-owned.
- Corrected the subscription-plan active metric to use the real `is_active` schema field.
- Production database snapshot at this checkpoint: member products 0, conversations 0, product inquiries 0, Trade deals 0, subscription plans 0, subscriptions 0. No fabricated activity was inserted.
- GitHub Actions run `42412206991` passed API tests, migrations, authorization seeding, DB constraints, TypeScript checks and API/Web builds. API and Web deployments for commit `237f5dd8e8d29bf1bbef792f93e88f61aea8e638` are both verified Live.


## WASLA Trade brokerage direction — architecture approved (2026-11-08)

- Added `docs/architecture/wasla-trade-brokerage-and-opportunity-engine.md` defining the managed B2B brokerage workflow: buyer/supplier opportunity intake, authorized source discovery, evidence provenance, matching, human-reviewed introductions, explicit fee agreements, commission milestones, invoicing and dispute handling.
- Added architecture decision 23. Ordinary self-managed member-to-member deals remain commission-free. A fee applies only to a separate WASLA-sourced brokerage engagement with explicit, advance acceptance by the responsible payer(s); no hidden or retroactive commission.
- Initial brokerage model excludes escrow, custody, split payments, trade finance and WASLA acting as importer/exporter. Underlying buyer/supplier settlement remains outside WASLA until a separately approved legal/payment design exists.
- Corrected the Trade status above: a deal negotiation API and bilingual workspace exist in the repository, but this does not prove production deployment or end-to-end operation. Automated discovery, brokerage agreements, commission ledger and fee collection are not implemented.
