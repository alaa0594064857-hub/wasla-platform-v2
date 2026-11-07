import { describe, expect, it } from "vitest";
import { buildTradeOpportunityMatches } from "./trade-opportunities.mjs";

const base = {
  account_id: "account-a", title: "Industrial steel sheets", product_category: "Steel sheets",
  quantity: "100", quantity_unit: "tonnes", target_country: "TR", destination_country: "AE",
  currency: "USD", target_unit_price: "900", minimum_order_quantity: "20",
  review_status: "approved" as const, expires_at: null,
};

describe("WASLA Trade opportunity matching", () => {
  it("ranks compatible buyer and supplier opportunities with transparent reasons", () => {
    const matches = buildTradeOpportunityMatches([
      { ...base, id: "buyer", account_name: "Buyer Co", opportunity_type: "buyer_request", minimum_order_quantity: null },
      { ...base, id: "supplier", account_id: "account-b", account_name: "Supplier Co", opportunity_type: "supplier_offer", quantity: "150", target_unit_price: "850" },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].score).toBe(100);
    expect(matches[0].readiness).toBe("review_ready");
  });

  it("does not match incompatible origin, destination, currency, MOQ, capacity or budget", () => {
    const buyer = { ...base, id: "buyer", opportunity_type: "buyer_request" as const, minimum_order_quantity: null };
    const supplier = { ...base, id: "supplier", account_id: "account-b", opportunity_type: "supplier_offer" as const, quantity: "150", target_unit_price: "850" };
    expect(buildTradeOpportunityMatches([buyer, { ...supplier, target_country: "CN" }])).toHaveLength(0);
    expect(buildTradeOpportunityMatches([buyer, { ...supplier, destination_country: "SA" }])).toHaveLength(0);
    expect(buildTradeOpportunityMatches([buyer, { ...supplier, currency: "EUR" }])).toHaveLength(0);
    expect(buildTradeOpportunityMatches([{ ...buyer, quantity: "10" }, { ...supplier, minimum_order_quantity: "20" }])).toHaveLength(0);
    expect(buildTradeOpportunityMatches([buyer, { ...supplier, quantity: "50" }])).toHaveLength(0);
    expect(buildTradeOpportunityMatches([buyer, { ...supplier, target_unit_price: "950" }])).toHaveLength(0);
  });

  it("marks incomplete commercial information as needing review rather than claiming a complete match", () => {
    const buyer = { ...base, id: "buyer", opportunity_type: "buyer_request" as const, minimum_order_quantity: null, target_country: null, currency: null, target_unit_price: null };
    const supplier = { ...base, id: "supplier", account_id: "account-b", opportunity_type: "supplier_offer" as const, quantity: null, target_country: null, currency: null, target_unit_price: null, minimum_order_quantity: null };
    const matches = buildTradeOpportunityMatches([buyer, supplier]);
    expect(matches).toHaveLength(1);
    expect(matches[0].readiness).toBe("needs_information");
    expect((matches[0].warnings as string[]).length).toBeGreaterThan(0);
  });

  it("does not create a broker match between two opportunities owned by the same account", () => {
    const buyer = { ...base, id: "buyer", opportunity_type: "buyer_request" as const, minimum_order_quantity: null };
    const supplier = { ...base, id: "supplier", opportunity_type: "supplier_offer" as const, quantity: "150", target_unit_price: "850" };
    expect(buildTradeOpportunityMatches([buyer, supplier])).toHaveLength(0);
  });

  it("never matches different product categories", () => {
    const buyer = { ...base, id: "buyer", opportunity_type: "buyer_request" as const, minimum_order_quantity: null };
    const supplier = { ...base, id: "supplier", account_id: "account-b", opportunity_type: "supplier_offer" as const, product_category: "Aluminium" };
    expect(buildTradeOpportunityMatches([buyer, supplier])).toHaveLength(0);
  });
});
