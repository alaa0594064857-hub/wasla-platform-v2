# WASLA V2 — Architecture Decisions

## 1. Purpose

Record decisions that resolve overlaps
between the account, authentication,
authorization, and data model documents.

These decisions guide implementation
and take precedence where earlier documents
contain conflicting descriptions.

## 2. Unified User Identity

Decision:

Each person has one unified platform user.

A user may:
- Buy products.
- Own or manage business accounts.
- Join multiple companies.
- Manage multiple stores.
- Hold different roles in different scopes.

A person must not need separate login identities
for each business activity.

## 3. Business Accounts and Stores

Decision:

A business account represents an organization.

Account categories may include:
- Company
- Supplier
- Manufacturer
- Trader
- Brand

A store is a separate entity owned by
a business account.

A store is not a separate user identity
or an account category in the initial model.

One business account may own multiple stores.

Store membership is managed independently
from business account membership.

## 4. Buyer Identity

Decision:

Buyer is a personal platform capability,
not a business account type.

A user may act as a buyer while also belonging
to one or more business accounts.

Buyer permissions must not grant access
to unrelated business resources.

## 5. Authorization Scopes

The platform uses four authorization scopes:

- Personal
- Platform
- Account
- Store

Every role assignment must belong
to exactly one applicable scope.

A role from one scope must never grant
permissions in another scope automatically.

## 6. Role Assignments

Decision:

Keep role definitions separate from
role assignments.

The initial assignment model uses:

- account_members for account roles.
- store_members for store roles.
- platform_role_assignments for platform roles.
- Personal capabilities for user-level actions.

Platform roles must never be assigned
through account or store membership records.

Platform role assignment requires
a protected administrative process.

A company owner is not automatically
a platform administrator.

## 7. Role Scope Integrity

Each role must define its scope type.

Allowed scope types:

- personal
- platform
- account
- store

The backend must verify that a role's scope
matches the resource being accessed.

Role assignments must be validated
against their target scope.

The database must enforce appropriate
foreign keys and uniqueness constraints.

## 8. Sessions and Authentication

Decision:

The authentication provider manages
authentication sessions initially.

WASLA must not duplicate provider session
secrets in its own database.

The application may maintain non-secret
session metadata or references when required
for auditing, device management, or security.

Provider selection remains deferred.

The authentication layer must support:
- Session expiration.
- Logout.
- Session revocation.
- User suspension handling.
- Password recovery.
- Future multi-factor authentication.

## 9. Authentication Identity Separation

Authentication identities remain separate
from personal profiles and business accounts.

The auth_identities entity links external
or provider-managed identity subjects
to the unified WASLA user.

Provider credentials and secrets must not
be stored in public profile records.

## 10. Authorization Evaluation

Every protected request must:

1. Authenticate the user.
2. Verify the user status.
3. Identify the requested resource.
4. Determine its authorization scope.
5. Verify the applicable membership or assignment.
6. Validate the role scope.
7. Check the required permission.
8. Enforce resource ownership and isolation.
9. Record sensitive operations.

Access must be denied by default.

Frontend checks are never sufficient
for security enforcement.

## 11. Membership Rules

Account membership is unique per user
and account combination.

Store membership is unique per user
and store combination.

Suspended or revoked memberships
must not grant access.

Store membership does not automatically
grant access to every store owned
by the same business account.

Account ownership and membership changes
must be audited.

## 12. Database and Migration Direction

Database engine: PostgreSQL.

Recommended access layer: Drizzle ORM.

Recommended migration tool: Drizzle Kit.

Database hosting provider remains deferred.

All migrations must be reviewed,
version-controlled, and tested before use.

## 13. Demo Data

Demo buyer and demo company records
must use fictional information.

Demo data must be isolated from production.

Demo users must follow the same authorization
rules as real users.

Demo credentials must never be reused
for real accounts.

## 14. Documentation Reconciliation

Before database implementation:

- Align account-model.md with the store decision.
- Align authorization-model.md with role assignments.
- Align authentication-and-sessions.md with
  provider-managed sessions.
- Align data-model.md with platform role assignments.
- Verify that all relationships and scope rules
  are consistent.

## 15. Implementation Boundary

These decisions define the logical architecture.

They do not:
- Select an authentication provider.
- Select a database hosting provider.
- Create a production database.
- Create SQL migrations.
- Configure production credentials.

## 16. Status

Status: Architecture decisions recorded.

Next step: Reconcile architecture documents
before implementing the database schema.


## 17. Official WASLA Store and AI Operations

