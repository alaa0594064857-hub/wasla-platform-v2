# WASLA V2 — Master Plan Implementation Status

Last reviewed: 2026-11-07
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
- Private member messages are not automatically visible to platform administrators or the official-store AI.

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
| Official WASLA Store | Partial — schema, owner console and public catalogue implemented; deploy/CRUD verification pending | Five isolated tables are verified in Render Postgres. Owner-only product list/create/update API and bilingual owner console exist. A bilingual public catalogue page at `/official-store` reads the public endpoint; homepage gateway links to it. Latest Render deployments for the catalogue and homepage link were still queued/building at last check, so recheck before claiming live. Store remains draft by default. No real product CRUD test, supplier sourcing, AI product publishing, orders, checkout, or sales operations verified. No central stock quantity. |
| Official-store AI operations manager | Not implemented — operating model approved | Dedicated inquiry/message and activity-log tables exist. Decision 20 now defines an AI Store Manager responsible for supplier/product research, evidence-based listing creation and lifecycle, customer sales workflow, supplier coordination, and owner escalation. No AI runtime, supplier research connectors, policy engine, AI product permissions, scoped inbox, response generation, or oversight UI exists yet. AI must not invent product/supplier/price/stock facts. |
| Official-store orders, checkout and fulfilment | Not implemented | Decision 20 defines order lifecycle and AI coordination. Need order/event schema, supplier acceptance, dedicated platform payment provider, seller-of-record, tax/invoicing, returns, shipping and tracking. Live checkout stays disabled until legal/provider arrangements are approved. |
| Orders and order management | Not implemented | Member sales remain outside WASLA payment custody; platform can optionally coordinate order information without becoming payment intermediary. |
| Trade/deal management | Not implemented | Requires deal records, participants, negotiation stages, documents, permissions and audit trail. |
| Notifications | Not implemented / incomplete | No complete notification delivery and unread-state workflow verified. |
| Ratings and reviews | Not implemented | No production module verified. |
| Complaints and disputes | Not implemented | No production module verified. |
| Mobile applications | Not implemented | Web-first foundation; Android/iOS apps remain future work. |
| Internationalization completeness | Partial | Arabic/English and RTL/LTR exist in several areas; every route, email, validation and workflow needs a localization audit. |
| Automated tests and release quality gates | Incomplete | Need unit, integration, authorization, migration, accessibility, and end-to-end tests before launch. |
| Domain and brand finalization | Deferred | No domain purchase yet; continue using current Render URLs while development proceeds. |

## Immediate build order

1. Verify database initialization and readiness after every schema change.
2. Subscription plan management and the safe public plan catalogue are deployed; next verify owner authorization, create/update behavior and public-catalogue filtering in production. Keep payment collection disabled.
3. Build subscription lifecycle and entitlements with audited manual state changes; never mark a paid subscription active from a browser redirect.
4. Recheck public official-store catalogue/homepage deployments and test owner product CRUD/permissions; then implement AI sourcing/product lifecycle, supplier confirmation and owner policy controls.
5. Implement official-store order/event foundations and the AI Store Manager workflow: scoped product research, supplier evidence, bilingual listings, publication policy, customer enquiries, order coordination and owner escalation. Keep live payment disabled until legal/provider prerequisites are approved.
6. Complete the owner command center for subscriptions, official store, security and audit.
7. Test messaging and inquiries with two distinct accounts and verify that each party can access only their own records.
8. Test member product publishing and seller-owned checkout link end to end.
9. Add order/Trade modules, notifications, ratings and complaints according to the approved roadmap.
10. Run full security, privacy, performance, accessibility, bilingual and deployment checks.
11. Only then prepare legal/provider onboarding, public launch, domain purchase and investor/accelerator presentation.

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
