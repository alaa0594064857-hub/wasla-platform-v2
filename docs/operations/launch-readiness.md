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
