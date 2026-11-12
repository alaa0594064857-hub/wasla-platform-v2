# WASLA V2 — Production Readiness Snapshot

**Reviewed:** 2026-11-12 (UTC)  
**Repository:** `alaa0594064857-hub/wasla-platform-v2`  
**Purpose:** Record verified production facts separately from code foundations and planned work. This document does not declare commercial launch readiness.

## Verified production state

### Hosting and deployment

- Public domain: `https://wasla.trade`.
- Render web service: `wasla-web`, Free plan, Ohio, service `srv-dblq91mk1f9s73es5pr0`.
- Render API service: `wasla-apiwasla-api-v2`, Free plan, Ohio, service `srv-dblhqoe417fc738jc030`.
- Both services are configured for automatic deployment from `main`.
- Latest verified deployment commit: `8845eff88275cb8d67dc2a18a809e4680ab539d0`.
- Latest web deployment `dep-dbqr3ogae00c738olb70`: **live**, completed 2026-11-12 12:35:03 UTC.
- Latest API deployment `dep-dbqr3ogae00c738olb10`: **live**, completed 2026-11-12 12:34:04 UTC.
- API startup logs identify the expected WASLA database and report that the API is listening on port 10000. Web logs report Next.js ready.
- These deployment records prove that the services deployed and started. They do not prove every page, route, workflow, email, or integration passes an end-to-end test.

### Authentication and email

- The Better Auth proxy through the WASLA web domain was merged and deployed in PR #96.
- The owner and the two other existing user accounts were previously confirmed by the user as able to sign in after the authentication/email fixes.
- The user confirmed the third account completed email verification and could sign in after a password-reset flow.
- PR #97 was merged and deployed to both services. Sign-up now waits for the explicit verification-email request and exposes a retry path if sending fails.
- **Not yet verified:** a brand-new sign-up after PR #97, with actual delivery, verification-link completion, sign-in, and appearance in the owner directory. Do not ask the owner to create another account until a safe internal test path is available.

### Production database snapshot (read-only query, 2026-11-12)

| Table / area | Current rows |
|---|---:|
| users | 3 |
| accounts | 1 |
| stores | 1 |
| subscription_plans | 0 |
| subscriptions | 0 |
| subscription_invoices | 0 |
| subscription_payment_events | 0 |
| store_products | 0 |
| official_store_products | 0 |
| message_conversations | 0 |
| trade_deals | 0 |

These are counts only. No user email addresses, IDs, credentials, or private records are included. Zero rows mean no production usage records exist yet; they do not necessarily mean the feature code is absent.

### Database hosting risk

- Render Postgres instance: `wasla-db`, PostgreSQL 18, Ohio, Free plan, status available.
- The provider currently reports expiry on **2026-12-04** for this Free database.
- The database is configured with a broad network allow-list. Review and restrict it to the actual service/network requirements before commercial launch.
- Do not upgrade, migrate, delete, or change network access without an explicit owner-approved plan and backup/restore verification.

## What is present versus what is not launch-ready

| Workstream | Verified code foundation | Remaining release gate |
|---|---|---|
| Accounts and owner directory | Better Auth, verified email flow, owner-only read-only user directory, account and permission foundations | Fresh-user end-to-end test after PR #97; registration failure telemetry; account/member workflow tests; security and retention review |
| Customer and subscription center | Owner directory, subscription-plan API, subscription lifecycle API/page, audited manual state transitions | No published plans or subscriptions; no customer signup/checkout funnel; no billing provider or verified webhook; no entitlement enforcement proof |
| Member stores | Store and product foundations, owner overview | Real seller onboarding, product lifecycle, customer checkout hand-off and two-account permission tests |
| Official WASLA Store | Product/source registry, import candidate, supplier-offer, pricing approval, customer request and owner review foundations | No production product records; authorized source connectors and evidence, hosted owner/customer workflow tests, checkout, fulfilment, tracking, returns and refunds |
| Messages and inquiries | Authenticated APIs and bilingual inbox/inquiry foundations | Hosted two-account and cross-account isolation tests; no production conversations yet |
| Trade | Deal, opportunity, agreement and commission-ledger foundations | Hosted party-isolation and full lifecycle tests; no production deals yet |
| AI management | AI headquarters, nine specialist-office/task foundations, official-store AI copilot code | Verify server-side model credentials and hosted runtime; test task dispatch, outputs, permissions, audit, pause control and failure paths. No autonomous purchasing, publishing or external contact is enabled |
| Mobile | Mobile app code foundations | Device/build/distribution and real-device workflow verification |
| Operations and security | Permission/audit foundations and deploy logs | Full security review, backup/restore drill, rate-limit review, monitoring/alerts, incident process and performance/accessibility checks |