Decision:

The official WASLA Store is a platform-owned commerce
channel. It is separate from member-owned stores
and must not be represented as an ordinary member store.

Customer communications for the official WASLA Store
follow a dedicated AI-operated workflow:

- Messages addressed to the official WASLA Store
  are received by the WASLA AI operations manager.
- Product inquiries for official-store listings
  are routed to the same AI operations workflow.
- The AI manager may answer routine questions,
  classify and track requests, and coordinate
  fulfillment with the relevant supplier or product owner.
- The platform does not assume centralized inventory.
  Product availability and fulfillment remain tied
  to the responsible supplier or owner.
- The platform owner retains ultimate oversight
  and may review operational records, intervene,
  or take over a case through authorized controls.

Member-owned stores remain independent:

- Direct messages are routed to the relevant active
  store/account contact.
- Product inquiries are delivered to the responsible
  store/account contact.
- The official-store AI workflow must not receive
  member-store private conversations by default.

Security and audit requirements:

- AI operations must use a dedicated service identity,
  not impersonate a customer or platform owner.
- Record AI actions, routing decisions, and human
  interventions in an auditable activity log.
- Customer private messages remain visible only
  to conversation participants and explicitly
  authorized operational actors for that workflow.
- AI access must be scoped to the official-store
  inbox and the minimum data needed to respond.

Implementation status:

This is an approved architecture decision.
The official WASLA Store, AI inbox, AI service identity,
and AI response workflow are not yet implemented.
Existing member-store inquiry routing remains separate.


## 18. Revenue Model and Merchant Payment Separation

Decision:

WASLA is a commerce platform and official-store operator.
It is not the payment intermediary for transactions
between independent member merchants and their customers.

Platform revenue is limited to the platform's own
commercial activities, including:

- Membership and subscription fees charged by WASLA
  for platform access or optional services.
- Sales made through the official, platform-owned
  WASLA Store.

Member merchant transactions remain independent:

- The customer pays the relevant merchant or business
  directly using that merchant's own payment method.
- The merchant is responsible for receiving payment,
  issuing any required sales documents, fulfilling
  the order, shipping, returns, and customer obligations.
- WASLA does not collect, hold, split, or transfer
  the merchant's transaction funds and does not deduct
  a transaction commission under this model.
- WASLA may provide discovery, messaging, inquiry,
  and order-coordination tools without becoming the
  merchant's payment processor or seller of record.

Official WASLA Store transactions are separate from
member commerce. WASLA is responsible for the official
store's own sales workflow, supplier coordination,
customer service, and applicable commercial obligations.
The platform must not assume that official-store products
are held in centralized inventory.

Product and system boundaries:

- Subscription billing must be modeled separately
  from merchant-to-customer payments.
- Official-store payments must use a dedicated
  platform-owned payment configuration.
- Member-store product pages must clearly identify
  the responsible seller and provide that seller's
  own payment/ordering instructions or approved
  external checkout path.
- No merchant payout, split-payment, escrow, or
  platform-held merchant balance feature is included
  in this business model unless explicitly approved
  through a future architecture decision.

Compliance boundary:

This architecture decision describes the intended
commercial and technical model; it does not itself
determine whether a business registration, tax
registration, invoicing, consumer-protection, or
e-commerce authorization is required. Those obligations
must be checked for the jurisdiction and actual operating
arrangement before commercial launch.

Implementation status:

Approved business-model decision.
Payment collection for subscriptions and the official
WASLA Store, seller disclosures, and production billing
flows still require implementation and jurisdictional
review. No claim is made that these payment flows
are currently live.


## 19. WASLA Subscription Billing Boundary

Decision:

WASLA membership subscriptions are a platform-owned
service and must remain separate from both member-merchant
transactions and official WASLA Store product orders.

The subscription domain must support:

- Versioned plans with a stable code, localized names
  and descriptions, billing interval, currency, amount,
  feature entitlements, publication state, and sort order.
- A user or eligible business account as the subscription
  customer, with an explicit owner responsible for billing.
- Subscription states including pending, trialing, active,
  past_due, paused, canceled, and expired.
- Start, current-period start/end, trial end, cancellation
  time, and renewal intent as separate fields.
- Provider-neutral payment references. Payment provider
  customer, checkout, invoice, and transaction identifiers
  may be stored as references, but WASLA must not store
  card numbers, security codes, or bank login credentials.
- Immutable payment event records with provider event IDs
  and idempotency protection to prevent duplicate processing.
