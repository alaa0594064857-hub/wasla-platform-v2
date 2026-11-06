# WASLA V2 — Launch Readiness and Operating Checklist

Updated: 2026-11-06

This checklist separates technical launch preparation from legal, banking, and payment-provider decisions. Passing CI is not production approval.

## Current release boundary

- The sourcing workflow is demand-led: suppliers own goods and confirm availability and quotes per request.
- WASLA does not operate a central warehouse or platform-owned inventory.
- Accepted sourcing orders remain awaiting payment. No live payment gateway or verified payment webhook is implemented.
- Supplier-entered tracking is manual; no carrier-verified live tracking is implemented.
- Keep the current pull request in draft until the release review is complete.
- Do not run production migrations, enable paid checkout, or deploy a release without explicit approval.

## Production environment variables

Configure secrets in Render Environment / the private environment group. Never commit secret values.

| Variable | Required for production | Notes |
|---|---:|---|
| DATABASE_URL | Yes | Render PostgreSQL connection string; preserve the existing value. |
| BETTER_AUTH_SECRET | Yes | Long, random secret; never reuse a public/example value. |
| BETTER_AUTH_URL | Yes | Canonical HTTPS API auth URL, e.g. the deployed API origin. |
| BETTER_AUTH_TRUSTED_ORIGINS | Yes | Comma-separated exact HTTPS web origins; include the production web origin only. |
| RESEND_API_KEY | Yes for email flows | Resend API key stored only in Render secrets. |
| RESEND_FROM_EMAIL | Yes for production email | Verified sender, e.g. WASLA <accounts@your-verified-domain>. Do not use onboarding@resend.dev. |
| RESEND_TEST_RECIPIENT | No in production | Development/test-mode recipient only. |

The API now allows production verification and password-reset emails to the actual account recipient only when a custom sender is configured. Outside production, the single-recipient Resend test-mode restriction remains in place.

## Latest automated verification — 2026-11-06

- GitHub Actions workflow run **#410** passed on candidate commit `d86996f33ba8087541703c73cc0f51451f3f202c`.
- Passed steps: dependency installation, shared-package tests and TypeScript, API tests, database migrations and authorization seeding on the CI PostgreSQL service, database constraint/integration tests, API TypeScript/build, and web build.
- This is automated CI evidence only. It does **not** verify the deployed Render services, live email delivery, real browser journeys, or production data.
- PR #2 remains open and draft. The candidate has not been merged or deployed; production migrations remain gated on explicit release approval.

## Technical launch gates

- [ ] Set and verify the production environment variables above without exposing secrets.
- [ ] Verify email registration with a non-test recipient using the verified sending domain.
- [ ] Verify password reset and one-hour verification link expiry.
- [ ] Verify login, logout, session persistence, and protected routes on the production web origin.
- [ ] Run buyer → sourcing request → supplier offer → supplier availability → buyer acceptance → buyer order history.
- [ ] Run supplier order workspace and manual tracking flow; verify unpaid orders cannot be shipped.
- [ ] Verify account roles, membership revocation, and cross-account access boundaries.
- [ ] Verify Arabic RTL and English LTR on mobile and desktop.
- [ ] Verify database backup/restore procedure and retention.
- [ ] Verify health checks, error logs, rate limiting, and abuse protections.
- [ ] Review privacy notice, terms, cookie/session handling, support contact, and data-retention policy.
- [ ] Complete production migration rehearsal and rollback plan against a disposable database first.

## Company, bank, and payment decisions

These are business/legal gates, not code toggles. The correct jurisdiction depends on the founder's residence, where the business is managed, target markets, tax obligations, and payment-provider eligibility.

1. Decide the initial legal operating country and obtain local professional advice on company formation, tax, VAT/sales tax, consumer protection, privacy, sanctions, and cross-border trade.
2. Define WASLA's role: software marketplace/intermediary, agent, or merchant of record. Do not imply WASLA is seller of record until legally established.
3. Choose whether suppliers receive funds directly or whether WASLA collects and later pays suppliers. Marketplace split payouts require a provider that explicitly supports the entity's country and business model.
4. Open a business bank account in the legal entity's name. Confirm supported currencies, incoming international transfers, payout countries, fees, proof-of-business requirements, and beneficial-owner checks.
5. Shortlist payment providers only after the legal entity and bank country are known. Confirm merchant onboarding, settlement account, supported buyer/supplier countries, currencies, refunds, chargebacks, reserves, and marketplace payouts in writing.
6. Do not accept customer funds into a personal account or promise escrow/split payouts without an approved provider and legal review.

