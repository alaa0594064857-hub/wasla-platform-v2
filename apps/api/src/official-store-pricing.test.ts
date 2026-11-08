import { beforeEach, describe, expect, it } from "vitest";

let isFreshFxRateTimestamp: (value: unknown, now?: number) => value is string;
beforeEach(async () => {
  ({ isFreshFxRateTimestamp } = await import("./official-store-pricing.mjs"));
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
