# WASLA Unified Support Center — Operating Specification

Status: implementation contract for Support Center v1  
Languages: Arabic and English  
Scope: web and mobile account holders; platform support operators; platform administrators

## Product outcome

Every support request becomes a durable, private, traceable case with a public case number, an owner, a status, a conversation timeline, and a clear next action. Support is a platform-wide service, not only a return-escalation screen.

## User experience

- A signed-in buyer, seller, store member, trader, or company member can open a case from Help & Support.
- The user selects a category and urgency, supplies a subject and description, and may attach evidence.
- The platform returns a human-readable case number in the form `WASLA-YYYY-######`.
- The user can see their own cases, status, last update, and unread reply count; open a case to read and reply.
- The user receives an in-app notification and, when configured, an email when support replies or the status changes.
- Case conversation and status history remain available after closure. Reopening is an explicit, audited action.

## Case categories

`account_access`, `payments_billing`, `orders_delivery`, `returns_refunds`, `store_seller`, `trade_business`, `affiliate_commissions`, `technical_issue`, `security_report`, `other`.

## Status lifecycle

- `open`: submitted and awaiting triage.
- `in_progress`: assigned and being handled.
- `waiting_for_user`: support needs information from the requester.
- `resolved`: support has proposed a resolution; requester may reopen within the configured reopen window.
- `closed`: terminal for ordinary replies; reopening requires an explicit supported transition.

Only authorized support operators may assign, change priority, or resolve cases. Requesters may reply to their own non-closed cases and reopen eligible resolved cases. Every transition records actor, timestamp, prior status, new status, and optional note.

## Priority and service targets

Priorities are `low`, `normal`, `high`, and `urgent`. Urgent is reserved for account compromise, credible security incidents, payment-risk situations, or platform-wide service failures. Initial operational targets (not contractual guarantees): urgent first response within 4 hours; high within 1 business day; normal within 2 business days; low within 3 business days. SLA clocks pause while waiting for the requester. Operators can override priority only with an audit reason.

## Roles and access

- Requesters can access only cases they opened or cases explicitly shared with their account.
- Support agents can access assigned cases and queues granted to their support role.
- Support leads can assign, escalate, and manage all support queues.
- Platform administrators can manage support configuration and audit records.
- Existing `platform.reports.manage` must not silently become general support access. Add dedicated permissions for queue read, case reply, assignment, status management, and reporting.
- Never expose private case details, attachment URLs, or internal notes to unrelated users or store members.

## Conversation and internal notes

Each case has an append-only event timeline. Public replies are visible to the requester and authorized agents. Internal notes are visible only to authorized support staff. A message cannot be edited in place; corrections are added as a new event. Keep status changes and assignments in the same timeline.

## Attachments and privacy

Attachments must be uploaded through a controlled flow, validated by size and allowed file type, stored privately, and served only after authorization with short-lived access. Do not accept arbitrary public URLs as evidence. Do not store payment card numbers, passwords, authentication codes, or unnecessary identity documents in support messages. Malware scanning is required before attachments are made available to agents. Retention and deletion follow the platform privacy policy and legal holds.

## Notifications

Use the existing notification center and push outbox for in-app/push delivery. Email delivery should use the platform's configured transactional email provider and an idempotent outbox. Notification payloads must not include sensitive case text; link to the authenticated case view instead. Delivery failures must be retryable and observable.

## AI triage and assistance

AI may classify category, summarize the case, suggest priority, detect duplicate cases, translate Arabic/English, retrieve approved help-center guidance, and draft a suggested response. AI suggestions are clearly marked and reviewable by staff. AI must not autonomously close cases, promise refunds or compensation, change balances/orders, make legal determinations, disclose another user's information, or send a sensitive/high-impact response without human approval. Security, payment, identity, and legal-rights cases are escalated to a human immediately.

## Reporting and operational controls

Support leads need filters for status, category, priority, assignee, age, and SLA risk; queue counts; first-response and resolution times; reopen rate; and export with permission. Internal notes and audit history are excluded from requester views and ordinary exports.

## Acceptance criteria

1. A verified signed-in user can create a case and receives a unique case number.
2. The user can list and open only their own cases.
3. A user and authorized agent can exchange public replies with strict access checks.
4. Internal notes never appear in requester APIs or notifications.
5. Status and assignment transitions are validated and audited.
6. Notifications are idempotent and do not leak case contents.
7. Dedicated support permissions are enforced server-side.
8. Arabic and English UI labels and timestamps are supported.
9. Automated tests cover authorization boundaries, lifecycle transitions, duplicate submissions, notification failures, and sensitive-case escalation.
10. AI is assistive by default and never takes irreversible customer or financial actions.
