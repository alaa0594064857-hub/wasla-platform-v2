# WASLA AI — Safe Operations Foundation

Updated: 2026-11-06

## Purpose

WASLA AI is an operations assistant for the marketplace, not an owner of goods, a payment operator, or an autonomous decision-maker. Its first useful release should reduce manual work while keeping commercial authority with the buyer, supplier, and authorized platform staff.

## Non-negotiable operating rules

1. **No central stock.** AI may read supplier-owned listings and supplier-submitted offers, but it must never create, reserve, adjust, or claim platform-owned inventory.
2. **Supplier confirmation is authoritative.** AI can identify a likely match or request confirmation. Only an authorized supplier member can confirm availability, price, lead time, or fulfilment.
3. **Buyer approval is required.** AI may summarize and compare offers, but it cannot accept an offer, create a binding deal, change agreed terms, confirm delivery, or spend money for a buyer.
4. **No financial authority.** AI cannot collect or hold funds, initiate payments, issue refunds, pay suppliers, promise escrow, or mark an order paid.
5. **No autonomous external commitments.** AI cannot send binding quotations, promise delivery dates, or change supplier data. Drafts must be reviewed by an authorized person.
6. **Least privilege.** Every action is scoped to the signed-in user and active account membership. Platform-wide data is not exposed to ordinary buyers or suppliers.
7. **Auditable actions.** Persist actor, action, target, timestamp, input summary, result, and whether a human approved it. Keep secrets and unnecessary personal data out of prompts and logs.
8. **Explainable recommendations.** Show why a supplier or offer was ranked: destination-country match, quantity fit, currency, supplier-confirmed availability, quote validity, price, and lead time. Never invent missing data.
9. **Graceful fallback.** If an AI provider is unavailable, expensive, or unconfigured, core sourcing, messaging, and Trade flows continue without AI.
10. **Human escalation.** Disputes, suspicious activity, account suspensions, safety concerns, legal questions, and unclear commercial terms must be routed to an authorized human.

## Delivery sequence

### Phase 1 — deterministic sourcing intelligence (no paid model dependency)

- Build a transparent scoring/ranking service over existing buyer-owned sourcing requests and supplier-authorized offers.
- Separate destination-country suppliers from cross-border suppliers; local matches appear first unless the buyer explicitly changes that preference.
- Exclude inactive suppliers, unconfirmed/unavailable offers, expired quotes, insufficient quantities, and currency mismatches where the request requires a currency.
- Return a structured explanation for each match and missing information that prevents a reliable comparison.
- Add unit tests for ranking, tie-breaking, missing values, and the rule that a ranking never changes offer status or inventory.
- Keep the buyer's final offer selection as an explicit authenticated action.

### Phase 2 — AI-assisted operations (provider-neutral)

- Add a provider adapter only after a provider, budget, privacy terms, data-retention settings, and secret-management plan are approved.
- Use the model for natural-language request extraction, translation, summaries, and draft replies; validate all extracted fields with the same domain schemas as manual input.
- Never pass authentication secrets, payment credentials, private delivery details, or unrelated account data to a model.
- Treat model output and supplier-provided text as untrusted input. Do not execute instructions embedded in listings, messages, uploaded documents, or model output.
- Add per-user/account rate limits, cost ceilings, timeouts, usage metering, and an immediate disable switch.

### Phase 3 — platform operations assistant

- Provide a restricted admin workspace for queue summaries, health indicators, policy checklists, and suggested next actions.
- Separate read-only recommendations from privileged actions.
- Require explicit admin confirmation for suspensions, refunds, data exports, account changes, and any other sensitive operation.
- Record every admin action in the audit trail and enforce role permissions server-side.

## Initial API contract (planned, not yet implemented)

- `POST /api/ai/sourcing/matches`: authenticated buyer requests a ranked comparison for one of their own sourcing requests.
- `POST /api/ai/drafts/translate`: authenticated user requests a translation draft for text they are authorized to access.
- `POST /api/ai/drafts/reply`: creates a non-sending draft; a user must review and send it through the normal messaging flow.
- `GET /api/admin/operations/summary`: restricted to explicitly permissioned platform administrators; read-only.
- No endpoint may mutate offers, inventory, orders, Trade agreements, payment status, or account status on AI authority alone.

## Release gates

- Domain-owner review of scoring and local-versus-cross-border rules.
- Automated authorization and abuse tests, including attempts to access another buyer's request or another supplier's private information.
- Prompt-injection and untrusted-content tests before connecting a model provider.
- Privacy review, provider terms review, budget cap, rate limits, audit logging, and disable switch before enabling generative AI.
- No production deployment or provider spend without explicit release approval.
