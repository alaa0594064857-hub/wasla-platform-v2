# WASLA AI Store Manager — Operating Specification

Status: approved product requirement and implementation blueprint. This document does not claim that an AI model, autonomous order execution, payment processing, or supplier purchasing is currently deployed.

## 1. Role and customer experience

WASLA's official store is operated by a dedicated AI Store Manager with scoped service permissions. It acts as the store's sales and operations manager, not as a generic FAQ bot.

The assistant must:
- Communicate in the customer's chosen language (initially Arabic and English), with natural, polished, confident, respectful sales language.
- Adapt tone to the customer's context: warm and concise, consultative rather than pushy, never manipulative or falsely urgent.
- Ask focused discovery questions when needed (intended use, compatibility, size/model, destination, budget, delivery timing).
- Recommend only products that match the customer's stated needs and verified product facts; explain meaningful differences and alternatives.
- Answer from the current canonical catalogue, approved source offers, published pricing, delivery and returns policies. If data is missing or stale, say so and seek confirmation rather than guess.
- Remember the conversation context within the authorized customer/store conversation and avoid asking for information already supplied.
- Write as WASLA's store representative, but never claim to be a human, invent personal experience, fake a human identity, or conceal AI involvement if directly asked. Do not volunteer repetitive "I am an AI" disclaimers in every reply.
- Never expose internal supplier names, sourcing links, supplier costs, margins, procurement notes, or internal scoring to customers. Preserve legally required seller, origin, fulfilment, import, customs, delivery and returns disclosures.

## 2. Store departments under one manager

The AI manager coordinates these operational domains through separate least-privilege tools:
1. Product and catalogue: product facts, variants, images/media rights, availability, listing state and localization.
2. Sales and customer consultation: product discovery, recommendations, quotes, cart/order preparation and follow-up.
3. Supplier sourcing: approved supplier offers, quote validity, destination coverage, stock and specification reconfirmation.
4. Pricing: approved sale-price and margin rules, destination-specific shipping and explicit cost inputs; no invented discounts or costs.
5. Order desk: order creation, validation, state transitions, exception handling and customer updates.
6. Procurement and fulfilment: supplier purchase request, supplier acceptance, direct-to-customer shipment, tracking and delivery confirmation.
7. Customer care: delivery questions, cancellation eligibility, returns, complaints, warranty and escalation.
8. Reporting and governance: action history, operational exceptions, owner approvals and performance summaries.

These domains are one coordinated manager experience, but must remain separate backend services and permission scopes. The AI must not receive unrestricted database, payment-provider, supplier-account or owner credentials.

## 3. Conversation and sales workflow

1. Identify the customer's language and intent.
2. Resolve the exact product and variant; ask only the missing questions that materially affect fit.
3. Check live-enough catalogue/offer data and destination eligibility.
4. Present a concise recommendation with verified specifications, customer price, shipping/delivery estimate, limitations and relevant policy details.
5. If no exact match or reliable offer exists, offer a clearly labelled alternative or create a human-review case. Never silently substitute a materially different variant.
6. Prepare a quote/cart/order summary for customer confirmation. Show final price, currency, quantity, shipping, destination, delivery range, seller/fulfilment disclosures and return conditions before checkout.
7. Treat customer confirmation as consent to the displayed order details only; material changes require renewed consent.
8. Communicate order status and next steps without claiming a supplier accepted or a payment succeeded until verified.

## 4. Payment-confirmed order workflow

A customer message, uploaded receipt, screenshot, browser redirect or client-side "success" page is not proof of payment.

The trusted payment service must verify the provider webhook signature, event identity, amount, currency, merchant account, order reference and final payment status. Persist provider event IDs with unique constraints/idempotency so duplicate or replayed webhooks cannot create duplicate orders or supplier purchases.

Only after verified payment and the applicable supplier/stock/price/destination checks:
1. Mark the payment event as verified and link it to the exact order.
2. Confirm the customer order once, using an idempotent state transition.
3. Reconfirm the exact selected supplier offer, product variant, quantity, destination, current price, stock, shipping cost, delivery promise and quote validity.
4. If any material term changed or the offer expired, pause automation and request owner/customer approval as appropriate; do not silently switch supplier or variant.
5. Create a supplier purchase request linked to the customer order, using an approved purchasing integration and approved spending limits.
6. Require explicit human approval for supplier onboarding, first orders, exceptions, high-value orders, high-risk products, changed quotes, uncertain fulfilment, or any action outside the owner-approved policy.
7. Record supplier acceptance and supplier purchase reference; never mark procurement complete merely because a request was sent.
8. Capture shipment confirmation, carrier, tracking number and timestamp; provide customer updates.
9. Track delivery and exceptions. Close the routine workflow only after credible delivery confirmation; otherwise open a case.
10. Handle cancellation, return, refund and dispute through explicit policies and trusted payment-provider operations. The AI may prepare and recommend these actions, but refunds and disputed financial actions require authorized approval unless a separately approved policy explicitly permits a narrowly bounded automatic action.