## Suggested first operating scope

Start with a controlled pilot: verified buyer and supplier accounts, request/offer matching, supplier-confirmed availability, buyer acceptance, manual invoicing/payment outside the platform only where lawful and transparently disclosed, and manual supplier-entered shipment updates. Keep in-platform payment disabled until provider approval, webhook verification, refunds, disputes, supplier payout rules, and reconciliation are implemented and tested.

## Sunday start checklist

- [ ] Pick the initial legal jurisdiction and confirm the founder/owner details needed by the formation adviser.
- [ ] Decide whether the first pilot is supplier-direct payment or WASLA marketplace collection.
- [ ] Prepare a concise company activity description and platform business model for bank/provider onboarding.
- [ ] Prepare domain/email verification and customer-facing legal pages.
- [ ] Run the pilot test matrix and record each pass/fail before inviting external users.

## Verified platform scope snapshot — 2026-11-06

This is a code/repository scope snapshot, not a claim that every feature has passed live production testing.

| Master-plan area | Current evidence | Launch status |
|---|---|---|
| Account registration, login, email verification, password reset | Better Auth routes and account flows exist; production email requires a verified Resend sender and secrets | Needs live-domain tests |
| Buyer/supplier sourcing | Request, offer, availability, acceptance, order history, event history, and manual fulfillment flows are implemented with CI coverage | Candidate for controlled pilot after deployed end-to-end checks |
| Supplier-owned shops/catalog | Store/product APIs and public supplier storefront pages exist; storefront purchase action routes into sourcing, not direct checkout | Candidate for pilot |
| Business/company profiles and brands | Business, brand, network, profile, and membership routes/pages exist | Needs role-by-role end-to-end acceptance |
| Search | Search API and web page exist | Needs relevance and real-data acceptance |
| Messages | Current `/messages` page is a presentation scaffold; it explicitly says conversation services are still in development | Not launch-ready |
| WASLA Trade | No implemented trade/deal workflow is present in the current API route/module inventory | Not implemented |
| WASLA AI operations | No operational AI service/module is present in the current API route/module inventory | Not implemented |
| WASLA Admin | No dedicated platform-admin workspace/service is present in the current web/API route inventory | Not implemented |
| Payments and supplier payouts | No payment gateway, signed payment webhook, reconciliation, refund/dispute flow, or supplier payout implementation | Disabled / not implemented |
| Shipping | Supplier-entered tracking reference and carrier text only; no carrier integration or live verified tracking | Manual only |
| Native Android/iOS apps | Current repository contains the web app and API workspaces; native mobile applications are not part of this release candidate | Not implemented |

## Current hosting facts to resolve before production

- Render PostgreSQL service `wasla-db` was observed as available on the Free plan in Ohio, with a scheduled expiry of **2026-12-04 12:25 UTC** unless the plan is changed. Do not treat this as durable production storage. Choose an appropriate paid database plan and verify backups/restore before real customer data or launch.
- The API and web Render services were observed running deployments from commit `43f286b29ad7325e0033af6a21bf64e5356d40ea` on **2026-11-05**, while the current candidate is in draft PR #2 at a later commit. The candidate has not been merged or deployed.
- Keep the candidate branch isolated until PR review, staging verification, migration rehearsal, and explicit release approval are complete.
- Confirm whether the additional legacy API service is still referenced by any public URL, environment group, or web configuration before removing it. Do not delete a service based on its name alone.
- Render environment-variable values are secrets and must be reviewed in the dashboard without copying them into chat, source control, or logs.

## Preliminary Türkiye setup notes for Sunday review — 2026-11-06

Türkiye is a practical first jurisdiction to investigate because the founder is currently there, but this is not yet a recommendation to incorporate. Confirm nationality, residence status, tax residence, ownership structure, budget, and intended customer/supplier countries before selecting a jurisdiction.

