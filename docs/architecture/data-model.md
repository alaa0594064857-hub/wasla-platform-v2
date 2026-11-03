# WASLA V2 — Data Model Architecture

## 1. Purpose

Define the initial data structure and relationships
for WASLA V2.

This document describes the logical database model.
It does not create database tables or SQL migrations.

## 2. Data Principles

- Use one unified identity per person.
- Separate users from business accounts.
- Support multiple business memberships per user.
- Enforce data ownership and account isolation.
- Use stable unique identifiers.
- Store timestamps consistently in UTC.
- Avoid duplicating authoritative data.
- Keep sensitive data access restricted.

## 3. Identity Entities

### users

Represents the platform user.

Main attributes:
- id
- status
- preferred_locale
- created_at
- updated_at

### auth_identities

Connects authentication credentials or providers
to a user.

Main attributes:
- id
- user_id
- provider
- provider_subject
- email
- email_verified_at
- created_at

A user may have multiple authentication identities.

### profiles

Stores personal profile information.

Main attributes:
- user_id
- display_name
- avatar_reference
- created_at
- updated_at

Authentication credentials must not be stored
inside personal profile records.

## 4. Business Entities

### accounts

Represents an independent business organization.

Main attributes:
- id
- account_type
- legal_name
- display_name
- status
- country_code
- created_at
- updated_at

### business_profiles

Stores public and commercial information
for business accounts.

Main attributes:
- account_id
- description
- website
- contact_information
- verification_status
- created_at
- updated_at

Private verification documents must be stored
separately with restricted access.

## 5. Membership Entities

### account_members

Connects users to business accounts.

Main attributes:
- id
- account_id
- user_id
- role_id
- status
- invited_by
- joined_at
- created_at
- updated_at

A user may have memberships in multiple accounts.

A membership must be unique for each user
and account combination.

### stores

Represents an independent store.

Main attributes:
- id
- account_id
- name
- slug
- status
- created_at
- updated_at

### store_members

Connects users to stores.

Main attributes:
- id
- store_id
- user_id
- role_id
- status
- created_at
- updated_at

Store membership must not automatically
grant access to unrelated stores.

## 6. Roles and Permissions

### roles

Stores role definitions.

Main attributes:
- id
- name
- scope_type
- description
- is_system_role

### permissions

Stores available system permissions.

Main attributes:
- id
- permission_key
- description

### role_permissions

Connects roles to permissions.

Main attributes:
- role_id
- permission_id

Role assignments must be validated
and enforced by the backend.

Platform-level role assignments require
a separate protected administrative process.

## 7. Commerce Entities

Future commerce entities:

- products
- product_categories
- inventory
- orders
- order_items
- payments
- shipments
- returns

Each entity must define its ownership,
visibility, and access scope.

Commerce tables will be designed in the
commerce implementation phase.

## 8. Communication Entities

Future communication entities:

- conversations
- conversation_members
- messages
- message_attachments
- notifications

Messages and attachments must enforce
participant access and secure file permissions.

## 9. Audit Entities

### audit_logs

Records sensitive system operations.

Main attributes:
- id
- actor_user_id
- action
- resource_type
- resource_id
- account_id
- metadata
- created_at

Audit records must not expose passwords,
session tokens, or other authentication secrets.

## 10. Data Relationships

Initial relationships:

- users have one personal profile.
- users may have multiple authentication identities.
- users may belong to multiple accounts.
- accounts may have multiple members.
- accounts may own multiple stores.
- stores may have multiple members.
- roles may contain multiple permissions.
- permissions may belong to multiple roles.
- sensitive operations may produce audit records.

## 11. Data Integrity

The database design must enforce:

- Primary keys.
- Foreign key relationships.
- Unique identity constraints.
- Unique account membership constraints.
- Required fields.
- Valid status values.
- Appropriate indexes.
- Safe deletion and retention rules.

Deleting a user or account must not silently
destroy legally or operationally required records.

## 12. Demo Data Isolation

Demo buyer and demo company records must be
clearly identifiable as test data.

Demo records must:
- Use fictional information.
- Never contain real credentials.
- Be separated from production data.
- Be removable without affecting real users.
- Follow the same authorization rules as production.

## 13. Localization

- Store the user's preferred locale.
- Initially support ar and en.
- Store language-neutral business data where possible.
- Keep translated content separate when needed.
- Do not assume every business has only one language.

## 14. Deferred Decisions

The following require separate evaluation:

- Database hosting provider.
- Authentication provider.
- Database migration tooling.
- File storage provider.
- Payment and shipping integrations.
- Data retention periods.
- Multi-region deployment strategy.

## 15. Implementation Order

1. Finalize the logical data model.
2. Select database and migration tooling.
3. Create identity and account migrations.
4. Add membership and permission structures.
5. Add database access policies.
6. Test isolation and integrity.
7. Introduce demo records.

## 16. Status

Status: Logical data model defined.

No production database or migrations
are created by this document.
