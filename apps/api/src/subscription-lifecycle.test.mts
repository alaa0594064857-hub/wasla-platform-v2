import { describe, expect, it } from "vitest";
import { addBillingPeriod, canTransitionSubscription, isSecureEvidenceUrl } from "./subscription-lifecycle.mjs";

describe("subscription lifecycle safety rules", () => {
  it("allows only explicitly defined forward state transitions", () => {
    expect(canTransitionSubscription("pending", "active")).toBe(true);
    expect(canTransitionSubscription("trialing", "past_due")).toBe(true);
    expect(canTransitionSubscription("paused", "active")).toBe(true);
    expect(canTransitionSubscription("active", "pending")).toBe(false);
    expect(canTransitionSubscription("canceled", "active")).toBe(false);
    expect(canTransitionSubscription("expired", "trialing")).toBe(false);
    expect(canTransitionSubscription("unknown", "active")).toBe(false);
  });

  it("accepts only credential-free HTTPS evidence URLs", () => {
    expect(isSecureEvidenceUrl("https://example.com/receipt/123")).toBe(true);
    expect(isSecureEvidenceUrl("http://example.com/receipt")).toBe(false);
    expect(isSecureEvidenceUrl("https://user:pass@example.com/receipt")).toBe(false);
    expect(isSecureEvidenceUrl("javascript:alert(1)")).toBe(false);
    expect(isSecureEvidenceUrl("not-a-url")).toBe(false);
    expect(isSecureEvidenceUrl("https://example.com/" + "a".repeat(2100))).toBe(false);
  });
});

describe("subscription billing period calculation", () => {
  it("clamps month-end dates instead of overflowing into the following month", () => {
    expect(addBillingPeriod(new Date("2026-01-31T12:00:00.000Z"), "month", 1)?.toISOString())
      .toBe("2026-02-28T12:00:00.000Z");
    expect(addBillingPeriod(new Date("2024-01-31T12:00:00.000Z"), "month", 1)?.toISOString())
      .toBe("2024-02-29T12:00:00.000Z");
  });

  it("returns no recurring period for one-time plans or invalid intervals", () => {
    expect(addBillingPeriod(new Date("2026-01-01T00:00:00.000Z"), "one_time", 1)).toBeNull();
    expect(addBillingPeriod(new Date("2026-01-01T00:00:00.000Z"), "month", 0)).toBeNull();
  });
});