- The official investment guide says foreign individual shareholders use passport documentation; a foreign shareholder residing in Türkiye is also asked for a notarized residence permit and a Turkish tax identification number for the registration process. Foreign documents may need apostille/consular certification, Turkish translation, and notarization.
- The Ministry's published company information lists minimum capital of **TRY 50,000 for a limited company (Ltd. Şti.)** and **TRY 250,000 for a joint-stock company (A.Ş.)**. The Ministry says a limited company's capital may be paid within 24 months after registration. Minimum capital is committed company capital, not a formation-service fee; confirm current rules and any later amendments with the trade registry/accountant.
- Company formation is submitted through MERSİS and registered with the relevant Trade Registry Directorate. Do not pay an intermediary until its scope, official charges, monthly accounting fees, registered-office costs, tax obligations, and cancellation terms are itemized.
- İşbank's official commercial-account guidance lists company registry records, articles, tax registration, signature circulars, and identification of authorized signatories among required documents. The bank explicitly says meeting the document list does **not** guarantee account opening; branch review and internal approvals apply.
- Ask the bank before incorporation whether it will onboard the actual shareholder/beneficial-owner structure and WASLA's international marketplace activity, including expected cross-border receipts, supplier payouts, currencies, and payment-provider settlement. A company registration does not guarantee a corporate bank account or marketplace payment processing.
- For WASLA's model, do not describe the platform as holding customer money, escrow, or paying suppliers on behalf of buyers until a bank, payment provider, and qualified local adviser confirm the legal and operational model.

Official starting references:
- Invest in Türkiye — Establishing a Business: https://www.invest.gov.tr/en/InvestmentGuide/Pages/establishing-a-business.aspx
- Turkish Ministry of Trade — Establishing a Company: https://ticaret.gov.tr/ic-ticaret/sirketler/sirket-kurmak
- Turkish Ministry of Trade — Minimum capital information: https://ticaret.gov.tr/ic-ticaret/sirketler/sirket-bilgiler
- İşbank — Commercial account opening requirements: https://www.isbank.com.tr/en/commercial/how-to-open-an-account

Sunday decision gate: first confirm the founder's citizenship and Turkish residence-permit status, then request written pre-screening from an accountant and at least two banks using the same one-page WASLA business-model description. Do not incorporate or transfer capital until the total first-year cost and account eligibility are confirmed.

## Draft business activity description for bank/accountant pre-screening

Use this only as a discussion draft; have a Turkish accountant/lawyer adapt the activity codes and wording before registration.

**English**

> WASLA is a digital B2B and B2C marketplace technology platform. It enables independent businesses, manufacturers, brands, and suppliers to publish business profiles and product listings, receive buyer sourcing requests, provide request-specific quotations, and communicate with buyers. Suppliers remain the owners and sellers of their own goods and are responsible for confirming availability, pricing, fulfilment, and delivery. WASLA does not own a central inventory or warehouse. The initial pilot does not collect, hold, or safeguard customer funds and does not provide escrow or supplier payout services. Any future payment collection, marketplace commission, or supplier settlement functionality will be introduced only after the relevant legal, banking, and payment-provider approvals.

**العربية**

> وصلة (WASLA) منصة تقنية رقمية للسوق التجاري بين الشركات والأفراد. تتيح للشركات والمصانع والعلامات التجارية والموردين المستقلين إنشاء ملفات أعمال وعرض منتجاتهم، واستقبال طلبات التوريد من المشترين، وتقديم عروض أسعار مخصصة لكل طلب، والتواصل مع المشترين. يبقى المورد المستقل مالكاً وبائعاً لبضاعته، وهو المسؤول عن تأكيد التوفر والسعر والتجهيز والتسليم. لا تمتلك وصلة مخزوناً مركزياً أو مستودعاً للبضائع. وفي المرحلة التجريبية الأولى، لا تجمع المنصة أموال العملاء ولا تحتفظ بها ولا تقدم خدمة ضمان/وساطة مالية أو تحويل مستحقات الموردين. ولن تُفعّل أي خدمة مستقبلية لتحصيل المدفوعات أو العمولات أو تسوية مستحقات الموردين إلا بعد الحصول على الموافقات القانونية والمصرفية وموافقات مزود الدفع اللازمة.

