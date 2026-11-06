/**
 * Demand-led sourcing domain rules.
 * These pure rules are shared by API and UI; the API/database remain authoritative.
 */

export const SOURCING_REQUEST_STATUSES = [
  "draft", "submitted", "searching", "offers_available",
  "buyer_selected", "fulfilled", "cancelled", "expired",
] as const;
export type SourcingRequestStatus = (typeof SOURCING_REQUEST_STATUSES)[number];

export const SUPPLIER_OFFER_STATUSES = [
  "draft", "submitted", "availability_pending", "available",
  "unavailable", "withdrawn", "expired", "accepted", "rejected",
] as const;
export type SupplierOfferStatus = (typeof SUPPLIER_OFFER_STATUSES)[number];

const REQUEST_TRANSITIONS: Readonly<Record<SourcingRequestStatus, readonly SourcingRequestStatus[]>> = {
  draft: ["submitted", "cancelled"],
  submitted: ["searching", "cancelled", "expired"],
  searching: ["offers_available", "cancelled", "expired"],
  offers_available: ["searching", "buyer_selected", "cancelled", "expired"],
  buyer_selected: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
  expired: [],
};

const OFFER_TRANSITIONS: Readonly<Record<SupplierOfferStatus, readonly SupplierOfferStatus[]>> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["availability_pending", "withdrawn", "expired"],
  availability_pending: ["available", "unavailable", "withdrawn", "expired"],
  available: ["unavailable", "withdrawn", "expired", "accepted", "rejected"],
  unavailable: ["availability_pending", "withdrawn", "expired"],
  withdrawn: [],
  expired: [],
  accepted: [],
  rejected: [],
};

export function canTransitionSourcingRequest(
  current: SourcingRequestStatus,
  next: SourcingRequestStatus,
): boolean {
  return REQUEST_TRANSITIONS[current].includes(next);
}

export function canTransitionSupplierOffer(
  current: SupplierOfferStatus,
  next: SupplierOfferStatus,
): boolean {
  return OFFER_TRANSITIONS[current].includes(next);
}

export interface SupplierOfferEligibility {
  status: SupplierOfferStatus;
  offeredQuantity: number;
  requestedQuantity: number;
  availabilityConfirmedAt: string | null;
  availabilityValidUntil: string | null;
  quoteValidUntil: string | null;
  originCountryCode: string;
  destinationCountryCode: string;
}

/**
 * Eligibility requires supplier-confirmed availability for the requested quantity.
 * Expiry timestamps are evaluated against an explicit clock for deterministic tests.
 */
export function getSupplierOfferEligibility(
  offer: SupplierOfferEligibility,
  now: Date = new Date(),
): { eligible: boolean; reason: string | null; crossBorder: boolean } {
  const crossBorder =
    offer.originCountryCode.trim().toUpperCase() !==
    offer.destinationCountryCode.trim().toUpperCase();

  if (offer.status !== "available") {
    return { eligible: false, reason: "offer_not_available", crossBorder };
  }
  if (!Number.isSafeInteger(offer.requestedQuantity) || offer.requestedQuantity <= 0 ||
      !Number.isSafeInteger(offer.offeredQuantity) || offer.offeredQuantity < offer.requestedQuantity) {
    return { eligible: false, reason: "insufficient_quantity", crossBorder };
  }
  if (!offer.availabilityConfirmedAt || !Number.isFinite(Date.parse(offer.availabilityConfirmedAt))) {
    return { eligible: false, reason: "supplier_confirmation_required", crossBorder };
  }
  if (offer.availabilityValidUntil && Date.parse(offer.availabilityValidUntil) <= now.getTime()) {
    return { eligible: false, reason: "availability_confirmation_expired", crossBorder };
  }
  if (offer.quoteValidUntil && Date.parse(offer.quoteValidUntil) <= now.getTime()) {
    return { eligible: false, reason: "quote_expired", crossBorder };
  }
  return { eligible: true, reason: null, crossBorder };
}

/** Local offers sort into a distinct group; imports are never silently substituted. */
export function classifySourcingOffer(
  originCountryCode: string,
  destinationCountryCode: string,
): "local" | "cross_border" {
  return originCountryCode.trim().toUpperCase() === destinationCountryCode.trim().toUpperCase()
    ? "local"
    : "cross_border";
}
