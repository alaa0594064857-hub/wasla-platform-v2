export type NormalizedCarrierStatus = "shipped" | "in_transit" | "delivery_attempted" | "delivered" | "exception" | "unknown";
export type CarrierEventDecision =
  | { accepted: true; event: { carrierCode: string; providerEventId: string; trackingReference: string; status: NormalizedCarrierStatus; occurredAt: string; idempotencyKey: string; verificationState: "pending"; proofOfDeliveryVerified: false } }
  | { accepted: false; reason: "invalid_carrier" | "invalid_event_id" | "invalid_tracking_reference" | "unknown_event" | "invalid_event_time" };

const eventMap: Readonly<Record<string, NormalizedCarrierStatus>> = {
  shipment_created: "shipped",
  picked_up: "in_transit",
  in_transit: "in_transit",
  out_for_delivery: "in_transit",
  delivery_attempted: "delivery_attempted",
  delivered: "delivered",
  delivery_exception: "exception",
  returned_to_sender: "exception",
};

/** Pure normalization only. Caller must authenticate provider signature and bind the tracking reference to an existing shipment. */
export function normalizeCarrierEvent(input: {
  carrierCode: string;
  providerEventId: string;
  trackingReference: string;
  eventCode: string;
  occurredAt: string;
}): CarrierEventDecision {
  const carrierCode = input.carrierCode.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(carrierCode)) return { accepted: false, reason: "invalid_carrier" };
  const providerEventId = input.providerEventId.trim();
  if (!providerEventId || providerEventId.length > 255 || /[\r\n]/.test(providerEventId)) return { accepted: false, reason: "invalid_event_id" };
  const trackingReference = input.trackingReference.trim();
  if (trackingReference.length < 3 || trackingReference.length > 120 || /[\r\n]/.test(trackingReference)) return { accepted: false, reason: "invalid_tracking_reference" };
  const status = eventMap[input.eventCode.trim().toLowerCase()];
  if (!status) return { accepted: false, reason: "unknown_event" };
  const time = new Date(input.occurredAt);
  if (!input.occurredAt || !Number.isFinite(time.getTime()) || time.toISOString() !== input.occurredAt) return { accepted: false, reason: "invalid_event_time" };
  const idempotencyKey = [carrierCode, providerEventId].join(":");
  return { accepted: true, event: { carrierCode, providerEventId, trackingReference, status, occurredAt: time.toISOString(), idempotencyKey, verificationState: "pending", proofOfDeliveryVerified: false } };
}
