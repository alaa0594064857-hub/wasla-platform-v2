# WASLA V2 — Account Deletion and Privacy Release Review

Date: 2026-11-11
Status: Internal engineering review; not a public privacy notice and not a claim of legal compliance.

## Executive decision

Do not enable direct hard deletion of a `users` row yet. The current data model contains both cascading and restrictive user references. A naive delete can either destroy shared commercial/conversation records or fail partway because of restrictive foreign keys. Deleting the identity without first resolving business ownership can also leave an account without an active owner.

The release must provide a discoverable in-app deletion request and a public web deletion route, then complete a verified, auditable deletion/anonymization workflow with explicit handling for records that must be retained. A request endpoint alone is not proof that deletion is complete.

## Verified implementation findings

- Better Auth is configured with the Expo plugin, email/password authentication, required email verification, and password-reset email handling. The inspected configuration does not enable a user-deletion plugin or define an application deletion workflow.
- The personal `users` record contains name, email, verification state, profile image, status, locale and registration type. `profiles` contains display name, avatar reference, bio, website and social links.
- The user status enum already includes `deactivated`, but deactivation alone is not deletion or anonymization.
- The schema includes cascading user references for authentication identities/sessions/accounts, profiles, memberships, notifications and push devices. Other modules create additional user-linked records.
- The source search found restrictive user references in commercial workflows, including trade-deal creators, trade-opportunity creators, commission records, official-store event actors and return escalations. These references can block a hard delete and may be needed for an audit trail.
- Account membership is how account ownership is represented. Removing a user without a verified ownership-transfer process can leave an account without an active owner.
- Message conversations and product inquiries use participant/sender references with cascade behavior in the inspected modules. Deleting a user may therefore affect other participants' records, not just the requesting user's profile.
- The settings page currently describes advanced security/privacy controls as future work. No public privacy policy page or complete account deletion flow was found in the inspected source paths.

## Required deletion workflow

1. **Request and verify intent**
   - Require an authenticated session and a deliberate confirmation step; use recent re-authentication or an email confirmation for a sensitive irreversible action.
   - Explain consequences, including loss of access to personal data and any business spaces that cannot be transferred.
   - Create an idempotent deletion request with status, timestamps and a non-sensitive audit reference. Do not place credentials, tokens or unnecessary personal data in the request log.
2. **Resolve ownership and legal/operational holds**
   - Identify every active business account and store owned or administered by the user.
   - Require transfer to another verified active owner before proceeding where the account must remain operational; otherwise route account closure through a separately authorized workflow.
   - Identify open orders, returns, disputes, invoices, trade agreements, commissions and statutory/audit retention obligations. Do not silently erase these records.
3. **Revoke access**
   - Disable new authentication and revoke all sessions, linked credentials and push-device registrations as part of one controlled operation.
   - Ensure pending requests cannot be used to regain access.
4. **Erase or anonymize by data class**
   - Delete or irreversibly anonymize personal profile fields, avatar references, social links and non-required personal content.
   - Remove data that exists solely for the deleted user's private convenience (for example personal preferences, push tokens and eligible AI task/audit content).
   - Preserve only records with a documented legal or legitimate operational retention basis; minimize or pseudonymize identity fields where possible and restrict access.
   - Do not cascade-delete shared messages, inquiries, orders, reviews or business records without an explicit per-table impact decision.
5. **Verify completion**
   - Run a post-deletion inventory check across all user-linked tables and storage objects.
   - Record completion time and categories processed, without copying erased personal data into the audit record.
   - Notify the requester of completion or explain any retained categories and applicable retention basis.
6. **Web and app access**
   - Provide a permanent public web page describing how to request deletion, reachable without signing in.
   - Provide an in-app path from account/settings to submit the same request.
   - Keep the process bilingual (Arabic and English) and make the route discoverable in the Google Play Data safety / account deletion declarations.

## Source-level foreign-key inventory (preliminary)

Review date: 2026-11-11. This inventory records source-code definitions found by searching the repository for `REFERENCES users(id)`. It is a static source scan, not a live database catalog export. Several modules create tables at runtime, and migrations or deployed constraints may differ from the current source. Do not treat this list as exhaustive or use it to authorize deletion.

### Cascading references observed

| Source | User-linked column(s) | Declared action | Initial impact concern |
|---|---|---|---|
| `apps/api/src/notifications.mts` | `notifications.user_id` | CASCADE | Removes a user's notifications; confirm outbox/push references and retention needs. |
| `apps/api/src/network.mts` | `network_friendships.requester_user_id`, `addressee_user_id` | CASCADE | Deletes relationship records involving the user. |
| `apps/api/src/product-inquiries.mts` | `product_inquiries.sender_user_id`, `recipient_user_id`; `product_inquiry_replies.sender_user_id` | CASCADE | Can remove inquiry threads/replies relevant to another party; must preserve or anonymize shared correspondence deliberately. |
| `apps/api/src/messages.mts` | `message_conversations.participant_low`, `participant_high` | CASCADE | Conversation deletion can affect the other participant; inspect message/read-receipt child tables before any action. |
| `apps/api/src/official-store-pricing.mts` | pricing quote `created_by` | CASCADE | Likely transient quote data, but verify references and retention before classifying as disposable. |
| `apps/api/src/official-store-data-sources.mts` | `official_store_data_sources.created_by` | CASCADE | Owner-created sourcing configuration may be operationally relevant. |
| `apps/api/src/platform-ai-team-tasks.mts` | `platform_ai_team_tasks.owner_user_id` | CASCADE | Removes owner task history; assess audit and user-requested export/retention. |
| `apps/api/src/platform-ai-assistant.mts` | `platform_ai_assistant_audit.owner_user_id` | CASCADE | AI audit prompts/outputs may contain personal or business information. |
| `apps/api/src/official-store-opportunities.mts` | `official_store_product_opportunities.owner_user_id` | CASCADE | Owner-created opportunities may be shared/operational records. |
| `apps/api/src/official-store-candidate-enrichment.mts` | `official_store_candidate_enrichments.owner_user_id` | CASCADE | Enrichment is tied to a candidate; inspect whether candidate data is shared or retained. |

