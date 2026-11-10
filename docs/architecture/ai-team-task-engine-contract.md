# WASLA AI Digital Team — Task Engine Contract

Status: approved implementation contract; not deployed.
Owner-approved operating profile: global markets, hybrid dropshipping plus selective inventory, minimum operating cost, Arabic and English. The owner remains the final authority for financial and externally visible actions.

## 1. Purpose

Turn the specialist roles shown in the owner AI console into an auditable task workflow coordinated by one AI manager. A specialist is a bounded capability profile, not a separate paid model subscription or an unrestricted autonomous account. All specialists use the configured server-side provider adapter and the same approved model budget unless the owner later approves a different policy.

## 2. First release scope

The first release is a synchronous, owner-triggered task desk. It must not require a permanently running worker, Redis, a paid queue service, or background compute. The owner creates a task from the console; the API validates and persists it; the manager dispatches one bounded specialist run; the result is saved and shown for owner review. This keeps idle infrastructure cost at zero and avoids pretending a worker is continuously active.

Initial specialist keys:
- `market_researcher`: summarize demand and competition evidence supplied through approved sources.
- `product_analyst`: normalize product identity, variants, specifications and unknowns.
- `supplier_researcher`: compare submitted/authorized supplier evidence; never claim independent verification without evidence.
- `catalogue_manager`: prepare private bilingual drafts only.
- `sales_support`: prepare policy-grounded customer reply drafts; no sending.
- `logistics_analyst`: review known destination, shipping and fulfilment evidence; no booking or tracking claims.
- `translator`: produce Arabic/English translations while preserving source meaning.
- `financial_analyst`: calculate only from supplied, traceable values; unknown costs stay unknown.
- `quality_risk_reviewer`: identify evidence gaps, prohibited/high-risk categories and compliance questions.

## 3. Persistence model

Use PostgreSQL tables created through idempotent, versioned schema migration or the repository's established safe initialization pattern:

### `platform_ai_team_tasks`
- `id` UUID primary key.
- `owner_user_id` UUID, required FK to users.
- `specialist_key` constrained to the keys above.
- `title` and `input_text` bounded non-empty text.
- `input_context` JSONB, bounded and schema-validated; do not store secrets or unnecessary customer PII.
- `status`: `queued`, `running`, `needs_owner_review`, `completed`, `failed`, `cancelled`.
- `priority` small bounded integer, default normal.
- `attempt_count`, `max_attempts`, `created_at`, `updated_at`, `started_at`, `finished_at`.
- `result_text`, `result_json` JSONB where applicable, `error_code` safe machine-readable code.
- `idempotency_key` unique per owner where supplied.

### `platform_ai_team_task_events`
Append-only event history with task ID, actor type (`owner`, `manager`, `specialist`, `system`), actor key, event type, bounded JSONB metadata, and timestamp. Do not permit browser-side edits or deletion of event history.

## 4. Lifecycle and concurrency

- Validate owner authorization and manager-enabled kill switch before create or execution.
- Task creation is owner-scoped and idempotent.
- Claim a queued task atomically in a short database transaction using row locking / conditional status update; never hold a DB transaction open while calling the AI provider.
- Mark `running` and append the start event before provider invocation.
- Enforce per-task timeout, bounded prompt/context size, attempt ceiling, and a single in-flight execution per task.
- Save the result and `needs_owner_review` (default for every specialist result) in a transaction with a completion event.
- On provider timeout/rate limit, persist a safe failure code and retry only through an explicit bounded owner action or an approved retry policy. Do not silently loop or spend unbounded tokens.
- Owner cancellation must prevent a not-yet-started task from executing. If execution is already in flight, record cancellation requested and discard any result that cannot be safely reconciled.
- A paused manager cannot create, claim or execute tasks. Read-only task history remains available to the owner.

## 5. Approval and capability boundaries

Specialists return recommendations, evidence summaries, calculations and drafts only. They do not receive write-capable tools in release one.

The following always require a separate explicit owner action and dedicated server-side permission checks: onboarding/approving a supplier, purchasing, inventory commitments, product publication, material price changes, customer message sending, order acceptance, shipment booking, payment capture, refunds, or contractual commitments. A task result is never itself an approval.

## 6. Provider and cost controls

- Reuse the existing server-side Gemini adapter; never expose provider credentials to the browser.
- One model/provider configuration for all roles; role prompts are configuration, not separate subscriptions.
- Record provider/model, prompt size, output size, duration and safe quota/error metadata, but never API keys.
- Apply owner-configurable daily task/token ceilings with conservative defaults and fail closed when limits cannot be checked.
- No paid fallback, automatic model upgrade, or background polling in release one.
- Do not claim market discovery or supplier verification unless the task includes traceable authorized source evidence.

## 7. API and owner console

Owner-only endpoints should support:
- list tasks with bounded pagination and filters;
- create a task with specialist, title, input and optional idempotency key;
- execute/claim a queued task;
- cancel a queued task;
- read a task and its append-only event history.

The bilingual owner console should show specialist, status, creation time, concise result, failure state, and review requirement. It must label the specialists as available only after their execution path is actually enabled. It must distinguish `needs_owner_review` from `completed`.

## 8. Verification gates

Before enabling this feature, tests must cover:
- non-owner access denied without DB/provider access;
- paused manager blocks task creation and execution;
- owner isolation across tasks and events;
- invalid specialist/status/input rejected;
- idempotent create and duplicate execution protection;
- atomic claim under concurrent requests;
- no DB transaction held during provider call;
- bounded timeout, attempts, context, and output;
- safe provider failure and rate-limit handling;
- result defaults to owner review;
- no supplier purchase, publish, send, payment, refund or shipping side effect;
- task history remains readable when manager is paused.

Hosted authenticated owner E2E verification and deployment are separate release gates.

## 9. Delivery sequence

1. Schema and lifecycle domain functions with unit/integration tests.
2. Owner-only task API and security tests.
3. Owner console task desk and bilingual status display.
4. Connect only the first low-risk specialists: product analyst, translator, financial analyst and quality/risk reviewer.
5. Add approved source connectors and evidence provenance before market/supplier discovery claims.
6. Consider a background worker only after real task volume justifies the extra service; retain the same database lifecycle, idempotency and owner controls.

No part of this contract means that agents, connectors, a worker, or automated sourcing are currently deployed.
