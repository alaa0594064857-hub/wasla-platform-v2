import { beforeEach, describe, expect, it } from "vitest";

type MaterialChangeCheck = (body: Record<string, unknown>) => boolean;
type ReReviewCheck = (currentStatus: string, body: Record<string, unknown>) => boolean;
let hasMaterialOfferChanges: MaterialChangeCheck;
let shouldRequireOfferReReview: ReReviewCheck;

beforeEach(async () => {
  const module = await import("./official-store-source-offers.mjs");
  hasMaterialOfferChanges = module.hasMaterialOfferChanges;
  shouldRequireOfferReReview = module.shouldRequireOfferReReview;
});

describe("supplier source offer review transitions", () => {
  it("returns an approved offer to review when its price changes", () => {
    expect(shouldRequireOfferReReview("approved", { supplierPrice: 12.5 })).toBe(true);
  });

  it("returns an approved offer to review when its quote or fulfilment evidence changes", () => {
    expect(shouldRequireOfferReReview("approved", { quoteValidUntil: "2026-12-01T00:00:00Z" })).toBe(true);
    expect(shouldRequireOfferReReview("approved", { directToCustomerConfirmed: false })).toBe(true);
    expect(shouldRequireOfferReReview("approved", { availabilityStatus: "limited" })).toBe(true);
  });

  it("detects every supported material field as requiring a separate approval action", () => {
    for (const field of [
      "supplierPrice",
      "quoteValidUntil",
      "availabilityStatus",
      "supplierIdentityVerified",
      "specificationsVerified",
      "directToCustomerConfirmed",
    ]) {
      expect(hasMaterialOfferChanges({ [field]: true }), field).toBe(true);
      expect(shouldRequireOfferReReview("approved", { [field]: true }), field).toBe(true);
    }
    expect(hasMaterialOfferChanges({ note: "internal note" })).toBe(false);
  });

  it("does not change a draft or already reviewed offer unless a review status is explicitly supplied", () => {
    expect(shouldRequireOfferReReview("needs_review", { supplierPrice: 12.5 })).toBe(false);
    expect(shouldRequireOfferReReview("approved", { offerStatus: "paused", supplierPrice: 12.5 })).toBe(false);
  });

  it("does not re-review an approved offer for an unrelated field", () => {
    expect(shouldRequireOfferReReview("approved", { note: "internal note" })).toBe(false);
  });
});
