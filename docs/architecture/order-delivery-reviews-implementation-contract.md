# WASLA Order Fulfilment, Delivery Evidence & Verified Reviews

Status: implementation contract for the pre-launch commerce milestone
Date: 2026-11-08
Target: WASLA V2; member-owned stores and the separate official WASLA Store

This document defines the complete backend and product contract to implement before a public custom-domain launch. It is not evidence that these runtime features are already implemented or deployed. Payment-provider integration remains a separate gated milestone.

## 1. Non-negotiable business boundaries

### Member-owned stores
- The member merchant is the seller of record and remains responsible for customer payment, stock, fulfilment, carrier selection, delivery, returns, refunds and customer service.
- WASLA supplies workflow, status, evidence, notifications and dispute records. WASLA must not receive, hold, split or pay out member-sale funds.
- Merchant actions are scoped to stores/accounts they actively manage. A merchant cannot alter another merchant's orders or act as the buyer.
- A merchant's delivered status claim is a shipment update, not independently verified delivery evidence and does not by itself qualify an order for review.

### Official WASLA Store
- WASLA is responsible for the customer-facing sale, disclosures, payment, fulfilment coordination, delivery support, returns and refunds.
- Supplier identity, private source URLs, supplier costs, margins and procurement references remain owner/authorized-operations only. Legally required seller, origin, shipping, customs, duties, returns and consumer-rights disclosures remain visible.
- Supplier-direct shipping is permitted only for the exact customer-approved variant and destination after the offer, stock, cost, delivery and direct-shipping terms are revalidated.
- No silent substitution. A material change requires customer approval or a policy-compliant cancellation/refund.
- Payment and supplier purchasing remain disabled until separately approved and integrated. This milestone must not fake a paid order or procurement action.

## 2. Canonical order lifecycle

Use explicit server-enforced transitions, not arbitrary status assignment from the browser or AI.

Suggested shared lifecycle vocabulary:
- pending_seller_review
- accepted
- awaiting_payment
- paid
- processing
- ready_to_ship
- shipped
- in_transit
- delivery_attempted
- delivery_exception
- delivered_pending_confirmation
- completed
- cancellation_requested
- cancelled
- return_requested
- return_in_transit
- returned
- refund_pending
- refunded
- disputed
- exception

Rules:
1. Member-store accepted means the merchant accepted the request; it does not mean paid, shipped or completed.
2. paid is only reachable through a future verified payment integration or a separately authorized, audited merchant-side process that the product/legal model permits. A screenshot, redirect, browser flag or customer statement is not proof.
3. processing requires an accepted seller/fulfilment commitment.
4. shipped requires carrier/tracking details or a documented manual shipment record.
5. delivered_pending_confirmation requires a credible carrier delivery event or an authorized evidence review; a seller's uncorroborated free-text claim is insufficient.
6. completed is reached after customer confirmation, trusted carrier proof plus a defined no-objection window, or an authorized dispute-resolution decision. The exact no-objection period is a policy configuration and must be disclosed.
7. Refund, return, cancellation and dispute transitions preserve the entire event history and never erase payment or fulfilment facts.
8. Terminal states cannot be reopened by ordinary merchant/customer requests. Authorized support may open a linked case and append a corrective event; never rewrite history.

Do not force the official-store legacy enum or member-store enum into a risky one-shot rename. Introduce a migration-compatible transition layer and map old statuses explicitly.

## 3. Shipment and tracking records

Store normalized shipment records linked to an order:
- shipment ID, order ID/type, seller/fulfiller actor, carrier code/name, tracking reference, tracking URL only from a validated carrier integration or safe allowlist, origin/destination country as required, shipped timestamp, last carrier event timestamp, current normalized status, source (carrier_webhook, carrier_api, merchant_manual, owner_manual), and created/updated timestamps.
- Never expose private supplier tracking or supplier URLs to official-store customers. Customer tracking should use WASLA's customer-safe tracking representation.
- Tracking references are PII-adjacent operational data: apply order ownership checks, avoid leaking them in public APIs/logs and redact them from unnecessary audit payloads.
- Manual shipment entries must identify the actor, timestamp, reason and evidence reference. They are visibly marked as manually reported until corroborated.
- Carrier events are append-only, deduplicated by provider/event ID where available, and validated against the expected shipment/order.

## 4. Delivery evidence and confirmation

Evidence confidence, in descending order:
1. Authenticated carrier webhook/API event with verified signature/provider identity, matching tracking reference and delivered event.
2. Carrier-supplied proof-of-delivery record or signed document/reference, checked by authorized staff or a trusted integration.
3. Customer's authenticated explicit I received this order confirmation.
4. Manual owner/support review with evidence reference and reason.
5. Merchant self-report alone: informational only; cannot unlock reviews.

