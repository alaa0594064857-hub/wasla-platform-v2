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
- Account membership is how account ownership is represented. Removing a user without a verified ownership-transfer process can leave a business account without an active owner.
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
