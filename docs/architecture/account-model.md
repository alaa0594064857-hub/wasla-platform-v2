# WASLA V2 — Account Architecture

## 1. Purpose

Define the unified identity and business account
architecture for the WASLA platform.

This document must be read together with:
- architecture-decisions.md
- authentication-and-sessions.md
- authorization-model.md
- data-model.md

## 2. Core Principles

- One person has one unified user identity.
- A user may have multiple roles.
- A user may belong to multiple business accounts.
- A user may manage multiple stores.
- Business accounts are separate from personal identities.
- Stores are separate entities owned by business accounts.
- Permissions are evaluated within the correct scope.
- Backend authorization is mandatory.
- Arabic and English are supported from the foundation.

## 3. User Identity

A user represents one person on the platform.

A user has:
- Unique ID
- Authentication identities
- Personal profile
- Preferred locale
- Account status
- Creation and update timestamps

A user may act as a buyer and may also belong
to multiple business accounts.

Separate login identities must not be required
for different business activities.

## 4. Business Accounts

An account represents an independent
business organization.

Initial account categories include:
- Company
- Supplier
- Manufacturer
- Trader
- Brand

An account has:
- Unique ID
- Account category
- Legal name
- Display name
- Status
- Country
- Creation and update timestamps

Account categories describe the organization.
They do not represent user roles.

## 5. Stores

A store is an independent commercial entity
owned by a business account.

Rules:
- One account may own multiple stores.
- Every store belongs to an owning account.
- A store has its own status and identity.
- Store membership is managed separately.
- Store access must be restricted to authorized users.

A store is not a separate user identity
or an account category in the initial model.

## 6. Memberships

Memberships connect users to business resources.

### Account Membership

Connects a user to a business account.

Each membership contains:
- User ID
- Account ID
- Assigned account role
- Membership status
- Inviting user
- Creation and update timestamps

A user may belong to multiple accounts.

A user-account membership must be unique.

### Store Membership

Connects a user to an individual store.

Each membership contains:
- User ID
- Store ID
- Assigned store role
- Membership status
- Creation and update timestamps

A user-store membership must be unique.

Membership in one store does not automatically
grant access to another store.

## 7. Roles and Authorization Scopes

WASLA uses four authorization scopes:

- Personal
- Platform
- Account
- Store

Roles must be evaluated only within
their assigned scope.

### Personal Capabilities

Examples:
- Buyer
- Individual user

### Platform Roles

Examples:
- Platform owner
- Platform administrator
- Support administrator

### Account Roles

Examples:
- Account owner
- Account administrator
- Account manager
- Account employee
- Account viewer

### Store Roles

Examples:
- Store owner
- Store administrator
- Store manager
- Store employee

Platform roles must remain separate
from business account and store roles.

A business account owner is not automatically
a platform administrator.

## 8. Authorization Rules

- The backend is the final authority.
- Every protected operation requires authentication.
- User status must be checked.
- Resource scope must be identified.
- Active membership must be verified when required.
- Role scope must match the resource scope.
- Permissions must be checked before access.
- Access must be denied by default.
- Sensitive operations must be audited.

Frontend permission checks are not security controls.

## 9. Authentication and Sessions

Authentication identifies the user.

Authorization determines what the user can do.

The authentication provider manages sessions initially.

WASLA must not duplicate provider session secrets
in its own database.

Provider selection remains a separate decision.

## 10. Demo and Test Accounts

Initial demo scenarios:

### Demo Buyer

- Browse published products.
- View business profiles.
- Create test orders when order functionality exists.

### Demo Company

- Maintain a business profile.
- Publish test products after approval.
- Receive inquiries.
- Manage authorized company members.
- Own and manage test stores.

Demo data must:
- Use fictional information.
- Remain separate from production data.
- Follow the same authorization rules.
- Never contain real customer credentials.

## 11. Security Requirements

- Never expose secret service credentials in frontend code.
- Enforce authorization on the backend.
- Validate user input on the server.
- Apply database access policies where supported.
- Audit sensitive administrative actions.
- Enforce account and store isolation.
- Protect private business verification documents.

## 12. Localization

- Initial supported locales: Arabic and English.
- Arabic uses RTL direction.
- English uses LTR direction.
- User locale preference is stored independently.
- Translation content remains separate from business logic.

## 13. Implementation Order

1. Identity and authentication.
2. Business account model.
3. Account memberships.
4. Store ownership and memberships.
5. Roles and permission enforcement.
6. Personal and business profiles.
7. Demo buyer and company scenarios.
8. Registration and account management interfaces.

## 14. Architecture Status

Status: Updated to align with architecture decisions.

No production database schema,
authentication provider, or live service
is created by this document.
