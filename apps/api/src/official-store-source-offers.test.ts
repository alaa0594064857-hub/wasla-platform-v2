import { beforeEach, describe, expect, it } from "vitest";

type MaterialChangeCheck = (body: Record<string, unknown>) => boolean;
type ReReviewCheck = (currentStatus: string, body: Record<string, unknown>) => boolean;
type CandidateReadyCheck = (candidate: Record<string, unknown>, offer: Record<string, unknown>) => boolean;
let hasMaterialOfferChanges: MaterialChangeCheck;
let shouldRequireOfferReReview: ReReviewCheck;
let isSourcingCandidateReadyForOfferLink: CandidateReadyCheck;

beforeEach(async () => {
  const module = await import("./official-store-source-offers.mjs");
  hasMaterialOfferChanges = module.hasMaterialOfferChanges;
  shouldRequireOfferReReview = module.shouldRequireOfferReReview;
  isSourcingCandidateReadyForOfferLink = module.isSourcingCandidateReadyForOfferLink;
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


describe("sourcing candidate to private offer linking", () => {
  const validCandidate = () => ({
    supplier_name: "Verified Supplier",
    source_platform: "Supplier Portal",
    review_status: "approved",
    verification_status: "verified",
    supplier_dropship_confirmed: true,
    supplier_identity_verified: true,
    specifications_verified: true,
    minimum_order_quantity: 1,
    source_product_url: "https://supplier.example/product/123",
    proposed_price: "12.50",
    currency: "USD",
    quote_valid_until: new Date(Date.now() + 86400000),
    evidence: [
      { type: "supplier_evidence_url", url: "https://supplier.example/company" },
      { type: "product_specification", url: "https://supplier.example/product/123/specs" },
    ],
  });
  const validOffer = () => ({
    supplierName: "Verified Supplier",
    sourcePlatform: "Supplier Portal",
    sourceProductUrl: "https://supplier.example/product/123",
    supplierPrice: 12.5,
    supplierCurrency: "USD",
  });

  it("allows linking only an approved, verified, single-unit direct-shipping candidate with current evidence", () => {
    expect(isSourcingCandidateReadyForOfferLink(validCandidate(), validOffer())).toBe(true);
  });

  it.each([
    ["not owner approved", { review_status: "needs_owner_review" }],
    ["not verified", { verification_status: "partially_verified" }],
    ["supplier identity missing", { supplier_identity_verified: false }],
    ["specifications missing", { specifications_verified: false }],
    ["direct shipping not confirmed", { supplier_dropship_confirmed: false }],
    ["MOQ above one", { minimum_order_quantity: 2 }],
    ["expired quote", { quote_valid_until: new Date(Date.now() - 1000) }],
    ["supplier proof missing", { evidence: [{ type: "product_specification", url: "https://supplier.example/spec" }] }],
    ["specification proof missing", { evidence: [{ type: "supplier_evidence_url", url: "https://supplier.example/company" }] }],
    ["different supplier", { supplier_name: "Another Supplier" }],
    ["different source URL", { source_product_url: "https://supplier.example/other" }],
    ["different price", { proposed_price: "99.00" }],
  ])("blocks candidate linking when %s", (_reason, change) => {
    expect(isSourcingCandidateReadyForOfferLink({ ...validCandidate(), ...change }, validOffer())).toBe(false);
  });
});
