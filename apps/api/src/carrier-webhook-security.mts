import { createHmac, timingSafeEqual } from "node:crypto";

export type CarrierWebhookVerification =
  | { ok: true; timestampSeconds: number }
  | { ok: false; reason: "missing_secret" | "invalid_timestamp" | "stale_timestamp" | "invalid_signature" };

/**
 * WASLA's normalized webhook signature contract for carrier adapters:
 * HMAC-SHA256(secret, "<unix-seconds>.<exact-raw-request-body>").
 * Provider-specific adapters must verify the provider's native signature first,
 * then use this contract only when forwarding events into WASLA's internal ingress.
 */
export function verifyWaslaCarrierWebhook(input: {
  rawBody: Buffer;
  signature: string | undefined;
  timestamp: string | undefined;
  secret: string | undefined;
  nowMs?: number;
  toleranceSeconds?: number;
}): CarrierWebhookVerification {
  if (!input.secret || Buffer.byteLength(input.secret, "utf8") < 32) {
    return { ok: false, reason: "missing_secret" };
  }
  if (!input.timestamp || !/^[0-9]{10}$/.test(input.timestamp)) {
    return { ok: false, reason: "invalid_timestamp" };
  }
  const timestampSeconds = Number(input.timestamp);
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(tolerance) || tolerance < 1 || Math.abs(nowSeconds - timestampSeconds) > tolerance) {
    return { ok: false, reason: "stale_timestamp" };
  }
  const supplied = input.signature?.replace(/^sha256=/i, "").toLowerCase() ?? "";
  if (!/^[a-f0-9]{64}$/.test(supplied)) {
    return { ok: false, reason: "invalid_signature" };
  }
  const expected = createHmac("sha256", input.secret)
    .update(input.timestamp + ".", "utf8")
    .update(input.rawBody)
    .digest();
  const actual = Buffer.from(supplied, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true, timestampSeconds };
}
