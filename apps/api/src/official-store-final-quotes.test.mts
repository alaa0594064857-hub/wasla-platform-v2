import { describe, expect, it } from "vitest";
import { validAmount, validCurrency } from "./official-store-final-quotes.mjs";

describe("official store final quote validation", () => {
  it("accepts only finite positive amounts within the supported range", () => {
    expect(validAmount(1)).toBe(true);
    expect(validAmount(100000000)).toBe(true);
    expect(validAmount(25.55)).toBe(true);
    expect(validAmount(0)).toBe(false);
    expect(validAmount(25.555)).toBe(false);
    expect(validAmount(-1)).toBe(false);
    expect(validAmount(Number.NaN)).toBe(false);
    expect(validAmount(Number.POSITIVE_INFINITY)).toBe(false);
    expect(validAmount("12.50")).toBe(false);
  });

  it("accepts only uppercase three-letter currency codes", () => {
    expect(validCurrency("USD")).toBe(true);
    expect(validCurrency("EUR")).toBe(true);
    expect(validCurrency("usd")).toBe(false);
    expect(validCurrency("US")).toBe(false);
    expect(validCurrency("USDT")).toBe(false);
  });
});
