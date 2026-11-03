# WASLA V2 — Authorization Model

## 1. Purpose

Define how permissions are assigned, evaluated,
and enforced across WASLA.

## 2. Security Principles

- Authentication identifies the user.
- Authorization controls access to resources.
- The backend is the final authorization authority.
- Every protected operation requires authorization.
- Access must be limited to the required scope.
- Deny access by default.

## 3. Authorization Scopes

### Platform Scope

Controls platform-wide operations.

Examples:
- Platform administration
- User management
- Global reports
- Platform settings
- Security monitoring

### Account Scope

Controls access within a company or business account.

Examples:
- Manage business profile
- Invite account members
- Manage account products
- View account orders
- Manage account settings

### Store Scope

Controls access within an individual store.

Examples:
- Manage store details
- Manage products
- Manage inventory
- Process store orders
- View store reports

### Personal Scope

Controls a user's own personal information.

Examples:
- Read personal profile
- Update personal profile
- Manage personal preferences
- Manage personal sessions

## 4. Initial Roles

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

### Personal Capabilities

- buyer
- individual_user

Roles must always be evaluated within
their assigned scope.

## 5. Permission Naming

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

## 6. Membership Rules

- A user may belong to multiple accounts.
- Each membership has its own role and status.
- Membership permissions apply only to that account.
- Removing a membership revokes its access.
- Suspended memberships cannot access account resources.
- Account ownership changes must be audited.
- A user cannot gain access by changing frontend data.

## 7. Authorization Evaluation

For every protected request:

1. Identify the authenticated user.
2. Verify the user account status.
3. Identify the requested resource.
4. Determine the resource scope.
5. Verify active membership when required.
6. Load the applicable permissions.
7. Allow only explicitly permitted actions.
8. Record sensitive operations.

## 8. Administrative Protection

- Platform administration is separate from business roles.
- Company owners are not platform administrators.
- Support staff receive limited permissions.
- Sensitive actions require explicit authorization.
- Administrative actions must be recorded in audit logs.
- No frontend-only administrator checks are trusted.

## 9. Data Isolation

- Users must not access another user's private data.
- Business members must not access unrelated accounts.
- Store members must not access unrelated stores.
- API queries must enforce scope restrictions.
- Database policies must reinforce backend authorization.

## 10. Permission Changes

- Role assignments must be validated by the backend.
- Only authorized administrators may change roles.
- Permission changes must be audited.
- Revoked permissions must take effect immediately
  for subsequent protected operations.

## 11. Initial Implementation Scope

The first implementation must support:

- Personal user access
- Buyer capabilities
- Business account memberships
- Account owner and employee roles
- Store ownership and membership foundations
- Backend permission checks
- Basic audit events

Advanced custom roles and permission builders
may be introduced in later phases.

## 12. Testing Requirements

Tests must verify:

- Buyers cannot access platform administration.
- Company members cannot access unrelated companies.
- Store members cannot manage unrelated stores.
- Suspended users are denied access.
- Suspended memberships are denied access.
- Revoked memberships lose access.
- Unauthorized role changes are rejected.
- Sensitive actions create audit records.

## 13. Implementation Status

Status: Authorization architecture defined.

This document does not create database tables,
permissions, or production security policies.
