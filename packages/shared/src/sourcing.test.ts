import { describe, expect, it } from "vitest";
import {
  canTransitionSourcingRequest,
  canTransitionSupplierOffer,
  classifySourcingOffer,
  getSupplierOfferEligibility,
} from "./sourcing";

describe("demand-led sourcing state rules", () => {
  it("allows a submitted buyer request to enter supplier search", () => {
    expect(canTransitionSourcingRequest("submitted", "searching")).toBe(true);
  });

  it("does not allow a draft request to become fulfilled", () => {
    expect(canTransitionSourcingRequest("draft", "fulfilled")).toBe(false);
  });

  it("requires an explicit supplier availability confirmation before offer acceptance", () => {
    expect(canTransitionSupplierOffer("submitted", "accepted")).toBe(false);
    expect(canTransitionSupplierOffer("available", "accepted")).toBe(true);
  });

  it("rejects offers without supplier-confirmed availability", () => {
    const result = getSupplierOfferEligibility({
      status: "available",
      offeredQuantity: 10,
      requestedQuantity: 5,
      availabilityConfirmedAt: null,
      availabilityValidUntil: null,
      quoteValidUntil: null,
      originCountryCode: "TR",
      destinationCountryCode: "TR",
    }, new Date("2026-11-06T12:00:00.000Z"));
    expect(result).toMatchObject({ eligible: false, reason: "supplier_confirmation_required", crossBorder: false });
  });

  it("rejects expired supplier availability and expired quotes", () => {
    const base = {
      status: "available" as const,
      offeredQuantity: 10,
      requestedQuantity: 5,
      availabilityConfirmedAt: "2026-11-06T10:00:00.000Z",
      originCountryCode: "DE",
      destinationCountryCode: "TR",
    };
    const availability = getSupplierOfferEligibility({
      ...base,
      availabilityValidUntil: "2026-11-06T11:00:00.000Z",
      quoteValidUntil: null,
    }, new Date("2026-11-06T12:00:00.000Z"));
    expect(availability.reason).toBe("availability_confirmation_expired");

    const quote = getSupplierOfferEligibility({
      ...base,
      availabilityValidUntil: null,
      quoteValidUntil: "2026-11-06T11:00:00.000Z",
    }, new Date("2026-11-06T12:00:00.000Z"));
    expect(quote.reason).toBe("quote_expired");
  });

  it("requires the full requested quantity and identifies cross-border offers", () => {
    const result = getSupplierOfferEligibility({
      status: "available",
      offeredQuantity: 2,
      requestedQuantity: 5,
      availabilityConfirmedAt: "2026-11-06T10:00:00.000Z",
      availabilityValidUntil: null,
      quoteValidUntil: null,
      originCountryCode: "DE",
      destinationCountryCode: "TR",
    }, new Date("2026-11-06T12:00:00.000Z"));
    expect(result).toMatchObject({ eligible: false, reason: "insufficient_quantity", crossBorder: true });
  });

  it("classifies local and cross-border supply separately", () => {
    expect(classifySourcingOffer("tr", "TR")).toBe("local");
    expect(classifySourcingOffer("DE", "TR")).toBe("cross_border");
  });
});