- Invoice/receipt records linked only to WASLA subscription
  charges, with currency and amounts preserved exactly.
- Auditable administrative changes and a clear reason
  whenever a subscription is manually activated, paused,
  canceled, or adjusted.

Payment and activation rules:

- A subscription must never become paid/active merely
  because a browser returns from a checkout page.
- Paid status must be confirmed by a trusted, verified
  provider webhook or an explicitly audited owner action.
- Webhook signature verification, idempotency, replay
  protection, and reconciliation are required before
  production billing is enabled.
- No payment provider, merchant account, live checkout,
  pricing, or tax treatment is selected by this decision.
  Those remain deferred until the operating jurisdiction,
  legal entity, provider eligibility, and actual prices
  are confirmed.
- Free access, trials, and paid plans must be represented
  explicitly; do not invent prices or activate a trial
  without a published policy.

Separation requirements:

- Subscription charges are WASLA revenue.
- Official WASLA Store orders and payments are a separate
  platform-owned commerce workflow.
- Member-store customer payments remain directly between
  the member merchant and customer. They must never be
  recorded as WASLA subscription revenue or routed through
  the subscription provider configuration.
- No merchant balance, payout, escrow, split payment,
  or sales commission is introduced by subscription work.

Implementation status:

Approved architecture boundary only.
No subscription plans, subscriptions, invoices, payment
events, provider integration, or live billing have been
implemented by this decision.


## 20. AI-Operated Official Store and Sales Lifecycle

Decision:

The official WASLA Store is operated day to day by a dedicated
WASLA AI Store Manager. The AI manager is responsible for the
operational product lifecycle and customer sales workflow; it is
not merely a customer-support chatbot.

Product discovery and sourcing:
- The AI manager may research product opportunities, compare
  supplier offers, and collect product specifications, images,
  prices, lead times, and fulfilment terms from suppliers.
- Supplier claims, product authenticity, availability, pricing,
  and delivery promises must be treated as unverified until
  supported by supplier confirmation or trusted evidence.
- The AI must not fabricate suppliers, products, stock, prices,
  certifications, reviews, or delivery commitments.
- A sourcing candidate remains a private draft until required
  supplier evidence and commercial checks are recorded.
- The AI may prepare bilingual product content and propose
  pricing using owner-approved margin, currency, and pricing rules.
- Automatic publication is permitted only for products and
  pricing that satisfy an owner-approved policy. New suppliers,
  uncertain claims, exceptional prices, regulated/high-risk
  categories, and policy exceptions require human approval.

Product publishing and lifecycle:
- The AI manager may create, enrich, translate, publish, update,
  pause, and archive official-store product listings within its
  granted service permissions and approved policies.
- Publishing requires confirmed supplier identity/contact,
  product specifications, current price and currency, availability
  confirmation, fulfilment terms, image/content rights, and any
  required compliance checks.
- The AI must automatically pause or flag a listing when supplier
  confirmation expires, availability is withdrawn, material data
  conflicts, or a customer reports a serious issue.
- The official store does not own or centrally hold inventory.
  Suppliers remain responsible for confirming availability and
  fulfilling supplier-agreed obligations.

Sales and order operations:
- The AI manager owns the official-store operational workflow:
  customer enquiries, quote/availability confirmation, order
  preparation, customer updates, supplier coordination, shipment
  tracking, after-sales questions, and escalation.
- An order is not accepted as confirmed until the required
  supplier acceptance and payment confirmation conditions are met.
- Order states must distinguish draft, awaiting supplier,
  awaiting payment, paid, confirmed, preparing, shipped,
  delivered, cancelled, refunded, and exception/review states.
- The AI must not claim payment succeeded based on a browser
  redirect, customer statement, or unverified screenshot.
  Payment status must come from a trusted provider confirmation
  or an explicitly audited owner action.
- Official-store payment collection must use a dedicated
  platform-owned provider configuration and settlement account.
  It must never share member-merchant checkout credentials or
  subscription billing events.
- Until the legal entity, jurisdiction, seller-of-record model,
  provider eligibility, tax/invoicing, returns, shipping, and
  settlement arrangements are approved, live checkout and
  automatic paid-order acceptance remain disabled.
- The AI may prepare orders and coordinate supplier availability
  while payment is disabled, but must clearly label them as
  enquiries or pending orders, not completed sales.

Autonomy, limits, and human oversight:
- The platform owner defines the AI's supplier, product-category,
  pricing/margin, publication, refund, discount, and escalation
  policies. The AI cannot change its own permissions or policies.
