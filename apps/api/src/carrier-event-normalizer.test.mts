import { describe, expect, it } from "vitest";
import { normalizeCarrierEvent } from "./carrier-event-normalizer.mjs";

const base = { carrierCode: "Example-Carrier", providerEventId: "evt_2026_001", trackingReference: "TRK-123456", eventCode: "delivered", occurredAt: "2026-11-09T10:30:00.000Z" };
describe("carrier event normalization", () => {
  it("normalizes a delivered event but never treats it as verified proof", () => {
    const result = normalizeCarrierEvent(base);
    expect(result).toMatchObject({ accepted: true, event: { carrierCode: "example-carrier", status: "delivered", verificationState: "pending", proofOfDeliveryVerified: false, idempotencyKey: "example-carrier:evt_2026_001" } });
  });
  it("maps known event states without accepting unknown provider codes", () => {
    expect(normalizeCarrierEvent({ ...base, eventCode: "out_for_delivery" })).toMatchObject({ accepted: true, event: { status: "in_transit" } });
    expect(normalizeCarrierEvent({ ...base, eventCode: "parcel_magic" })).toEqual({ accepted: false, reason: "unknown_event" });
  });
  it("rejects malformed carrier, event, tracking and timestamp fields", () => {
    expect(normalizeCarrierEvent({ ...base, carrierCode: "../carrier" })).toEqual({ accepted: false, reason: "invalid_carrier" });
    expect(normalizeCarrierEvent({ ...base, providerEventId: "bad\\nevent" })).toEqual({ accepted: false, reason: "invalid_event_id" });
    expect(normalizeCarrierEvent({ ...base, trackingReference: "x" })).toEqual({ accepted: false, reason: "invalid_tracking_reference" });
    expect(normalizeCarrierEvent({ ...base, occurredAt: "yesterday" })).toEqual({ accepted: false, reason: "invalid_event_time" });
  });
});
