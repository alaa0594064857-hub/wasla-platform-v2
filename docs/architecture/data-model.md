# WASLA V2 — Data Model Architecture

## 1. Purpose

Define the logical database structure for WASLA V2.

This document describes entities, relationships,
constraints, and ownership rules.

It does not create database tables or migrations.

## 2. Core Principles

- One unified identity per person.
- Separate users from business accounts.
- Separate business accounts from stores.
- Support multiple memberships per user.
- Enforce strict resource ownership and isolation.
- Store timestamps in UTC.
- Use stable unique identifiers.
- Keep authentication secrets outside application profiles.
- Enforce authorization on the backend.

## 3. Identity Entities

### users

Represents one person on the platform.

Attributes:
- id
- status
- preferred_locale
- created_at
- updated_at

A user may act as a buyer and participate
in multiple business accounts.

### auth_identities

Connects authentication provider identities
to a unified WASLA user.

Attributes:
- id
- user_id
- provider
- provider_subject
- email
- email_verified_at
- created_at

Constraints:
- A provider subject must be unique
  within its provider.
- One user may have multiple identities.
- Authentication secrets must not be stored here.

### profiles

Stores personal profile information.

Attributes:
- user_id
- display_name
- avatar_reference
- created_at
- updated_at

Each user has one personal profile.

## 4. Business Entities

### accounts

Represents an independent business organization.

Attributes:
- id
- account_type
- legal_name
- display_name
- status
- country_code
- created_at
- updated_at

Initial account categories:
- company
- supplier
- manufacturer
- trader
- brand

Buyer is a personal capability,
not a business account category.

### business_profiles

Stores public and commercial information
for business accounts.

Attributes:
- account_id
- description
- website
- contact_information
- verification_status
- created_at
- updated_at

Private verification documents must use
separate restricted storage.

## 5. Account Memberships

### account_members

Connects users to business accounts.

Attributes:
- id
- account_id
- user_id
- role_id
- status
- invited_by
- joined_at
- created_at
- updated_at

Constraints:
- Unique user and account combination.
- Role scope must be account.
- Suspended memberships grant no access.

A user may belong to multiple accounts.

## 6. Store Entities

### stores

Represents an independent store owned
by a business account.

Attributes:
- id
- account_id
- name
- slug
- status
- created_at
- updated_at

Constraints:
- Every store belongs to one account.
- Store ownership must be explicit.
- Store slug uniqueness must be defined
  within its intended public namespace.

One account may own multiple stores.

### store_members

Connects users to individual stores.

Attributes:
- id
- store_id
- user_id
- role_id
- status
- created_at
- updated_at

Constraints:
- Unique user and store combination.
- Role scope must be store.
- Membership grants access only to its store.

Account membership does not automatically
grant access to every store.

## 7. Roles and Permissions

### roles

Stores reusable role definitions.

Attributes:
- id
- name
- scope_type
- description
- is_system_role
- created_at
- updated_at

Allowed scope types:
- personal
- platform
- account
- store

### permissions

Stores available system permissions.

Attributes:
- id
- permission_key
- description
- scope_type

Each permission must have a defined scope.

### role_permissions

Connects roles to permissions.

Attributes:
- role_id
- permission_id

Constraints:
- Unique role and permission combination.
- Role and permission scopes must be compatible.

## 8. Platform Role Assignments

### platform_role_assignments

Connects users to platform-level roles.

Attributes:
- id
- user_id
- role_id
- status
- assigned_by
- assigned_at
- created_at

Rules:
- Assigned roles must have platform scope.
- Platform assignments are separate
  from account and store memberships.
- Assignment requires a protected process.
- Every assignment and revocation must be audited.
- Business account owners cannot assign
  platform administrator privileges.

## 9. Personal Capabilities

Buyer and individual-user capabilities
belong to the unified user identity.

They must not be represented as business accounts.

Personal capabilities must not grant access
to unrelated business or platform resources.

## 10. Authentication Sessions

The authentication provider manages
authentication sessions initially.

WASLA does not duplicate provider session secrets.

If required later, non-secret session metadata
may be stored separately.

No local session table is required
for the initial implementation.

## 11. Audit Entities

### audit_logs

Records sensitive system operations.

Attributes:
- id
- actor_user_id
- action
- resource_type
- resource_id
- account_id
- metadata
- created_at

Audit records must not expose:
- Passwords
- Session tokens
- Authentication secrets
- Private credentials

Platform role changes, membership changes,
and sensitive administrative operations
must create audit records.

## 12. Commerce Entities

Future entities:

- products
- product_categories
- inventory
- orders
- order_items
- payments
- shipments
- returns

Each entity must define:
- Ownership
- Visibility
- Authorization scope
- Lifecycle status
- Audit requirements

Commerce schema will be designed
in its implementation phase.

## 13. Communication Entities

Future entities:

- conversations
- conversation_members
- messages
- message_attachments
- notifications

Messages and attachments must enforce
participant access and secure file permissions.

## 14. Data Relationships

Initial relationships:

- One user has one personal profile.
- One user may have multiple auth identities.
- One user may belong to multiple accounts.
- One account may have multiple members.
- One account may own multiple stores.
- One store may have multiple members.
- One role may contain multiple permissions.
- One permission may belong to multiple roles.
- One user may have multiple platform role assignments.
- Sensitive operations may produce audit records.

## 15. Data Integrity and Security

The database must enforce:

- Primary keys.
- Foreign keys.
- Unique identity constraints.
- Unique membership constraints.
- Valid role scope assignments.
- Required fields.
- Valid status values.
- Appropriate indexes.
- Ownership constraints.
- Safe deletion and retention rules.

Database policies must reinforce
backend authorization.

Deleting users or accounts must not silently
destroy legally or operationally required records.

## 16. Demo Data Isolation

Demo buyer and demo company records
must be clearly identifiable as test data.

Demo records must:
- Use fictional information.
- Never contain real credentials.
- Be isolated from production data.
- Be removable without affecting real users.
- Follow the same authorization rules as production.

## 17. Localization

- Store each user's preferred locale.
- Initially support Arabic and English.
- Store language-neutral business data where possible.
- Keep translated content separate when needed.
- Do not assume every business has only one language.

## 18. Database Technology

Database engine: PostgreSQL.

Recommended access layer: Drizzle ORM.

Recommended migration tool: Drizzle Kit.

Hosting provider remains undecided.

Database credentials must remain server-side.

## 19. Deferred Entities and Decisions

Future evaluation:
- Authentication provider.
- Database hosting provider.
- File storage provider.
- Payment integrations.
- Shipping integrations.
- Data retention policies.
- Multi-region deployment.

## 20. Implementation Order

1. Identity and authentication integration.
2. Personal profiles and identities.
3. Business accounts.
4. Roles and permissions.
5. Account memberships.
6. Platform role assignments.
7. Stores and store memberships.
8. Database access policies.
9. Integrity and isolation tests.
10. Demo buyer and company records.

## 21. Status

Status: Logical data model aligned
with the architecture decisions.

No production database or migrations
are created by this document.
