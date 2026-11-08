import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWaslaCarrierWebhook } from "./carrier-webhook-security.mjs";

const secret = "test-only-carrier-webhook-secret-at-least-32-bytes";
const timestamp = "1794168000";
const rawBody = Buffer.from('{"event":"shipment.in_transit","id":"evt_123"}');
function signature(body = rawBody, time = timestamp) {
  return createHmac("sha256", secret).update(time + ".").update(body).digest("hex");
}

describe("WASLA carrier webhook signature contract", () => {
  it("accepts a valid signature over the exact raw body and timestamp", () => {
    expect(verifyWaslaCarrierWebhook({ rawBody, signature: "sha256=" + signature(), timestamp, secret, nowMs: 1794168000000 })).toEqual({ ok: true, timestampSeconds: 1794168000 });
  });
  it("rejects a modified payload", () => {
    expect(verifyWaslaCarrierWebhook({ rawBody: Buffer.from(rawBody.toString() + " "), signature: signature(), timestamp, secret, nowMs: 1794168000000 })).toMatchObject({ ok: false, reason: "invalid_signature" });
  });
  it("rejects stale timestamps before signature processing", () => {
    expect(verifyWaslaCarrierWebhook({ rawBody, signature: signature(), timestamp, secret, nowMs: 1794168600000 })).toMatchObject({ ok: false, reason: "stale_timestamp" });
  });
  it("rejects missing or weak secrets", () => {
    expect(verifyWaslaCarrierWebhook({ rawBody, signature: signature(), timestamp, secret: "short", nowMs: 1794168000000 })).toMatchObject({ ok: false, reason: "missing_secret" });
  });
  it("rejects malformed signatures and timestamps", () => {
    expect(verifyWaslaCarrierWebhook({ rawBody, signature: "nope", timestamp, secret, nowMs: 1794168000000 })).toMatchObject({ ok: false, reason: "invalid_signature" });
    expect(verifyWaslaCarrierWebhook({ rawBody, signature: signature(), timestamp: "123", secret, nowMs: 1794168000000 })).toMatchObject({ ok: false, reason: "invalid_timestamp" });
  });
});