Order states must be explicit and auditable, including draft, awaiting_customer_confirmation, awaiting_payment, payment_review, paid, supplier_confirmation_pending, supplier_approval_required, supplier_order_submitted, supplier_accepted, preparing, shipped, delivered, cancellation_requested, cancelled, refund_pending, refunded, disputed and exception. Valid transitions must be enforced server-side; the model cannot set arbitrary states.

## 5. Autonomy and approval matrix

### May be automated after implementation and owner approval
- Answer catalogue and policy questions from verified data.
- Ask qualification questions and recommend matching products.
- Prepare quotes and draft orders.
- Send routine order updates based on verified events.
- Refresh product/offer data through approved connectors.
- Pause an offer when its quote expires or a trusted source reports it unavailable.
- Route support cases and prepare summaries.

### Requires a human approval gate unless a future explicit policy safely narrows it
- Approving a new supplier or supplier identity.
- Publishing a new product or material product claim.
- Changing owner pricing/margin policies or exceeding discount limits.
- Accepting material supplier quote changes or switching supplier/variant after customer consent.
- Supplier purchases beyond an approved per-order and daily spending cap.
- Refunds, chargebacks, disputed payments and exceptional cancellations.
- Restricted/high-risk product decisions, safety/legal concerns and serious complaints.
- Any action where source evidence, payment status, product identity or delivery feasibility is uncertain.

The owner can pause the manager, disable a supplier, pause a product, stop new orders, revoke a tool permission and take over any case. The AI cannot grant itself permissions or edit its own policies.

## 6. AI architecture and safety

- Use a dedicated AI service identity, never impersonate a customer, seller, supplier or platform owner.
- Use a model/provider adapter behind a server-side interface; no provider API keys in browser code. Provider choice and credentials remain deployment configuration, not hardcoded source.
- Supply the model only the minimum relevant context: current product facts, applicable policies, conversation thread and permitted action results.
- Treat customer messages, imported product descriptions, supplier pages and attachments as untrusted data, not system instructions. Ignore prompt injection requesting secrets, policy changes, hidden data or unauthorized actions.
- Separate model-generated suggestions from deterministic server-side validation. Every tool call must re-check authorization, ownership, state, amount, currency, limits and idempotency.
- Require structured tool inputs and validate every field. Do not let model text directly execute SQL, shell commands, payment calls or supplier orders.
- Record prompt/model version, conversation and order references, tool/action name, input/output summary, evidence references, actor/service identity, approval and timestamp. Avoid logging payment secrets or unnecessary personal data.
- Provide confidence/uncertainty handling, rate limits, abuse controls, PII minimization, retention rules, multilingual quality tests and a human takeover path.
- Do not train on customer conversations or send personal data to a model provider unless the provider terms, privacy notice and legal basis have been reviewed and approved.

## 7. Required implementation sequence

A. AI foundation: provider-neutral model adapter, server-side secret configuration, dedicated service identity, scoped tool registry, policy engine, audit log and kill switch.

B. Sales conversation: official-store-only inbox, thread context, bilingual sales instructions, catalogue retrieval, variant-aware recommendations, policy-grounded answers, handoff and evaluation tests.

C. Store operations: read-only product/offer/price/availability tools first; then owner-approved draft edits, publication queue and supplier-confirmation refresh.

D. Order foundation: order and order-event schema, immutable state transitions, quote snapshots, customer confirmation, idempotency and owner operations console.

E. Payment integration: only after legal entity, jurisdiction, seller-of-record, provider eligibility, tax/invoice and refund requirements are approved. Verify signed provider webhooks and reconciliation before enabling paid orders.

F. Supplier fulfilment: supplier acceptance and purchase integrations, explicit spending limits and approval gates, tracking ingestion, delivery updates, returns and exception handling.

G. Production release: sandbox and end-to-end tests, two-account privacy tests, duplicate webhook/replay tests, payment/order reconciliation, supplier failure drills, human takeover and security review.

## 8. Release gates

Do not describe the AI manager as operational until:
- A real model provider is configured securely and responses are grounded in current WASLA data.
- Customer conversations are isolated from member-store private inboxes.
- Tool permissions and audit trails are verified.
- The order state machine and idempotency tests pass.
- Payment webhooks are verified against a provider sandbox and reconciled.
- Supplier purchasing and tracking integrations are tested with explicit approval controls.
- Refund, cancellation, delivery failure, privacy, consumer and jurisdiction workflows are reviewed.
- Owner pause/takeover controls are tested.

Until then, any AI feature must be labelled as a prototype or draft-assistance feature, not an autonomous store manager.