For all evidence:
- Persist source, source event ID, observed time, received time, actor/service identity, order/shipment link, evidence reference/hash where practical, verification state, and decision reason.
- Never store raw card data, identity documents or unnecessary sensitive media as delivery proof.
- Customer confirmation must be authenticated, order-owner scoped, idempotent and protected against replay.
- A customer may report not received, partial delivery, wrong item or damaged. These create a case and pause automatic completion/review eligibility.
- Do not automatically close a case because a carrier says delivered. Provide a human-review path for contradictory evidence, safe-place delivery, shared-address delivery and carrier errors.
- Define a configurable delivery objection window only after legal/product policy approval; disclose it to customers before checkout.

## 5. Complaints, returns and disputes

Create a case workflow linked to the order and relevant shipment/evidence:
- case types: not_received, partial_delivery, wrong_item, damaged, counterfeit_or_safety, late_delivery, return_request, refund_request, payment_issue, seller_misconduct, review_abuse, other.
- states: open, awaiting_customer, awaiting_seller, under_review, resolved, rejected_with_reason, escalated, closed.
- record reporter, affected party, assigned authorized reviewer, reason code, customer-visible summary, private internal notes, evidence references, timestamps and immutable case events.
- Do not expose internal notes or other party's private information.
- A case affecting delivery, item condition, authenticity or refund blocks review eligibility until resolved.
- Support/admin decisions require reason codes and audit events. Financial refunds remain disabled until an approved payment provider and refund process exist.

## 6. Verified review eligibility and policy

A review is permitted only when:
- the authenticated user is the buyer attached to the exact order;
- the order is completed under the trusted completion rules above;
- the order contains the product/variant being reviewed;
- the order is not cancelled, refunded, under an unresolved delivery/item dispute or otherwise ineligible under published policy;
- the user has not already submitted a review for that order line/product under the defined uniqueness policy.

Use a unique database constraint for the chosen scope (recommended: one review per order line per buyer; edits update that same review rather than create another). Do not rely only on UI checks.

Review data:
- order ID and order-line ID, buyer ID, product/store ID, rating range (1–5), optional bilingual title/body or language-tagged content, moderation state, verified-purchase marker derived server-side, created/updated timestamps, and moderation metadata.
- Do not expose buyer email, phone, address, private order notes or shipment tracking in public reviews.
- Verified-purchase label is server-derived and must never be client-set.
- The buyer may edit their own review under a published edit window/policy. Edits append revision history; never silently overwrite the audit trail.
- The seller cannot edit, hide, delete or suppress a buyer's review, including negative reviews.
- A seller may post a clearly labelled public response if product policy permits; it cannot alter the review or reveal buyer information.
- Ratings aggregate only from reviews that are visible under moderation policy. Keep raw review history for audit, subject to the approved retention/privacy policy.

## 7. Review reporting and moderation

- Any authenticated user may report a review with a required reason and optional explanation.
- Deduplicate repeated reports by reporter/review where appropriate; rate-limit abuse.
- Moderation states: pending, published, limited_visibility, hidden_pending_review, removed_for_policy, restored.
- Do not hide a review solely because it is negative or because a seller reported it. Require policy-grounded reason and an authorized moderator.
- Preserve original content and moderation history. Removal from public display is not deletion from the audit record.
- Notify the author about material moderation decisions and provide an appeal path.
- Moderators must not see unrelated private messages or full customer PII merely to moderate a review.

## 8. Roles and authorization matrix

| Action | Buyer | Member merchant | Official-store owner/support | Carrier integration |
|---|---|---|---|---|
| Read own order | Yes | Only managed store orders | Authorized scope | No |
| Accept/reject member request | No | Managed store only | Policy-limited support | No |
| Add manual shipment details | No | Managed store only | Official store / authorized support | No |
| Submit carrier event | No | No | No | Signed, mapped shipment only |
| Confirm receipt | Own order only | No | No | No |
| Open delivery case | Own order | Managed order with reason | Authorized support | May raise exception event |
| Resolve case | No | Respond/provide evidence | Authorized reviewer | No |
| Submit review | Eligible buyer only | No | No | No |
| Edit review | Own review only | No | No | No |
| Moderate review | No | No | Authorized moderator | No |
| Delete or rewrite event history | No | No | No | No |

Every handler rechecks authentication, active account membership, resource ownership, role, current state and idempotency inside the transaction. Hiding a button is not authorization.

## 9. Data integrity and event architecture

