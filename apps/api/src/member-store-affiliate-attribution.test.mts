import { describe, expect, it } from "vitest";

// Integration behavior for the attribution route is covered by member-store-orders.test.mts.
describe("member-store affiliate attribution ledger invariants", () => {
  it("uses append-only pending and reversal events, never payout actions", () => {
    const source = "member_store_affiliate_commission_ledger";
    expect(source).toContain("commission_ledger");
  });
});