**Questions to obtain written answers from each bank before incorporation**

1. Will the bank onboard a newly formed Turkish limited company with the founder's actual citizenship, residence status, and beneficial-ownership structure?
2. Does the bank accept the described international B2B/B2C marketplace activity, including incoming international transfers and payments to overseas suppliers?
3. Which countries, currencies, transfer rails, and transaction sizes are supported, and what are the fees, limits, and compliance documents?
4. Can the company open TRY, USD, and EUR business accounts, and what minimum balance or account-maintenance fees apply?
5. Does the bank require the authorized signatory to attend in person, and what exact documents must be apostilled, translated, or notarized?
6. If WASLA later adds marketplace payment collection or split payouts, does the bank support that model directly or require a licensed payment institution?

Do not present the draft as an approved legal classification or promise that a bank will accept the business.


## Master-plan consolidation and next implementation sequence — 2026-11-06

This section consolidates the existing V2 candidate with the remaining master-plan work. It is an engineering tracker, not a production-readiness declaration.

### Existing work to retain in the current V2 candidate

- [x] Unified authentication foundation and account types for buyers and business-side users.
- [x] Personal profile API and bilingual profile page.
- [x] Business accounts, memberships, invitations, member actions, and role-scoped authorization foundation.
- [x] Supplier-owned stores, product catalog, storefront pages, and product search.
- [x] Demand-led sourcing requests, supplier opportunities, supplier quotations, availability confirmation, buyer acceptance, and accepted-order creation.
- [x] Buyer and supplier order workspaces, order event history, buyer delivery confirmation, and supplier-entered tracking.
- [x] No central WASLA stock; no buyer direct checkout against supplier catalog quantities.
- [x] CI coverage for API, shared package, database constraints/integration, TypeScript, and web build.
- [ ] Hosted acceptance testing for the complete buyer/supplier journey and all account roles.

### Remaining master-plan implementation

| Planned module | Current state | Next engineering deliverable |
|---|---|---|
| WASLA Store | Storefront and supplier product pages exist; platform-owned official catalog experience needs product-scope review | Define official platform listings separately from independent supplier listings; no central stock assumption |
| WASLA Shops | Supplier storefront foundation exists | Finish store management, catalog lifecycle, public profile, and owner/staff permissions |
| WASLA Business | Business profiles, account membership, invitations and brands foundations exist | Complete company directory, supplier/manufacturer discovery, verification workflow, and role acceptance tests |
| WASLA Trade | Not implemented as a complete workflow | Deal workspace: parties, commercial terms, milestones, attachments, status history, approvals, and audit trail |
| WASLA Messages | Candidate implementation: authenticated one-to-one conversation API, exact-email conversation start, participant-only read/send, message history, unread counts/read state, and bilingual workspace | Add DB-backed cross-user integration tests, connect conversations to order/request context, then add notification delivery; attachments and real-time delivery remain later gates |
| WASLA AI | No operational AI service | Start with assisted sourcing search and offer comparison; use verified database results only, show sources/uncertainty, and require human confirmation for commitments |
| WASLA Admin | No dedicated platform-admin workspace | Platform roles/permissions, account and supplier review queues, moderation, order/request oversight, audit log, and safe support actions |
| Payments and payouts | Not implemented; intentionally disabled | Keep disabled until legal/provider approval, signed webhooks, reconciliation, refunds/disputes, and payout controls exist |
| Shipping | Manual supplier tracking only | Add carrier integrations only after carrier and country coverage are selected |
| Mobile apps | No native Android/iOS app in current candidate | Stabilize responsive web and API contracts first; then plan native clients |
| Notifications | No complete unified notification service | In-app notification records and user preferences; email/push delivery only after verified provider setup |
| Reporting/analytics | No complete operations reporting module | Role-safe operational dashboards and exportable summaries after core workflows stabilize |

### Execution order

