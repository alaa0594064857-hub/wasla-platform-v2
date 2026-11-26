# WASLA V2 — Production Launch Readiness Audit
Date: 2026-11-26
Branch: `main`
Repository: `alaa0594064857-hub/wasla-platform-v2`

This audit records observed production evidence and release blockers. It does not certify commercial launch readiness.

## Verified in this checkpoint

- GitHub Actions CI for the AI retry API and owner UI changes completed successfully; the corresponding API and web Render deployments are live.
- Render's primary API service `wasla-apiwasla-api-v2` and web service `wasla-web` are not suspended. The web service reports Next.js ready; the API reports listening on port 10000.
- The queried API and web warning/error log windows for 2026-11-25 returned no warning/error-level entries. This is a bounded log check, not a substitute for browser-based end-to-end testing.
- Production database `wasla-db` is available and not suspended; database identity observed as `wasla_9ty9`.
- The owner account `alaa0594064857@gmail.com` is active, email-verified, and has an active `platform_owner` role assignment. No re-registration or role change is needed.
- AI manager is enabled and not paused. The 15-minute scheduler is deployed and has successful runs. Latest observed runs report no queued work to process.
- Production AI task inventory: 4 clean results awaiting owner review, 9 legacy rate-limited drafts that require revalidation, 6 failed tasks, and 0 queued tasks. Retry support is deployed for the old rate-limited states; old drafts must not be approved as fresh results. No task was manually retried and no Gemini usage was triggered during this audit.
- Affiliate research currently contains 5 private draft candidates, 0 published items, and an Amazon US program with status `pending_approval`. No Amazon affiliate links or product offers are publicly live.
- Required application tables exist, including users, accounts, business profiles, stores, store products, subscriptions, subscription plans, invoices, payment events, messaging, notifications, trade, official-store, AI-task and support tables.
- Production counts observed: 1 account, 1 store, 0 member-store products, 0 messages, 0 notifications, 0 support tickets, 0 official-store products, 0 subscription plans and 0 subscriptions.
- The single member store `wasla-test-store` (`WASLA Global Store`) has store status `active`, but its business account is `pending_verification` and its business profile is `unverified`. It has zero products. The public catalog intentionally requires an active account and verified business profile, so the store is correctly withheld from public discovery. Do not bypass this gate.
- Sponsored subscriptions are specified in `docs/architecture/sponsored-subscriptions.md` and tracked in issue #196. No sponsorship API, intake, sponsorship records, or payment flow is implemented by that specification alone.

## Release blockers / owner decisions

1. **Business verification:** review the test business's actual evidence and complete the existing owner verification workflow only if it qualifies. Do not bypass verification or mark an unverified business verified merely to make a public page appear.
2. **Store publication:** add and review real products, then publish only products meeting the platform's approval and availability requirements. The current production store has no active public products.
3. **Production email:** a verified sender identity and successful external-recipient delivery test must be confirmed before general public account verification/password-reset flows are relied upon. Secret values must never be placed in source or chat.
4. **Subscriptions and sponsorship:** plan records and subscriptions are empty. Implement the sponsorship workflow in issue #196, then test beneficiary consent, owner permissions, audit events and entitlement enforcement. Keep checkout and paid activation disabled until provider/legal/settlement requirements are satisfied.
5. **Hosted end-to-end acceptance:** run real owner, business-member, buyer and unrelated-account tests against the live host, including negative cross-account access checks. CI success is not a substitute for these hosted tests.
6. **Official WASLA Store:** current code provides sourcing, offer review and pricing foundations; do not advertise automated supplier discovery, marketplace connectors, checkout, supplier purchasing or fulfilment as live until the corresponding external integrations and complete journeys are verified.
7. **Media storage:** profile image decode/normalization exists, but scalable object storage/CDN and upload lifecycle are still outstanding.
8. **Mobile release:** native Android/iOS builds, physical-device tests, push delivery and store submission metadata remain outstanding.
9. **Legal, privacy, accessibility and localization:** review terms, seller disclosures, consumer rights, privacy/deletion retention, accessibility and full Arabic/English coverage before broad commercial launch.
10. **Database continuity/capacity:** database is currently available on Render's small 0.1c-256mb plan. Confirm renewal/expiry and backup/restore arrangements in Render before relying on it for sustained production traffic.
11. **Legacy Render API:** an older service named `wasla-api` remains present with auto-deploy disabled. Do not delete it until its usage and dependencies are explicitly confirmed; the active primary API is `wasla-apiwasla-api-v2`.

## Operational guardrails

- Do not create fake plans, subscriptions, sponsor commitments, payment events, verified businesses, product approvals or supplier confirmations to make dashboards look populated.
- Do not activate payment collection, escrow, split payouts or automatic paid entitlements without the approved provider, signed webhook verification, duplicate-event handling, refunds, tax/settlement review and explicit owner approval.
- Do not delete the legacy API service or change paid plans/spend limits without explicit owner approval.
- A successful deployment means the services built and started; it does not prove every user journey works end to end.

## Immediate next sequence

1. Review and verify the member business only after its real supporting evidence is checked.
2. Publish a real test product through the full owner approval workflow and verify the public store page.
3. Confirm production email sender and external delivery.
4. Execute hosted multi-account security and user-journey acceptance tests.
5. Implement and test issue #196 sponsorship workflow while keeping billing disabled.
6. Reassess remaining commercial/mobile/legal release gates before announcing a broad launch.


## Database continuity and exposure review — 2026-11-26

Read-only Render inspection of `wasla-db` found:

- Instance status is `available` and not suspended; PostgreSQL 18, region `ohio`.
- Compute plan is `0.1c-256mb`, provisioned disk is 1 GB, disk autoscaling is disabled, and high availability is disabled.
- External IP allow list currently contains `0.0.0.0/0` ("everywhere"). This does not mean the database is unauthenticated, but it leaves the external endpoint broadly reachable at the network layer. Review whether external access is still needed before narrowing it; Render services in the same region/workspace should use the internal connection path.
- Sampled metrics around 2026-11-25 23:02–2026-11-26 00:02 UTC showed 0–1 active connections, low CPU use, and memory readings around 43–56 MiB. This is a short sample, not a capacity or load test.
- The Render Postgres skill reference describes automatic daily snapshots, but retention varies by plan. The connected account inspection did not expose backup history, retention, or a completed restore drill. Therefore backup availability/retention and recoverability remain **unverified**.
- No plan, allow-list, disk, HA, or database settings were changed. No database export or restore was performed.

Follow-up is tracked in issue #199. Do not claim disaster-recovery readiness until a current backup is visible, retention is known, and a restore has been tested on an isolated non-production instance.