- Routine actions within approved limits may be automated and
  must be recorded in the official-store activity log.
- Human approval is required for new supplier onboarding,
  policy exceptions, unusual discounts/pricing, refunds,
  disputed payments, suspected fraud, safety/compliance issues,
  and material customer complaints.
- The owner can pause the AI manager, unpublish products, suspend
  sales, and take over any order or customer case.
- The AI service identity is separate from customers, suppliers,
  member-store accounts, and the platform owner. It has least-
  privilege access only to official-store data and approved tools.
- Every AI research source, supplier confirmation, generated
  content revision, price change, publication, order transition,
  customer communication, and human intervention is auditable.

Implementation status:

Approved operating model. Current official-store product schema,
catalogue and owner console are only foundations. Automated
supplier discovery, AI product operations, order management,
payment integration, shipment tracking, customer sales workflow,
and AI oversight controls remain to be implemented and tested.


## 21. Third-Party Supplier Direct-to-Customer Fulfilment

Decision:

The official WASLA Store may curate products sourced from third-party
marketplaces and suppliers, including Alibaba.com, and offer eligible
products for direct shipment from the supplier to the end customer.
This is a supplier-fulfilled / dropshipping model, not WASLA-owned
central inventory.

Supplier and listing requirements:
- A product may be listed as supplier-fulfilled only after the supplier
  explicitly confirms single-order fulfilment, direct shipment to the
  customer's destination country, applicable minimum order quantity,
  current unit price, shipping cost, handling time, delivery estimate,
  tracking availability, packaging/branding options, and return terms.
- Marketplace listing data is a lead, not proof of stock, quality,
  shipping eligibility, or permission to resell images/content.
- Prefer eligible suppliers and orders with platform-provided buyer
  protection such as Alibaba.com Trade Assurance; record the actual
  protection terms and never imply that a marketplace badge guarantees
  every risk is covered.
- The AI must distinguish ready-to-ship products from inquiry-only or
  bulk/MOQ products. Products that cannot be supplied as single units
  with direct customer delivery must not be advertised as ordinary
  single-item dropship products.
- Product prices must include a reviewed landed-cost calculation:
  supplier price, shipping, marketplace/payment fees, customs/duties
  where estimable, currency conversion, taxes where applicable, and
  WASLA's approved margin. Uncertain costs must be disclosed or
  require owner review.
- Listings must show accurate seller/fulfilment disclosures, realistic
  delivery ranges, destination restrictions, and applicable return
  conditions. Do not copy supplier photos or descriptions unless
  their use is authorized.

Order and money flow:
- The customer places an order with the official WASLA Store under
  the approved seller-of-record and consumer terms.
- The order is only submitted to the supplier after the store's
  payment/authorization rules are satisfied and supplier stock,
  price, destination, and delivery terms are reconfirmed.
- The supplier ships directly to the customer and provides tracking.
  WASLA's AI manager tracks the supplier purchase and customer order
  as linked but distinct records.
- The customer pays WASLA only through a dedicated, approved official-
  store payment setup. WASLA pays the supplier through an approved
  purchasing method. This is distinct from member-store payments
  and subscription billing.
- Do not assume that a customer can safely pay Alibaba directly while
  WASLA separately collects a markup: that arrangement changes the
  contracting, payment, refund, tax, and customer-support model and
  must be explicitly designed before use.
- Until the seller-of-record, jurisdiction, tax/import duties, payment,
  refund/return, product safety, and supplier contracting model are
  approved, listings may be researched or shown as non-purchasable
  previews/enquiries only; no automatic paid order or supplier
  purchase is enabled.

AI controls:
- The AI may discover candidates and prepare draft listings.
  It may publish and place supplier orders only within explicit
  owner-approved supplier, category, destination, price, margin,
  order-value, and exception limits.
- New suppliers, high-risk/restricted products, unverified claims,
  unusual delivery terms, high order values, and refund/chargeback
  disputes require human approval.
- Maintain source URL, supplier identity, confirmation evidence,
  quote validity, shipping quote, MOQ, destination, and all price
  calculations in the audit trail.
- The platform owner can disable a supplier, pause a product, stop
  new orders, and take over a customer case at any time.

Implementation status:

Approved business and architecture model. Alibaba.com has a documented
dropshipping workflow through partner integrations for eligible
products, but each supplier/product still requires verification.
WASLA's supplier marketplace integration, sourcing automation,
landed-cost engine, checkout, purchasing, and fulfilment automation
are not implemented by this decision.
