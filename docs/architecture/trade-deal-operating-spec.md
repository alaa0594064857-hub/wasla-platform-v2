# WASLA Trade — Operating Specification

Status: approved implementation baseline for the V2 trade-deal foundation  
Date: 2026-11-07

## Purpose

WASLA Trade manages commercial deal proposals and negotiation between two active WASLA business accounts. It is a shared workspace for terms, line items, revisions, decisions and an immutable activity history.

## Explicit boundaries

- A trade deal is not a payment, escrow, invoice, purchase order, shipment booking or legally verified electronic signature.
- WASLA does not hold funds, split payments, charge member-sale commissions, or autonomously accept a deal.
- Accepting a deal records an explicit human decision inside WASLA. Contract enforceability, tax, customs and jurisdiction-specific legal requirements remain outside this software workflow.
- No deal action may automatically create an order, purchase from a supplier, change inventory or trigger payment.
- Private supplier costs, sourcing offers and owner-only official-store records must never be copied into member-to-member trade views.

## Parties and access

- Every deal belongs to exactly two distinct active business accounts: an initiator account and a counterparty account.
- The creator must be an active member of the initiator account with `account.trade.create`.
- Reading a deal requires an active membership in either party account with `account.trade.read`.
- Proposing requires the initiator account's trade-create permission.
- Countering, accepting or declining requires `account.trade.negotiate` on the account currently expected to respond.
- Cancelling or completing requires `account.trade.update` on the acting party account.
- All authorization is enforced by the API using scoped database permissions. Hiding a button in the UI is not authorization.

## Deal lifecycle

`draft → proposed → negotiating → accepted → completed`

Alternative terminal paths: `declined` or `cancelled`.

- Draft: visible only to authorized members of the initiator account; terms may be edited.
- Proposed: the initiator has explicitly sent the current terms to the counterparty; the counterparty becomes the pending responder.
- Negotiating: the pending responder may submit a counter-proposal. Each counter-proposal changes the pending responder to the other account and appends an immutable event.
- Accepted: the account currently designated as pending responder explicitly accepts the current terms. This records an acceptance event and timestamp only.
- Declined: the pending responder explicitly declines. This is terminal; a new deal is required for a fresh proposal.
- Cancelled: the initiator cancels a draft/proposed/negotiating deal before acceptance.
- Completed: either party records that the agreed commercial work is complete. This does not prove delivery or payment.

Every state transition must be validated server-side and written in the same transaction as its event and notification.

## Commercial terms

- Each deal has a title, description, ISO 4217 currency, optional proposed total, optional expiry and zero or more line items.
- Line items record the product/service description, optional SKU, positive quantity, unit price and currency.
- A counter-proposal is a new version/event; the prior proposal remains visible in history.
- Totals are calculated from line items when present; clients cannot submit a contradictory total.
- Terms and line items are editable only while the deal is a draft. After proposal, changes are made as counter-proposals and recorded as events.

## Audit and notifications

- Record creator, actor, account context, prior/new status, event type, timestamp and relevant proposal data.
- Event history is append-only; no API may edit or delete an earlier event.
- Notify the other party when a proposal is sent, a counter-proposal is submitted, a deal is accepted or declined, and a deal is cancelled.
- Notifications are private to their recipient and link only to the internal WASLA Trade route.

## Release gates

- Two-account access isolation tests for every endpoint.
- Tests for every valid and invalid lifecycle transition.
- Tests that non-members and members lacking the specific scoped permission cannot read or change a deal.
- Tests proving a counter-proposal never overwrites historical terms.
- Tests proving acceptance never triggers orders, payments, inventory changes or supplier purchases.
- Bilingual Arabic/English UI and RTL/LTR layout before release.