### Restrictive references observed

| Source | User-linked column(s) | Declared action | Initial impact concern |
|---|---|---|---|
| `apps/api/src/official-store.mts` | `official_store_messages.sender_user_id`; `official_store_inquiries.customer_user_id` | RESTRICT | Human sender/customer history can block hard deletion and may need pseudonymization. |
| `apps/api/src/trade.mts` and `apps/api/drizzle/0007_trade_deals.sql` | `trade_deals.created_by_user_id` | RESTRICT | Commercial deal/audit authorship; retain or pseudonymize under an approved policy. |
| `apps/api/src/trade-opportunities.mts` | `trade_opportunities.created_by_user_id` | RESTRICT | Published buyer/supplier opportunity authorship. |
| `apps/api/src/database.ts` | subscription `customer_user_id`, `billing_contact_user_id` | RESTRICT | Billing and subscription history; requires retention and billing-owner handling. |
| `apps/api/src/trade-brokerage-commission-ledger.mts` | `trade_brokerage_commission_entries.created_by_user_id` | RESTRICT | Commission ledger authorship and financial audit trail. |
| `apps/api/src/trade-brokerage-commission-invoices.mts` | `trade_brokerage_commission_invoices.created_by_user_id` | RESTRICT | Invoice authorship and financial records. |
| `apps/api/src/member-store-return-policy-schema.mts` | return-policy `created_by` | RESTRICT | Published policy/version authorship; retain auditable history. |

### Set-null references observed

| Source | User-linked column(s) | Declared action | Initial impact concern |
|---|---|---|---|
| `apps/api/src/platform-ai-controls.mts` | `updated_by_user_id` | SET NULL | Preserves singleton control state while losing actor link; retain a minimized audit event if required. |
| `apps/api/src/trade-brokerage-agreements.mts` | `buyer_accepted_by`, `supplier_accepted_by` | SET NULL | Agreement acceptance history must remain intelligible after actor anonymization. |
| `apps/api/src/trade-brokerage-commission-ledger.mts` | commission event `actor_user_id` | SET NULL | Event history survives but actor attribution is lost. |
| `apps/api/src/trade-brokerage-commission-invoices.mts` | invoice event `actor_user_id` | SET NULL | Invoice event history survives but actor attribution is lost. |

### Required completion of the inventory

- Search all source definitions and migrations for alternate quoting, schema-builder declarations, indirect references, and foreign keys not written as the exact string above.
- Inspect every child table of the listed tables, including message bodies, read receipts, attachments, push outbox rows, media/object references, and audit/event records.
- In a controlled read-only database session, query PostgreSQL catalogs (`pg_constraint`, `pg_class`, `pg_namespace`, `pg_attribute`) for every actual foreign key referencing the deployed `users` table. Include constraint name, source schema/table/column, referenced column, and `confdeltype`; do not run DELETE/UPDATE or modify production.
- Compare the live catalog with this source inventory and all Drizzle migrations; record discrepancies and dynamically created tables.
- Classify each table/column with an approved data owner, impact on other users, legal/operational retention basis, anonymization strategy, and verification query before implementing any deletion worker.

## Implementation gates before coding the destructive operation

- Inventory every database foreign key referencing `users`, including dynamically bootstrapped tables and deployed database constraints, not only Drizzle's static schema.
- Classify each reference as cascade, set-null, restrict, or application-managed; document the effect on other users and shared business records.
- Define owner-transfer and business-account closure behavior.
- Define retention periods and legal holds with qualified legal review for the actual operating entity and jurisdictions.
- Implement transaction boundaries, idempotency, authorization, re-authentication, rate limits, audit minimization and regression tests.
- Test with disposable fixtures covering a personal-only buyer, a user in multiple business accounts, the sole owner of an account, a store manager, a user with open orders/returns, and a user with trade/invoice history.
- Do not test destructive behavior against production customer data.

## Public privacy notice — information still required

This file is an internal checklist, not text to publish as WASLA's final Privacy Policy. A truthful public notice must be reviewed against the real operating setup and should identify:

- The legal controller/operator name, registered address and privacy contact email.
- The applicable jurisdiction(s), legal bases and contact route for privacy requests.
- Exact categories collected: identity/contact data, account/business details, profile/media, messages/inquiries, orders/returns, device/push identifiers, usage/security logs and any optional AI prompts/outputs.
- Purposes and retention periods for each category.
- Actual processors and service roles (for example hosting/database, transactional email, AI provider, mobile push/build services), including the services truly enabled in production.
- International transfers, subprocessors, security controls and user rights.
- The deletion request method, expected handling process and categories retained for legal/operational reasons.
- Children's eligibility, cookies/analytics if used, and policy update/contact procedures.

Do not invent a legal entity, contact address, retention period, processor activation, or jurisdiction. Do not publish a placeholder policy as if it were complete.

## Release status

Account deletion: **not implemented**.
Public privacy policy: **not ready for publication**.
Google Play account deletion and privacy declarations: **release blockers**.
No production data, database schema, secrets, paid services or Render deployment were changed by this review.
