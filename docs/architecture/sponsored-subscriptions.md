# WASLA Sponsored Subscriptions

Status: approved implementation direction; specification only. This document does not enable billing, create subscriptions, or claim a sponsor commitment.

## Purpose

Allow a person, company, nonprofit, incubator, or other approved partner to cover the membership cost of a WASLA member (for example, a small shop or supplier) without requiring WASLA to transfer cash to that member.

The sponsored member receives the same plan entitlements as a directly paying member. The sponsor receives a transparent record of what it agreed to support, subject to the beneficiary's privacy and consent.

## Non-negotiable boundaries

- WASLA must not describe an expression of interest, pledge, invoice, or uploaded receipt as settled money.
- No paid subscription becomes active merely because a browser says payment succeeded.
- Until a compliant billing provider and the legal/settlement requirements are confirmed, all sponsored subscriptions remain manually reviewed and billing stays disabled.
- WASLA does not hold, escrow, split, or forward money intended for merchants.
- Never expose a beneficiary's private account data to a sponsor without explicit consent and a defined reporting purpose.
- Every owner action must be authenticated, permission-checked, and written to an append-only audit trail.
- A sponsor cannot choose or alter a beneficiary's private data, account roles, products, or business operations.

## Intended lifecycle

1. **Request** — a business/member requests sponsorship, or a sponsor submits an offer. Both paths record consent to be contacted.
2. **Review** — the platform owner verifies the sponsor, beneficiary eligibility, requested plan, duration, and any restrictions.
3. **Offer** — the sponsor receives a written offer showing plan, currency, price, duration, coverage start/end rules, cancellation terms, and what information will be reported.
4. **Evidence** — where payment is arranged outside WASLA, an owner records the payment evidence URL and independently verifies settlement. A pledge or invoice is not payment evidence.
5. **Activation** — only the owner can activate the sponsored subscription after verifying the settlement evidence; paid activation requires a credential-free HTTPS evidence URL and an audit reason.
6. **Expiry / renewal** — the system records the covered period and sends renewal reminders; it never silently renews or charges a sponsor while billing is disabled.
7. **Closeout** — cancellation, expiry, refund, dispute, or sponsor withdrawal is recorded with an audit event and the beneficiary is notified.

## Data model proposal

Keep the existing `subscriptions` row as the entitlement source. Add a dedicated sponsorship record linked one-to-one to a sponsored subscription:

- `id` UUID primary key
- `subscription_id` UUID unique foreign key to `subscriptions`
- `sponsor_type` constrained enum/text: individual, organization, program
- `sponsor_name` text (minimum necessary identifying information)
- `sponsor_contact_user_id` nullable FK to a verified WASLA user
- `sponsor_reference` nullable text (external grant/program reference; never a secret)
- `beneficiary_consent_at` timestamp, required before sponsor-facing reporting
- `coverage_start`, `coverage_end` timestamps
- `payment_status` constrained values: proposed, pledged, invoiced, evidence_submitted, verified, rejected, refunded, canceled
- `payment_evidence_url` nullable HTTPS URL
- `verified_by_user_id` nullable FK to platform owner
- `verified_at` nullable timestamp
- `created_at`, `updated_at`

Add an append-only `subscription_sponsorship_events` table for status transitions, actor, reason, and evidence reference. Do not store card details, bank credentials, or unnecessary identity documents.

## Owner console requirements

- Separate "Direct subscriptions" and "Sponsored subscriptions" views.
- Create a sponsorship against an existing active plan and an existing active beneficiary account/user.
- For organizations, require an active account and an active, verified billing contact who is a member of that account.
- Capture sponsor identity, sponsor reference, beneficiary, plan, coverage duration, consent, and audit reason.
- Display payment status separately from subscription status.
- Require owner verification before a paid sponsored subscription can become active.
- Show a complete event history and allow export of a minimal sponsor report.
- Never expose sponsor/beneficiary private information through public catalog or public APIs.

## Sponsor-facing intake (public)

The public form should collect only: sponsor name, organization (optional), work email, country, intended number of memberships, preferred contact language, short message, and consent to be contacted. It must not collect card or bank details. Add rate limiting, spam protection, privacy notice, and a clear statement that submitting the form is not a funding commitment.

## Beneficiary-facing intake

A member may request sponsorship by selecting their account, explaining the business need, choosing from currently published plans, and accepting the privacy/reporting terms. The request is not a subscription and does not grant entitlements until approved and funded.

## Implementation sequence

1. Confirm database constraints and migration strategy for sponsorship records and immutable event history.
2. Add owner-only sponsorship API with explicit state-transition validation and audit logging.
3. Add account directory lookup for active business accounts and verified billing contacts; do not overload the user directory.
4. Add bilingual owner console for creating, reviewing, and closing sponsorships.
5. Add public sponsor-interest intake with rate limits and privacy controls; keep it separate from payment.
6. Add beneficiary request flow and consent capture.
7. Add entitlement enforcement tests for individual and business subscriptions.
8. Run migrations, API tests, TypeScript checks, web build, and two-account hosted acceptance tests.
9. Only after legal/provider eligibility, recurring billing, refunds, fees, settlement, tax, and webhook verification are confirmed, consider enabling provider checkout.

## Acceptance criteria

- A sponsor can express interest without creating a subscription or payment record.
- An approved sponsor can be linked to one or more named beneficiaries only with documented beneficiary consent.
- A pledge, invoice, or unverified receipt never activates a paid plan.
- Every create/update/verify/reject/cancel action is owner-authorized and auditable.
- The beneficiary sees the plan and coverage dates; the sponsor sees only the consented reporting fields.
- Direct and sponsored subscriptions use the same server-side entitlement checks.
- Billing remains disabled until provider sandbox, webhook signature, duplicate-event, refund, and settlement tests pass.
