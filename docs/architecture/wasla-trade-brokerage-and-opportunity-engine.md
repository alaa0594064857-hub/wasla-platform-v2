# WASLA Trade — Managed B2B Brokerage and Opportunity Engine

Status: approved product direction and implementation blueprint. This document does not claim that automated discovery, supplier outreach, brokerage agreements, commission collection, escrow, or trade settlement are currently live.

## 1. Purpose

WASLA Trade is more than a deal-record and negotiation workspace. It is intended to support a managed B2B brokerage service in which WASLA actively helps a buyer find suitable suppliers, or helps a supplier find qualified buyers, then coordinates a documented commercial introduction and deal workflow.

The service must distinguish:
- Self-managed deals: two businesses find each other and negotiate using WASLA tools. No WASLA transaction commission is implied.
- WASLA-sourced brokerage deals: WASLA actively identifies or qualifies the opportunity, searches for the counterparty, documents the introduction, and obtains an explicit brokerage-fee agreement before the parties proceed.
- Paid platform services: subscriptions or separately priced research/verification services, independent of whether a trade closes.

A commission must never be silently added to ordinary member-to-member transactions.

## 2. Two-sided opportunity intake

Buyer request fields:
- Product/service and exact specifications, acceptable equivalents and prohibited substitutions.
- Quantity, target unit/total budget, currency and Incoterms or delivery responsibility where applicable.
- Destination country and, only when needed, city/port/postal region.
- Required delivery window, compliance/certification requirements and inspection needs.
- Buyer account, authorized contact, request visibility and expiry.
- Evidence documents and confirmation that the requester is authorized to seek the purchase.

Supplier opportunity fields:
- Products/capabilities, model/specification, capacity and available quantity.
- Manufacturing/origin country, minimum order quantity, lead time and sample options.
- Price basis, currency, quote validity, Incoterms, shipping and destination coverage.
- Supplier legal identity, registration evidence, business contacts and verification status.
- Certifications and quality evidence where relevant; no unsupported badges or claims.

Do not collect a street address at discovery stage. Request precise delivery details only when needed for a legitimate quote or fulfilment step, with appropriate access controls.

## 3. Discovery and matching workflow

1. Receive and validate a buyer request or supplier opportunity.
2. Normalize product identity, variant, units, quantity, destination, currency and trade terms.
3. Search authorized sources: approved marketplace APIs, public company directories where permitted, supplier websites, chamber/manufacturer directories, opted-in WASLA business profiles and licensed feeds.
4. Search both directions: buyer-to-supplier and supplier-to-buyer. A request may be matched with several candidate counterparties.
5. Preserve source URL/reference, retrieval time, source permissions, evidence and confidence for every candidate.
6. Rank candidates by exact specification fit, supplier/buyer legitimacy, capacity, destination/Incoterms fit, price evidence, lead time, quality evidence and risk. The lowest advertised price alone is not the best match.
7. Mark discovered leads as unverified until independently supported. AI-generated text or a marketplace listing is not proof of identity, stock, certification or price.
8. Present a shortlist with explicit unknowns and blockers. Human review is required before a lead is represented as verified or introduced as a vetted party.
9. Contact counterparties only through permitted channels and only after the relevant account/request permissions and outreach basis are established. Do not automate bulk unsolicited messages.
10. Record the buyer's selection, supplier response, quote, revisions, samples/inspection, negotiation and final outcome as auditable events.

## 4. Brokerage attribution and commission agreement

Before WASLA makes a commercial introduction as a broker, create a brokerage engagement record containing:
- The buyer and supplier accounts and authorized contacts.
- The specific request/opportunity and product scope.
- Which party or parties asked WASLA to act.
- The attribution evidence showing WASLA sourced or materially facilitated the introduction.
- Fee payer (buyer, supplier, or both), commission basis (fixed amount or percentage), currency, calculation base, cap if any, trigger event, due date and payment method.
- Whether freight, tax, duties, samples, inspection, refunds, cancellations or partial deliveries are excluded from the calculation base.
- Duration and any narrowly defined repeat-order / protected-introduction period.
- Disclosure and acceptance timestamps, agreement version and immutable acceptance evidence.
- Dispute, cancellation, non-circumvention and governing-law terms reviewed for the operating jurisdiction.

Both sides must see any fee that affects them before they accept the brokerage arrangement. Do not infer agreement from browsing, a lead match, a message read receipt or a deal proposal. A fee is not earned merely because a lead was displayed. Its trigger must be explicitly agreed and evidenced.

## 5. Commission calculation and status

Use a separate commission ledger, not the subscription ledger and not member-store customer payments. Suggested lifecycle:
- draft: proposed internally, not binding.
- disclosed: fee terms shown to the responsible payer(s).
- accepted: all required parties accepted the engagement.
- pending_trigger: brokerage work is in progress; no fee is yet due.
- earned: the agreed trigger is evidenced (for example, completed delivery or another explicitly agreed milestone).
- invoiced: an invoice/claim was issued by the legally responsible entity.
- paid: cleared payment is evidenced.
- disputed / waived / cancelled / refunded: exceptional states with reason and audit record.

