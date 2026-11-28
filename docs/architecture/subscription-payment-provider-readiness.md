# WASLA subscription payments and payout readiness

## Purpose

Prepare recurring WASLA membership and platform-plan billing for international customers without falsely marking payments as live before a payment provider approves the merchant and the production webhook flow is verified.

This document covers WASLA's own subscription revenue only. It does not authorize collecting, holding, splitting, or paying out third-party marketplace seller funds.

## Current verified application state

- Subscription plan records and bilingual owner plan administration exist.
- Subscription lifecycle records and audit events exist.
- The API and owner screens explicitly return/show `billingEnabled: false`.
- There is no verified hosted checkout, payment-provider webhook, or automated payment reconciliation in the current application.
- Therefore, a plan being public or a subscription record being active must never be presented as proof that money was collected.

## Provider assessment for a founder operating from Türkiye

### Candidate A: Paddle — first application to assess for WASLA software subscriptions

Paddle states that it works with software businesses in countries outside its unsupported-country list; Türkiye is not on that list. Paddle acts as merchant of record for qualifying software sales and handles buyer checkout and applicable sales tax/VAT obligations for those transactions. Its payout documentation describes bank/wire transfer and Payoneer payouts and allows bank transfer details such as IBAN/BIC where supported.

Important limitations:
- Paddle is intended for software/digital-product billing. It is a candidate for WASLA's own SaaS/platform membership fees only if Paddle approves WASLA's exact product, legal setup, website, and business model.
- It is not a general marketplace seller-payout or escrow solution. Do not use it to collect third-party seller proceeds or represent it as a marketplace split-payment provider.
- Account approval, identity/business verification, payout-account ownership, country/currency support, reserves, fees, and payout timing must be confirmed in the Paddle account before enabling live billing.

Official references:
- https://www.paddle.com/help/start/account-verification/which-countries-are-supported-by-paddle
- https://www.paddle.com/help/start/intro-to-paddle/when-and-how-do-i-get-paid
- https://www.paddle.com/help/manage/get-paid/how-do-i-set-up-my-payout-settings
- https://developer.paddle.com/concepts/sell/supported-countries-locales/

### Candidate B: Lemon Squeezy — secondary candidate for qualifying digital/SaaS subscriptions

Its official bank-payout country list includes Türkiye and Belgium. It supports recurring subscription products and bank payouts, subject to merchant approval, identity checks, account eligibility, and its product policies.

Important limitations:
- It is designed for digital products/software and acts as merchant of record; it is not a general marketplace payout system.
- Its payout schedule, minimum payout threshold, holding period, conversion, and fees must be reviewed in the merchant dashboard before selection.
- The country list alone does not guarantee that a specific IBAN, account holder, or business profile will pass verification.

Official references:
- https://docs.lemonsqueezy.com/help/getting-started/supported-countries
- https://docs.lemonsqueezy.com/help/getting-started/getting-paid
- https://www.lemonsqueezy.com/pricing

### Stripe

Türkiye is not currently listed among Stripe's directly supported merchant-account countries. Opening a Stripe account in another country requires genuine legal and operational presence there, including a legal entity, tax ID, physical address, phone, ID, and an eligible bank account. A European IBAN by itself is not sufficient.

Official references:
- https://stripe.com/global
- https://support.stripe.com/questions/requirements-to-open-a-stripe-account-in-another-country

## Required implementation architecture

1. Keep subscription plan catalogue and subscription lifecycle provider-neutral.
2. Add a provider adapter boundary. The application must never accept raw card numbers or CVV; card data stays on the provider-hosted checkout page.
3. Create a checkout session only on the server for an authenticated customer and an active, public plan. Price, currency, plan ID, and customer identity must be loaded from the database, never trusted from browser-supplied totals.
4. Persist provider, provider customer ID, checkout/session ID, provider subscription ID, currency, amount, status, and immutable event references.
5. Verify webhook signatures against the raw request body before processing.
6. Store webhook event IDs under a unique constraint and process them idempotently. Duplicate, delayed, and out-of-order webhooks must not duplicate charges or regress subscription state.
7. Activate, renew, pause, or cancel a subscription only from a verified provider event or a documented, audited manual exception. A browser success redirect is not payment proof.
8. Keep an append-only billing event/audit trail. Reconcile provider transactions against WASLA records.
9. Make refund, chargeback, dispute, tax, invoice, failed-renewal, grace-period, cancellation, and customer-portal behavior explicit before launch.
10. Keep merchant payout configuration and secrets out of application tables and source control. Store secrets only in the deployment secret manager.
11. Keep seller marketplace settlements separate. Seller onboarding, KYC, split payments, commissions, refunds, reserves, and payouts require a marketplace-capable provider and separate compliance review.
12. Provide Arabic and English checkout explanations, receipts, cancellation terms, renewal terms, and support paths.

## Release gates

Do not enable `billingEnabled` or advertise subscriptions as payable until all are true:

- Provider has approved the actual WASLA legal entity/business profile and exact product.
- Payout account is verified by the provider and its legal account holder matches the approved merchant.
- Production API credentials and webhook signing secret are stored in Render secrets.
- Hosted checkout works for a real low-value transaction in the approved test/live environment.
- Webhook signature, replay protection, idempotency, event ordering, renewals, cancellation, and failure paths pass automated tests.
- Provider dashboard and WASLA ledger reconcile for successful payment, refund, and dispute.
- Legal terms, privacy, refund/cancellation policy, tax/invoice responsibilities, and support contact are published.
- A human-reviewed launch checklist is signed off.

## Information still required before selecting and activating a provider

The application code cannot infer or fabricate:
- Whether the European IBAN is held in the user's own legal name or in a business/entity name.
- The bank country, account type, and whether it accepts commercial payouts from the selected provider.
- The legal merchant/entity that will sign the provider agreement and its registration/tax details.
- Whether the provider approves WASLA as SaaS, marketplace, or a mixed business.

Do not request or store a full IBAN, bank statement, passport, tax ID, or bank login in GitHub issues, source code, or ordinary support tickets. Complete sensitive verification only in the provider's official dashboard.

## Decision

Assess Paddle first for WASLA's own software/platform subscriptions, with Lemon Squeezy as a secondary application candidate. Do not integrate either as a live provider until the provider approves the merchant and the payout destination. Neither candidate is approved here for third-party marketplace seller payouts.
