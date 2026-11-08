import { beforeEach, describe, expect, it } from "vitest";

let isFreshFxRateTimestamp: (value: unknown, now?: number) => value is string;
let isValidDestinationCountry: (value: unknown) => value is string;
let isOfferEligibleForDestination: (offer: Record<string, unknown> | null | undefined, productId: string, destinationCountry: string) => boolean;
beforeEach(async () => {
  ({ isFreshFxRateTimestamp, isValidDestinationCountry, isOfferEligibleForDestination } = await import("./official-store-pricing.mjs"));
});

describe("official store FX freshness", () => {
  const now = Date.parse("2026-11-08T12:00:00.000Z");

  it("accepts a timestamp within the previous 24 hours", () => {
    expect(isFreshFxRateTimestamp("2026-11-08T11:30:00.000Z", now)).toBe(true);
    expect(isFreshFxRateTimestamp("2026-11-07T12:00:00.000Z", now)).toBe(true);
  });

  it("rejects FX timestamps older than 24 hours", () => {
    expect(isFreshFxRateTimestamp("2026-11-07T11:59:59.999Z", now)).toBe(false);
  });

  it("rejects timestamps too far in the future and invalid values", () => {
    expect(isFreshFxRateTimestamp("2026-11-08T12:06:00.000Z", now)).toBe(false);
    expect(isFreshFxRateTimestamp("not-a-date", now)).toBe(false);
    expect(isFreshFxRateTimestamp(null, now)).toBe(false);
  });
});


describe("official store destination scoping", () => {
  it("accepts uppercase two-letter ISO-style country codes", () => {
    expect(isValidDestinationCountry("TR")).toBe(true);
    expect(isValidDestinationCountry("US")).toBe(true);
  });

  it("rejects missing, lowercase and malformed destination codes", () => {
    expect(isValidDestinationCountry("tr")).toBe(false);
    expect(isValidDestinationCountry("TUR")).toBe(false);
    expect(isValidDestinationCountry("")).toBe(false);
    expect(isValidDestinationCountry(null)).toBe(false);
  });
});


describe("verified supplier offer pricing eligibility", () => {
  const validOffer = {
    product_id: "product-1", offer_status: "approved", availability_status: "available",
    direct_to_customer_confirmed: true, supplier_identity_verified: true,
    specifications_verified: true, minimum_order_quantity: 1,
    shipping_cost: "4.50", shipping_currency: "USD",
    ships_to_countries: ["TR", "DE"],
    quote_valid_until: "2099-01-01T00:00:00.000Z",
    last_verified_at: "2026-11-08T10:00:00.000Z",
  };

  it("accepts an approved, verified single-unit offer shipping to the destination", () => {
    expect(isOfferEligibleForDestination(validOffer, "product-1", "TR")).toBe(true);
  });

  it("rejects a different product, unsupported destination, expired quote or unverified offer", () => {
    expect(isOfferEligibleForDestination(validOffer, "product-2", "TR")).toBe(false);
    expect(isOfferEligibleForDestination(validOffer, "product-1", "US")).toBe(false);
    expect(isOfferEligibleForDestination({ ...validOffer, quote_valid_until: "2000-01-01T00:00:00.000Z" }, "product-1", "TR")).toBe(false);
    expect(isOfferEligibleForDestination({ ...validOffer, specifications_verified: false }, "product-1", "TR")).toBe(false);
    expect(isOfferEligibleForDestination({ ...validOffer, minimum_order_quantity: 2 }, "product-1", "TR")).toBe(false);
  });
});
