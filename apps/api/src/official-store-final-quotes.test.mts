import { describe, expect, it } from "vitest";
import { currencyFractionDigits, validAmount, validCurrency } from "./official-store-final-quotes.mjs";

describe("official store final quote validation", () => {
  it("accepts only finite positive amounts within the supported range", () => {
    expect(validAmount(1, "USD")).toBe(true);
    expect(validAmount(100000000, "USD")).toBe(true);
    expect(validAmount(25.55, "USD")).toBe(true);
    expect(validAmount(25.555, "USD")).toBe(false);
    expect(validAmount(100, "JPY")).toBe(true);
    expect(validAmount(100.5, "JPY")).toBe(false);
    expect(validAmount(1.234, "KWD")).toBe(true);
    expect(validAmount(1.2345, "KWD")).toBe(false);
    expect(validAmount(0, "USD")).toBe(false);
    expect(validAmount(-1, "USD")).toBe(false);
    expect(validAmount(Number.NaN, "USD")).toBe(false);
    expect(validAmount(Number.POSITIVE_INFINITY, "USD")).toBe(false);
    expect(validAmount("12.50", "USD")).toBe(false);
  });

  it("accepts only uppercase three-letter currency codes", () => {
    expect(validCurrency("USD")).toBe(true);
    expect(validCurrency("EUR")).toBe(true);
    expect(validCurrency("usd")).toBe(false);
    expect(validCurrency("US")).toBe(false);
    expect(validCurrency("USDT")).toBe(false);
    expect(currencyFractionDigits("JPY")).toBe(0);
    expect(currencyFractionDigits("USD")).toBe(2);
    expect(currencyFractionDigits("KWD")).toBe(3);
    expect(currencyFractionDigits("bad")).toBeNull();
  });
});