- Add append-only order events and shipment events with actor type/ID, action, previous/new state, source, reason code, safe metadata, event ID and timestamps.
- Add idempotency keys or unique provider event IDs for every external event and user transition that may be retried.
- Use transactions with row locking or conditional updates to prevent concurrent conflicting transitions.
- Enforce state transitions in server-side domain functions shared by handlers; do not duplicate transition logic across routes.
- Add foreign keys and uniqueness constraints for shipments, carrier events, review eligibility and review uniqueness.
- Keep customer-safe DTOs separate from owner/private operational DTOs. Test for supplier identity/cost/source URL leakage and tracking/PII leakage.
- Use bilingual customer notifications generated from trusted state changes, not model-generated claims. Notification creation belongs in the same transaction as the state/event change where possible.
- AI may summarize and recommend next actions only. It cannot invent delivery proof, set states, resolve disputes, moderate its own output, issue refunds or purchase goods.

## 10. Required screens and customer journeys

- Buyer: order timeline, safe tracking, confirm receipt, report a problem, return/refund request, eligible review form, review edit/history and report review.
- Member merchant: incoming requests, accept/reject, processing, shipment entry, tracking updates, case response and customer-safe communication. No access to other stores' orders.
- Official-store owner desk: order/fulfilment timeline, supplier-private operational panel, customer-safe status preview, evidence review, exception/case handling and owner approval gates.
- Moderation desk: review queue, reports, reasoned decisions, appeals and immutable moderation history.
- All screens must support Arabic RTL and English LTR, accessible labels/errors, empty/loading/error states and mobile layouts.

## 11. Acceptance test matrix

### Authorization and privacy
- unauthenticated access rejected;
- buyer A cannot read/confirm/review buyer B's order;
- merchant A cannot read/update merchant B's order;
- merchant cannot mark own order completed by arbitrary status injection;
- customer payload never includes supplier identity, cost, private source URLs or supplier tracking;
- private case notes and personal data are not exposed to the other party.

### State and evidence
- invalid transitions rejected with 409;
- concurrent accept/reject or completion attempts yield one winner and one immutable event;
- duplicate carrier webhook is idempotent;
- invalid signature, unknown carrier event, wrong tracking/order match and stale/replayed event rejected;
- manual merchant delivery claim alone does not qualify the order for reviews;
- customer receipt confirmation is order-owner scoped and idempotent;
- not-received/partial/damaged case pauses completion and review eligibility;
- authorized resolution records evidence, actor and reason.

### Reviews and moderation
- no review before eligible completion;
- one review per eligible order line;
- duplicate submission returns existing/conflict without duplicate aggregate;
- buyer may edit only own review; revision history is preserved;
- merchant cannot edit/delete/hide a review;
- negative review remains visible unless a documented policy violation is upheld;
- reports are rate-limited and moderation decisions require authorization and reason;
- hidden/removed reviews leave auditable history and appeal capability;
- aggregates exclude non-public moderation states and update transactionally.

### Regression and quality
- existing member-store request/notification behavior remains intact;
- official-store quote acceptance still does not enable payment or supplier purchasing;
- migrations are repeatable and safe for existing data;
- API tests, database constraints, typecheck, API build, Web build and full CI pass;
- hosted two-account journeys run after deployment, in a non-production/test environment first.

## 12. Delivery plan and release gates

Implementation order:
1. Inspect current route registration, database initialization/migration conventions, auth helpers and notification patterns; preserve existing order/quote behavior.
2. Add additive schema/migrations and shared transition/event domain services.
3. Implement member-store shipment, tracking, receipt confirmation and case creation.
4. Implement official-store fulfilment/evidence operations with owner-only supplier-private data and customer-safe DTOs.
5. Add customer and merchant notifications and bilingual order timelines.
6. Add review eligibility, review create/edit and unique constraints.
7. Add reporting, moderation, appeals and admin screens.
8. Add full API/DB/security regression suite and hosted two-account E2E tests.
9. Update implementation tracker with exact merged commit/CI evidence; deploy only after explicit owner approval and available Render build minutes.

Do not merge this work to main or deploy from this branch without owner approval.

## 13. What remains outside this milestone

Payment gateways are intentionally separate and remain disabled until:
- legal entity, merchant-of-record and operating jurisdiction are confirmed;
- provider eligibility, settlement country/currency and account ownership are approved;
- signed webhook verification, reconciliation, refunds, chargebacks and dispute operations are implemented and tested;
- tax, invoices, consumer disclosures, privacy and returns policies are legally reviewed.

Other pre-launch tasks also remain: verified sending domain/email delivery, custom-domain DNS/TLS, backups and restore drills, production secrets, supplier/carrier integrations, accessibility/localization audit, security review and hosted end-to-end acceptance. Buying a domain alone does not make the platform launch-ready.
