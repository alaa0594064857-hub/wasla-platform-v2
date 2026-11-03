# WASLA V2 — Account Architecture

## 1. Purpose

Define a scalable account model for the WASLA global commerce platform.

This document is the architectural reference for identity,
accounts, memberships, roles, and permissions.

## 2. Core Principles

- One person has one unified user identity.
- A user may have multiple roles.
- A user may belong to multiple businesses and stores.
- Business entities are separate from personal user profiles.
- Permissions are scoped to the relevant account or entity.
- Backend authorization is mandatory.
- Shared frontend types are not security authorities.
- Arabic and English are supported from the foundation.

## 3. Main Entities

### User
Represents a person's identity.

A user has:
- Unique ID
- Email identity
- Personal profile
- Preferred locale
- Account status
- Creation and update timestamps

### Account
Represents an independent business or organizational entity.

Account types may include:
- Individual
- Company
- Store
- Supplier organization

### Membership
Connects a user to an account.

A membership contains:
- User ID
- Account ID
- Assigned role
- Membership status
- Creation timestamp

A user may have multiple memberships.

### Role
Defines a named set of permissions within a scope.

Examples:
- Owner
- Administrator
- Manager
- Employee
- Buyer
- Supplier representative

### Permission
Defines an allowed action.

Examples:
- profile.read
- account.update
- member.invite
- product.create
- product.update
- order.read
- order.manage
- trade.negotiate
- message.send

## 4. Identity and Account Separation

The personal user identity must not be confused with
a company, store, or supplier account.

Example:

One user may:
- Buy products as an individual.
- Own Company A.
- Manage Store B.
- Work as an employee in Company C.

These relationships must not require separate user identities.

## 5. Authorization Rules

- The backend is the final authority for authorization.
- Every protected operation must verify the user's identity.
- Every account operation must verify active membership.
- Permissions must be checked within the correct account scope.
- Suspended users and memberships must be denied access.
- Administrative permissions must be explicitly restricted.
- Sensitive actions must be recorded in audit logs.

## 6. Initial Database Entities

Planned entities:

- users
- auth_identities
- sessions
- accounts
- account_members
- roles
- permissions
- role_permissions
- profiles
- business_profiles
- stores
- store_members

These entities will be introduced incrementally.
This document does not imply that database tables
or migrations already exist.

## 7. Localization

- Supported initial locales: Arabic and English.
- Arabic uses RTL direction.
- English uses LTR direction.
- User locale preference is stored independently.
- Translation content must remain separate from business logic.

## 8. Demo and Test Accounts

Testing must use isolated demo data.

Initial test scenarios:

### Demo Buyer
- Browse published products.
- View business profiles.
- Create test orders when order functionality exists.

### Demo Company
- Maintain a business profile.
- Publish test products after approval.
- Receive inquiries.
- Manage authorized company members.

Demo accounts must never contain real customer credentials
or production personal data.

## 9. Security Requirements

- Never expose secret service credentials in frontend code.
- Enforce authorization on the backend.
- Validate all user input on the server.
- Apply database access policies where supported.
- Keep audit records for sensitive administrative actions.
- Separate test data from production data.

## 10. Implementation Order

1. Identity and authentication design.
2. Account and membership model.
3. Roles and permission enforcement.
4. Personal and business profiles.
5. Demo buyer and company test scenarios.
6. Registration and account management interfaces.

## 11. Architecture Status

Status: Approved architectural direction for implementation.

No production database schema or authentication provider
is implied by this document.