Calculation must be deterministic and reproducible from the signed terms and verified deal evidence. Store the original rate, base definition, amount/currency, exchange-rate evidence if conversion is needed, rounding rule, trigger evidence and calculation snapshot. Prevent duplicate earning/invoicing for the same milestone with idempotency keys.

Example only: a 2% fee on an agreed USD 50,000 eligible goods value equals USD 1,000 before taxes, collection costs and operating expenses. This is not a default WASLA rate or a promised earning.

## 6. Money movement and legal boundary

Initial release should be brokerage coordination and invoicing only, not escrow:
- Do not hold buyer purchase funds, supplier proceeds, deposits or freight funds.
- Do not split or route the underlying trade payment through WASLA.
- The buyer and supplier contract and settle the underlying goods transaction directly unless a separately approved legal/payment model is implemented.
- Brokerage fee collection must use an eligible payment/invoicing arrangement in the operating jurisdiction, with a clear contracting entity, tax/invoice treatment and refund/dispute policy.
- Never describe a commission as earned or paid without verified evidence.
- Escrow, custody, payment splitting, guarantees, trade finance, letters of credit and acting as importer/exporter are out of scope until separately approved by legal, compliance and payment partners.

## 7. Deal workspace and lifecycle

The deal workspace should connect:
- Original buyer request and supplier opportunity.
- Matched candidates and evidence.
- Brokerage engagement and accepted fee terms, if applicable.
- Commercial quotes, revisions, product lines, quantities, currency and Incoterms.
- Samples, inspections, documents and compliance checks.
- Negotiation messages and immutable deal events.
- Signed/accepted commercial terms, delivery milestones and completion evidence.
- Commission calculation, invoice reference and payment evidence.

The existing trade_deals / trade_deal_items / trade_deal_events workflow is the negotiation foundation. It must be extended carefully rather than replaced, and self-managed deals must remain commission-free unless a separate brokerage engagement is accepted.

## 8. Security, privacy and AI boundaries

- Business users may access only opportunities/deals they own, are invited to, or are authorized to view.
- Candidate supplier contact details and confidential quotes are visible only to authorized staff and deal participants at the appropriate stage.
- Do not expose one buyer's request, budget, identity or negotiation position to competing suppliers unless explicitly authorized.
- Do not expose one supplier's confidential quote to another supplier.
- AI may research authorized sources, normalize and rank candidates, draft outreach and summarize negotiation; it cannot fabricate evidence, accept legal terms, bind WASLA, promise credit, approve its own verification, or make payments.
- Human review is required for supplier/buyer verification, first introductions, fee agreements, material contract terms, high-value or high-risk deals, sanctions/export-control flags and disputes.
- Keep a complete audit trail of source, model/version, reviewer, outreach consent, introduction, fee disclosure/acceptance, deal events and commission trigger.

## 9. Delivery phases

Phase A — Existing deal foundation:
- Validate and test the existing authenticated trade API, account permissions, bilingual deal UI, notifications and state transitions.
- Update the implementation tracker accurately; a deal workspace is not a broker-discovery engine.

Phase B — Structured opportunities:
- Add buyer requests and supplier capability/opportunity records with destination, quantity, specifications, trade terms, expiry and visibility.
- Add owner/staff review queue and opt-in publication/matching controls.

Phase C — Authorized discovery:
- Build connector registry and source adapters with declared permissions, geographic coverage, data freshness and allowed use.
- Start with manually supplied URLs and opted-in business profiles, then add approved APIs/feeds. No scraping or access-control bypass.

Phase D — Matching and human-assisted brokerage:
- Normalize and score matches, show evidence and unknowns, draft outreach, track responses, and require human approval before introductions.

Phase E — Brokerage agreements and commission ledger:
- Capture explicit fee disclosure/acceptance, immutable terms, milestone evidence, deterministic calculation, invoice/payment references and dispute handling.
- Keep this separate from member seller payments and subscriptions.

Phase F — Production readiness:
- Verify legal entity/jurisdiction, broker/intermediary role, tax/invoice obligations, consumer/business terms, sanctions/export controls, privacy and marketing outreach rules.
- Run authorization, two-account isolation, attribution, duplicate-event, fee-calculation, cancellation, dispute and audit tests.

## 10. Non-goals and release gates

This specification does not authorize WASLA to guarantee supplier performance, certify goods, hold funds, act as importer/exporter, provide regulated trade finance, or charge a commission on every platform deal.

Do not advertise managed brokerage as operational until source discovery, evidence review, outreach controls, brokerage agreement acceptance, commission calculation and collection have been implemented and tested end to end.
