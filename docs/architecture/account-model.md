
# WASLA V2 — Account Model

## 1. Purpose

Define how personal identities, business accounts,
account memberships, and stores relate to each other.

This document describes the account model.
It does not implement authentication or permissions.

## 2. Unified User Identity

Every person has one unified WASLA user identity.

A user may:
- Act as an individual buyer.
- Own one or more business accounts.
- Join multiple business accounts.
- Manage multiple stores.
- Have different roles in different accounts and stores.

A person must not need separate login identities
for different business activities.

The users table represents the unified person.

## 3. Personal User Profile

Each user may have one personal profile.

The profile contains personal presentation data,
such as:
- Display name.
- Avatar reference.
- Personal preferences.

Authentication credentials and provider sessions
must not be stored in the public profile.

A personal profile is separate from business data.

## 4. Business Accounts

A business account represents an independent
commercial organization on WASLA.

Initial account types:
- company
- supplier
- manufacturer
- trader
- brand

Buyer is a personal capability.
It is not a business account type.

Each business account has:
- A unique identifier.
- An account type.
- A legal name.
- A display name.
- A lifecycle status.
- An optional country code.
- Creation and update timestamps.

One user may own or participate in multiple accounts.

One account may have multiple users as members.

## 5. Business Profiles

Business profile information is stored separately
from the core account record.

It may include:
- Business description.
- Website.
- Public contact information.
- Verification status.

Private verification documents must be stored
in restricted storage and must never be exposed
as public business profile data.

## 6. Account Ownership

Account ownership is represented through
an account membership with the account_owner role.

The initial account creation process must:
1. Authenticate the user.
2. Validate the business information.
3. Create the business account.
4. Create its business profile.
5. Add the creator as an active account owner.
6. Record the operation in the audit log.

These operations must succeed or fail together
inside a database transaction.

Every active business account must have
at least one active account owner.

Ownership transfer must use a protected backend
operation and must be audited.

A business account owner is not automatically
a WASLA platform administrator.

## 7. Account Memberships

The account_members entity connects users
to business accounts.

Each membership contains:
- User.
- Business account.
- Account-scoped role.
- Membership status.
- Inviting user, when applicable.
- Join timestamp.
- Creation and update timestamps.

A user-account membership must be unique.

Supported membership states:
- invited
- active
- suspended
- revoked

Only active memberships grant account access.

Suspended or revoked memberships must not
grant access to account resources.

A user may belong to multiple accounts,
with a different role in each account.

## 8. Account Roles

Initial account role definitions:
- account_owner
- account_admin
- account_manager
- account_employee
- account_viewer

Every account role must use account scope.

Role definitions are separate from role assignments.

The account_members table stores assignments.
The roles table stores reusable role definitions.

The backend must validate every role assignment.

## 9. Stores

A store is a separate commercial resource
owned by one business account.

A store is not:
- A user identity.
- A business account.
- A login account.

One business account may own multiple stores.

Each store has:
- A unique identifier.
- An owning business account.
- A name.
- A public slug.
- A lifecycle status.
- Creation and update timestamps.

A store must always belong to one business account.

## 10. Store Memberships

The store_members entity connects users
to individual stores.

Initial store role definitions:
- store_owner
- store_admin
- store_manager
- store_employee

Every store role must use store scope.

A user-store membership must be unique.

Store membership grants access only to
the assigned store.

Account membership does not automatically
grant access to every store owned by that account.

The backend must verify store membership
and role permissions for every protected action.

## 11. Authorization Boundaries

WASLA uses four authorization scopes:
- personal
- platform
- account
- store

Account roles must not grant platform permissions.

Store roles must not grant access to unrelated stores.

Platform roles must be assigned separately
through platform_role_assignments.

Frontend role checks are not security enforcement.

The backend is responsible for authorization.
Database constraints and policies must reinforce it.

## 12. Account Lifecycle

Initial account states:
- pending_verification
- active
- suspended
- deactivated

Account lifecycle changes must be performed
through authorized backend operations.

Suspended or deactivated accounts must not
be available for normal business operations.

Lifecycle changes must be recorded
when they affect access or business operations.

## 13. Data Ownership and Isolation

- Users own their personal profile data.
- Business accounts own their business profile data.
- Accounts own their stores.
- Memberships define user access to accounts.
- Store memberships define access to individual stores.
- Resource identifiers alone never prove authorization.

Business data must not be exposed to unrelated users
or business accounts.

Deletion and retention rules must preserve
legally or operationally required records.

## 14. Audit Requirements

The following operations must be audited:
- Business account creation.
- Account ownership assignment and transfer.
- Member invitations.
- Membership activation and revocation.
- Membership suspension.
- Store creation.
- Store ownership or access changes.
- Sensitive account lifecycle changes.

Audit records must not contain passwords,
session tokens, or authentication secrets.

## 15. Demo Accounts

Demo buyer and demo company records must:
- Use fictional information.
- Be isolated from production data.
- Use the same authorization rules as real users.
- Never contain real credentials.
- Be removable without affecting real users.

## 16. Current Data Model Mapping

The initial database schema uses:
- users
- profiles
- accounts
- business_profiles
- account_members
- stores
- store_members
- roles
- permissions
- role_permissions
- platform_role_assignments
- audit_logs

Authentication provider tables are documented
in authentication-and-sessions.md.

## 17. Implementation Boundary

This document defines the account model.

It does not claim that:
- All account APIs are implemented.
- All role definitions are seeded.
- All authorization checks are implemented.
- Production verification is configured.
- Production data is available.

These capabilities must be implemented
and tested before the account foundation
is declared production-ready.

## 18. Status

Status: Account model documented.

Database foundation exists.
Full account workflows and backend authorization
remain implementation tasks.