## Non-negotiable safety and commercial gates

1. Never expose the users table or customer email directory publicly. Owner-only access must remain permission-gated, audited, and limited to the data needed for operations.
2. Track anonymous funnel events separately from identified customer records until the user has consented and the privacy notice/retention policy is approved. Do not collect abandoned signup email addresses just to improve conversion.
3. Never mark a paid subscription active based on a browser redirect or screenshot. Require a verified provider webhook, amount/currency/reference matching, idempotency, reconciliation, and audit history.
4. Do not enable member-store payment collection through WASLA. Member merchants own their own sales and settlement under the approved product principles.
5. Do not connect personal UPTION or Payoneer receiving details as a commercial checkout provider without written confirmation that the provider permits the intended business and marketplace flows.
6. Do not invent membership prices, tax treatment, refund terms, delivery promises, product evidence, or supplier availability.
7. AI may research and prepare recommendations/drafts within approved sources. It must not publish, spend, purchase, message suppliers/customers, or change paid/order states without explicit policy and human approval.
8. Do not create fake users, products, orders, reviews, revenue, or analytics to make dashboards look populated.

## Execution sequence

### Track 1 — Release verification and reliability
- Recheck production health/readiness and recent application/request logs.
- Run repository CI, database schema checks, API tests, web build/type checks, and security-focused tests.
- Complete authentication and verification flow tests without altering the three existing accounts.
- Confirm database backups and perform a restore rehearsal before storing commercial data.

### Track 2 — Customer and subscription operations
- Finish the owner customer directory and account lifecycle visibility with least-privilege access.
- Add privacy-conscious registration and verification event telemetry with explicit retention rules.
- Define approved membership products, prices, trial policy, cancellation/refund policy, and entitlements.
- Select a provider only after written confirmation of eligibility, supported countries, business entity requirements, recurring billing, refunds, fees, settlement and API/webhook support.
- Keep billing disabled until provider sandbox and webhook tests pass.

### Track 3 — Commerce workflows
- Test seller-owned store/product management and buyer hand-off with separate test accounts.
- Test official-store sourcing, evidence review, destination pricing and customer quote acceptance.
- Complete order, fulfilment, delivery, cancellation, return, refund and dispute workflows only with valid providers and human approval controls.

### Track 4 — AI, communication and trade
- Verify AI runtime configuration without exposing secrets; exercise all nine offices and the manager's task dispatch in a controlled test.
- Verify messages, inquiries, notifications, trade deals and permissions across distinct test identities.
- Keep all AI operations read-only or draft-only until their evidence, authorization, audit and approval gates are proven.

### Track 5 — Launch decision
- Complete bilingual, accessibility, privacy, security, load, backup/restore and incident-response checks.
- Confirm legal entity/jurisdiction, consumer disclosures, taxes/customs, privacy terms, returns and provider contracts for each launch market.
- Publish a signed release checklist and launch only after every critical gate is evidenced.

## Explicit blockers that cannot be solved by code alone

- A payment provider must approve the business, countries, products, settlement model and (if applicable) marketplace flows. No live billing is currently configured.
- Membership prices, trial rules and commercial terms require owner approval; none are to be invented.
- AI model credentials must be configured as server-side secrets by an authorized account owner; they must never be committed to Git.
- The Render Free database has a provider-reported 2026-12-04 expiry. A continuity decision and verified backup are required before that date; no paid upgrade is authorized by this document.
- Third-party supplier, carrier and research data integrations require authorized API/feed access and commercial-use rights.

## Current release decision

**WASLA is deployed, but it is not ready for a full paid public launch.** The next engineering priority is to prove the current live flows and finish the customer/account operations layer, while keeping payments, supplier purchases, and autonomous AI actions disabled until their external and safety prerequisites are met.
