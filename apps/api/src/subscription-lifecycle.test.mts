import { describe, expect, it } from "vitest";
import { canTransitionSubscription, isSecureEvidenceUrl } from "./subscription-lifecycle.mjs";

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
