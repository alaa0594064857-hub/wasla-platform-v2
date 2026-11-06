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
