# WASLA Low-Cost Revenue Readiness Plan

Status: proposed operating plan; existing code surfaces are identified below, but this is not a claim that the complete service is live or commercially ready.

## Objective

Prepare WASLA to earn its first small, legitimate revenue without waiting for an online payment gateway, while avoiding custody of customer funds and avoiding unapproved production changes.

## Revenue channels

1. **Introduced-supplier brokerage** — WASLA introduces a buyer to a supplier and earns a disclosed fee only when both parties accept the written brokerage terms.
2. **Sourcing and procurement assistance** — a buyer requests a product or supply quote; WASLA sources suitable suppliers and agrees a fixed fee or percentage in writing before work begins.
3. **Official WASLA Store margin** — sell only products WASLA is authorized to offer, with a clearly disclosed price and margin.
4. **Optional promotion services** — offer paid product/store promotion only after the service, duration, price, deliverables, and refund terms are defined and visible.

## Existing code surfaces (not a live-service guarantee)

The repository already contains a substantial first version of the manual brokerage workflow:

- **Buyer/supplier opportunity intake:** `/trade` (`apps/web/src/app/trade/page.tsx`).
- **Owner opportunity review:** `/owner/trade/opportunities`.
- **Indicative opportunity matching:** `/owner/trade/matches`.
- **Bilateral brokerage terms:** `/owner/trade/agreements` and the party-facing `/trade/agreements`.
- **Commission ledger:** `/owner/trade/commission-ledger`.
- **Manual commission invoice workspace:** backed by the commission-invoice API and its lifecycle records.

The API contains account-scoped trade negotiation, private opportunity submission/review, separate buyer and supplier acceptance of brokerage terms, commission calculation/duplicate-reference safeguards, and manual invoice status/evidence recording. Automated payment collection, escrow, payout splitting, and tax-certified invoice delivery are not provided by these foundations.

## No-gateway operating flow

1. Buyer submits a product inquiry or sourcing request through the platform.
2. WASLA records the buyer, supplier, requested items, quantities, destination, and quote status.
3. The supplier provides a written quote and confirms availability, shipping responsibility, and lead time.
4. Before an introduction or brokerage service begins, both sides receive the brokerage fee, payer, trigger for earning the fee, and cancellation/refund terms in writing.
5. Buyer and supplier contract and settle the goods transaction directly using a lawful payment method they independently select. WASLA does not receive or hold the goods payment.
6. WASLA records its separately agreed service/brokerage fee. An invoice draft or a manually recorded payment-evidence status is not proof that a compliant payment was collected or that a tax-valid invoice was delivered.
7. Record the order outcome, evidence of delivery/completion, fee status, disputes, and any refund.

## Required records

- Unique inquiry/deal reference.
- Buyer and supplier identity/contact details appropriate to the transaction.
- Product description, quantity, quote currency, quote expiry, and delivery terms.
- Written acceptance from both parties for the brokerage/service fee.
- Clear identification of who pays the fee and when it becomes due.
- Status: inquiry, sourcing, quoted, accepted, in progress, completed, cancelled, disputed.
- Fee status: not due, pending, invoiced, paid, waived, refunded.
- Supporting messages/documents and an audit trail.

## Commercial and compliance safeguards

- Do not charge undisclosed commissions or double-charge parties.
- Do not represent a supplier, product, certification, shipping service, or payment method as verified unless it has been checked.
- Do not guarantee delivery, customs clearance, payment protection, or returns unless WASLA actually provides those services.
- Do not route customer purchase money through the owner's personal bank account or crypto wallet.
- Do not use personal transfers, USDT, or an informal workaround as a substitute for a compliant merchant/payment setup.
- Confirm local business, tax, consumer-protection, sanctions, and cross-border trade requirements before taking fees or facilitating restricted transactions.
- Publish clear terms, privacy information, contact details, cancellation/refund policy, and complaint handling before opening paid services.
- Keep optional promotion clearly separate from organic ranking and disclose paid placement.

## Launch gates

A channel is ready to accept money only when:
- Its service is actually available in the product and verified on the hosted deployment.
- Price, payer, deliverables, fee trigger, cancellation, and refund rules are visible.
- The legal entity/person is permitted to provide the service and issue the appropriate invoice/receipt.
- A compliant collection method is confirmed.
- A manual test with separate buyer and supplier accounts has passed, including authorization/isolation and complete audit records.
- A manual test has been completed and the resulting records can be reconciled.

## First practical priority

Prioritize validating the existing buyer/supplier opportunity-to-agreement workflow with two separate accounts, then verify the owner commission ledger and invoice lifecycle. Do not advertise automated marketplace commissions, payment escrow, or completed online checkout until those features and legal/payment arrangements are verified.

## Explicitly out of scope for this plan

- Enabling live card payments or splitting payouts.
- Holding buyer funds, escrow, or acting as a payment intermediary.
- Automatically deducting commissions from independent member-to-member sales.
- Changing production database records, payment settings, or live service configuration.