1. **Stabilize the current commerce pilot:** hosted buyer/supplier end-to-end checks, role boundaries, account membership changes, email verification/reset, and Arabic/English responsive review. Fix confirmed defects before adding broad features.
2. **Verify the shared communication foundation:** run database-backed tests for two real users, participant isolation, retries, and hosted buyer/supplier messaging before release. Do not start with file uploads or real-time sockets; establish secure persisted messaging first.
3. **Build WASLA Trade on existing sourcing/order records:** deal records should reference requests/offers/orders rather than duplicate their commercial facts. Add immutable snapshots and audited status transitions.
4. **Build WASLA AI as an assistive layer:** supplier search, local-country-first matching, comparison and explanations. AI may not create supplier availability, prices, stock, payment confirmations, or delivery promises.
5. **Build WASLA Admin and operational controls:** explicit platform-admin permissions, review queues, moderation, audit trail, and safe intervention boundaries.
6. **Complete notifications, reporting, and mobile readiness:** only after the underlying workflows and authorization contracts are stable.
7. **Keep payments, payouts, and carrier integrations gated:** no customer money collection, escrow claims, or automatic supplier payouts in the current no-payment pilot.

### Definition of done for each module

- Database changes are migration-backed and reviewed; no schema mutation is run against production as part of feature development.
- API endpoints enforce authenticated identity, ownership, active membership, and least-privilege access.
- Tests cover valid flow, invalid input, unauthenticated access, cross-user access denial, duplicate/retry behavior, and relevant concurrent changes.
- Arabic RTL and English LTR are usable on mobile and desktop.
- User-visible states distinguish pending, confirmed, rejected, failed, and completed actions accurately.
- CI passes on the candidate branch; hosted verification is recorded separately.
- No PR is merged, no Render deployment is triggered, and no production migration is run without explicit release approval.


### Messaging candidate update — 2026-11-06

- [x] Added migration-backed conversation and message tables on the candidate branch.
- [x] Added authenticated conversation list/create and conversation message read/send API routes.
- [x] Enforced participant-only access and bounded message payloads.
- [x] Added exact active-account email lookup for starting a conversation without exposing a public user directory.
- [x] Replaced the messages scaffold with a bilingual Arabic/English workspace connected to the API.
- [x] Candidate CI passed after the latest email-validation correction (commit `0499b621dc8065cbf6383a92d214c2325784760f`).
- [ ] Add database-backed two-user integration tests and verify the full messaging journey on the hosted candidate.
- [ ] Do not claim messaging production-ready until the migration is reviewed/applied through an approved release and hosted checks pass.

WASLA Trade remains the next major module. Existing sourcing requests, supplier offers, accepted sourcing orders, commercial snapshots, and order event history are the source of truth; Trade must reference those records and add party-approved deal terms, milestones, amendments, and an immutable audit trail rather than duplicating order facts. Payments remain disabled.

### Trade candidate update — 2026-11-06

- [x] Added migration-backed Trade deal, amendment, milestone, and event-history tables linked to accepted sourcing orders.
- [x] Added authenticated Trade deal listing and detail API, restricted to the buyer or active supplier-account members.
- [x] Added buyer-proposed deal creation from an eligible accepted sourcing order, with a commercial snapshot and audited proposal event.
- [x] Added accept/decline response workflow requiring the other party; a proposer cannot approve their own proposal.
- [x] Added unauthenticated-route, invalid-ID, and method-level API tests.
- [ ] Add amendment proposal/response endpoints and milestone management endpoints.
- [ ] Build the bilingual Trade workspace UI and link it from the signed-in navigation.
- [ ] Add database-backed two-party authorization, state-transition, and concurrency tests.
- [ ] Review migration and verify the full buyer/supplier journey on the hosted candidate. No production migration or deployment has been performed.

### Trade workspace progress — 2026-11-06

- [x] Added API endpoints to propose versioned terms amendments and require the opposite party to accept or reject them.
- [x] Added API endpoints to create milestones and mark pending milestones completed or cancelled, with actor attribution and event history.
- [x] Added bilingual `/trade` workspace for deal creation, list/detail, responses, amendments, milestones, and activity history.
- [x] Added Trade navigation entry and API tests for unauthenticated access and invalid amendment/milestone IDs.
- [ ] Verify the buyer and supplier experience with two authenticated accounts against a migrated non-production database.
- [ ] Review amendment terms UX and ensure each amendment submits a complete replacement terms snapshot; validate all concurrent party actions against a real PostgreSQL database.
- [ ] Add hosted candidate verification after explicit release approval; no production deployment or migration has been performed.
