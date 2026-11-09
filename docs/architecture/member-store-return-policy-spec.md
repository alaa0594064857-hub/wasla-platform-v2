# Member-store return policy — implementation specification

Status: approved engineering scope for the next implementation slice
Branch baseline: member-store return workflow PR #49 head
Date: 2026-11-09

## Product rules

- Each active member store may publish its own return/exchange policy.
- A policy is bilingual (Arabic and English) and includes: whether returns are accepted, whether exchanges are accepted, the store-configured request window in calendar days, eligible item conditions, exclusions, buyer instructions, and a contact route.
- The UI must clearly say that store policy does not remove any mandatory rights under applicable law. Do not hardcode one universal statutory deadline or imply WASLA has determined which country's law applies.
- A store with no published policy must show a neutral “contact the seller / policy not provided” disclosure. Do not silently assume “no returns”.
- Policy edits apply prospectively only. Every order stores an immutable policy snapshot (including a clear “not provided” snapshot) so later edits cannot rewrite the disclosure shown for an existing order.
- A buyer may submit a return/exchange request only if the order is shipped or completed, the requested action is enabled by the snapshot, and the request is within the configured store window. A legally required exception must not be blocked solely by the configured window; provide a documented support escalation route rather than pretending the platform can decide legal entitlement.
- Merchant approval/rejection remains an operational decision. No refund, payment reversal, stock adjustment, replacement shipment, carrier action, or supplier purchase is triggered by this workflow.

## Data model

The current implementation stores the active published JSON policy and version pointer on `stores` (`return_policy`, `return_policy_version`, `return_policy_published_at`) and keeps immutable version records in `member_store_return_policy_versions` with `draft`, `published`, and `withdrawn` states. Do not create a second competing policy table without an explicit migration decision.

Add immutable policy snapshot columns or a normalized snapshot table associated with each member-store order. Snapshot the exact published values at order creation, not when the buyer later opens the order page. Existing orders receive an explicit policy_not_provided snapshot; do not invent historical policy content.

## API and authorization

- Public product/store API returns only the currently published policy fields intended for buyer disclosure.
- Store owner/team API supports read, create, update, publish and unpublish; require existing store-management permissions and verify membership against the store ID.
- Validate bilingual text lengths, boolean values, day range, and publication state server-side.
- Use transactions for policy writes and append audit-log events for create/update/publish/unpublish. Never expose private draft text publicly.
- Return request submission checks the order's immutable snapshot and resolution-specific enablement. Preserve a support escalation path for exceptional/legal claims. Buyers can create one support escalation per return request for legal-rights review, merchant nonresponse, or another dispute; platform support can acknowledge or close the support record with a note. This is not a legal determination, refund, or override of merchant decisions.
- Do not accept a client-supplied store ID as proof of ownership; derive store identity from the authenticated order/store relationship.

## Web UI

- Add a bilingual policy editor in the member-store owner workspace.
- Add a buyer-visible policy disclosure on public store pages and the buyer order page, including a support escalation action on existing return requests.
- Show the order-time snapshot on the order detail page, including when the store later changes its policy.
- Explain that a request is not a refund and does not guarantee approval or shipment of a replacement.
- Keep Arabic/English labels, validation errors, and empty states aligned with the existing locale handling.

## Support escalation workflow

- `POST /api/stores/:slug/orders/:orderId/return/escalation` creates a buyer-owned support record linked to the existing return request.
- `GET /api/platform/store-return-escalations` lists open/acknowledged support records for users with `platform.reports.manage`.
- `PATCH /api/platform/store-return-escalations/:id` records support acknowledgement or closure with an internal note and audit event.
- Escalation records do not approve/reject returns, determine legal entitlement, issue refunds, or trigger fulfillment.

## Required verification before merge

- API unit tests for permissions, invalid ranges, unpublished policy privacy, and bilingual validation.
- Database integration tests for idempotent bootstrap, snapshot immutability, and prospective-only policy edits.
- Two-account end-to-end coverage: store owner publishes policy; buyer sees disclosure; buyer submits eligible request; buyer is blocked when disabled/expired; merchant responds; audit events are present.
- Run full repository CI (shared-package tests/typecheck, migrations, authorization seeding, DB integration tests, API tests/typecheck/build, and web production build) on the final stacked PR head.
- Do not merge the stacked return-policy PR until its parent PRs #46–#48 are merged in order and the full checks pass.
- Do not deploy or mutate production data as part of this implementation slice.