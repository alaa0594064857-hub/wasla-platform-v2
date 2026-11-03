# WASLA V2 — Authorization Model

## 1. Purpose

Define how permissions are assigned, evaluated,
and enforced across WASLA.

This document follows the decisions in:
- architecture-decisions.md
- account-model.md
- data-model.md

## 2. Security Principles

- Authentication identifies the user.
- Authorization controls access to resources.
- The backend is the final authorization authority.
- Every protected operation requires authorization.
- Access must be limited to the required scope.
- Deny access by default.
- Frontend checks are never security enforcement.

## 3. Authorization Scopes

WASLA uses four independent scopes.

### Personal Scope

Controls a user's own information.

Examples:
- Read personal profile.
- Update personal profile.
- Manage preferences.
- View personal orders.
- Manage personal security settings.

### Platform Scope

Controls platform-wide operations.

Examples:
- Platform administration.
- User management.
- Global reports.
- Platform settings.
- Security monitoring.

### Account Scope

Controls access within one business account.

Examples:
- Manage business profile.
- Invite account members.
- Manage account products.
- View account orders.
- Manage account settings.

### Store Scope

Controls access within one individual store.

Examples:
- Manage store details.
- Manage store products.
- Manage inventory.
- Process store orders.
- View store reports.

Permissions must never cross scopes
without an explicit authorization rule.

## 4. Role Definitions

Roles are reusable definitions.
Role assignments connect users to scopes.

### Personal Capabilities

- buyer
- individual_user

### Platform Roles

- platform_owner
- platform_admin
- support_admin

### Account Roles

- account_owner
- account_admin
- account_manager
- account_employee
- account_viewer

### Store Roles

- store_owner
- store_admin
- store_manager
- store_employee

Every role must have a defined scope type.

A role must only be assigned within
its matching authorization scope.

## 5. Role Assignment Model

The initial assignment model uses:

### platform_role_assignments

Connects users to platform-level roles.

Required attributes:
- id
- user_id
- role_id
- status
- assigned_by
- assigned_at
- created_at

Platform role assignment requires
a protected administrative process.

### account_members

Connects users to business accounts.

Required attributes:
- id
- account_id
- user_id
- role_id
- status
- invited_by
- joined_at
- created_at
- updated_at

A user-account membership must be unique.

### store_members

Connects users to individual stores.

Required attributes:
- id
- store_id
- user_id
- role_id
- status
- created_at
- updated_at

A user-store membership must be unique.

Personal capabilities are associated
with the unified user identity.

## 6. Permission Naming

Permissions use the format:

resource.action

Examples:

- profile.read
- profile.update
- account.read
- account.update
- account.delete
- member.read
- member.invite
- member.remove
- store.read
- store.update
- product.read
- product.create
- product.update
- product.delete
- inventory.manage
- order.read
- order.manage
- trade.read
- trade.negotiate
- message.read
- message.send
- reports.read
- platform.manage

Each permission must have a documented scope.

## 7. Membership Rules

- A user may belong to multiple accounts.
- Each membership has its own role and status.
- Membership permissions apply only to that account.
- Removing a membership revokes its access.
- Suspended memberships cannot access account resources.
- Store membership applies only to its assigned store.
- Account membership does not automatically grant
  access to every store owned by that account.
- Account ownership changes must be audited.
- A user cannot gain access by changing frontend data.

## 8. Authorization Evaluation

For every protected request:

1. Identify the authenticated user.
2. Verify the user's status.
3. Identify the requested resource.
4. Determine the resource scope.
5. Verify the applicable membership or assignment.
6. Verify the role scope matches the resource scope.
7. Load the applicable permissions.
8. Allow only explicitly permitted actions.
9. Enforce resource ownership and isolation.
10. Record sensitive operations.

If any required check fails,
access must be denied.

## 9. Administrative Protection

- Platform administration is separate from business roles.
- Company owners are not platform administrators.
- Support staff receive limited permissions.
- Platform roles cannot be assigned through
  account or store memberships.
- Sensitive actions require explicit authorization.
- Administrative actions must be recorded in audit logs.
- No frontend-only administrator checks are trusted.

## 10. Data Isolation

- Users must not access another user's private data.
- Business members must not access unrelated accounts.
- Store members must not access unrelated stores.
- API queries must enforce scope restrictions.
- Database policies must reinforce backend authorization.
- Resource identifiers must never be treated
  as proof of authorization.

## 11. Permission Changes

- Role assignments must be validated by the backend.
- Only authorized administrators may change roles.
- Platform role changes require a protected process.
- Permission changes must be audited.
- Revoked permissions must take effect immediately
  for subsequent protected operations.

## 12. Initial Implementation Scope

The first implementation must support:

- Personal user access.
- Buyer capabilities.
- Business account memberships.
- Account owner and employee roles.
- Store ownership and membership foundations.
- Separate platform role assignments.
- Backend permission checks.
- Basic audit events.

Advanced custom roles and permission builders
may be introduced in later phases.

## 13. Testing Requirements

Tests must verify:

- Buyers cannot access platform administration.
- Company members cannot access unrelated companies.
- Store members cannot manage unrelated stores.
- Account membership does not grant automatic
  access to every store.
- Suspended users are denied access.
- Suspended memberships are denied access.
- Revoked memberships lose access.
- Unauthorized role changes are rejected.
- Account owners cannot assign platform roles.
- Sensitive actions create audit records.

## 14. Implementation Status

Status: Updated to align with architecture decisions.

This document does not create database tables,
permissions, or production security policies.
