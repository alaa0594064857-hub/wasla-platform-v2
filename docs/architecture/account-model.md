
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

Initial authentication provider: Better Auth.

The implementation uses:
- Better Auth.
- Better Auth Drizzle adapter.
- PostgreSQL.
- Drizzle ORM.

Better Auth manages authentication credentials
and authentication sessions.

The auth_sessions table is provider-managed
session persistence. It is not a separate
WASLA session-token system.

WASLA must not duplicate provider session
secrets in another application table.

The provider integration must preserve
one unified WASLA user identity.

Production activation remains subject
to the security requirements in
authentication-and-sessions.md.

Changing the authentication provider requires
a documented architecture decision
and a migration plan.

## 9. Authentication Identity Separation

Authentication records remain separate
from personal profiles and business accounts.

The users table represents the unified
WASLA identity and is shared with
the authentication provider.

The auth_accounts, auth_sessions, and
auth_verifications tables are managed
through the Better Auth Drizzle integration.

The auth_identities table currently exists
as a separate WASLA identity-mapping structure.
It is not mapped as a Better Auth table
in the current integration.

Its future responsibility and relationship
to provider-managed identity records must
be reviewed before implementing additional
social login providers or writing duplicate
identity records.

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

Database access layer: Drizzle ORM.

Migration tool: Drizzle Kit.

Database hosting provider remains deferred.

All migrations must be reviewed,
version-controlled, and tested before use.

Schema changes must be accompanied by
reviewed migrations and relevant tests.

## 13. Demo Data

Demo buyer and demo company records
must use fictional information.

Demo data must be isolated from production.

Demo users must follow the same authorization
rules as real users.

Demo credentials must never be reused
for real accounts.

## 14. Documentation Reconciliation

Architecture documents must remain aligned:

- account-model.md defines the account
  and store model.
- authorization-model.md defines scoped roles
  and backend authorization.
- authentication-and-sessions.md records
  the Better Auth integration and security rules.
- data-model.md defines database entities
  and their relationships.

Any future change to these decisions must
be reflected in the relevant documents
before implementation.

## 15. Implementation Boundary

These decisions establish the logical architecture
and the initial authentication provider.

They do not:
- Select a database hosting provider.
- Create a production database.
- Configure production credentials.
- Complete production email delivery.
- Declare authentication production-ready.
- Replace the need for security and integration tests.

## 16. Status

Status:
- Unified user and business account model recorded.
- Four authorization scopes recorded.
- Better Auth selected as the initial provider.
- Provider-managed session persistence clarified.
- Database and migration direction recorded.

Remaining review:
- Clarify the future responsibility of auth_identities.
- Complete authentication security tests.
- Verify production email and secret configuration.
- Continue database schema and migration review.

Next step: Complete the identity and account
foundation before moving to the next stage.
