import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), ensure: vi.fn() }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query }) }));
vi.mock("./affiliate-commerce.mjs", () => ({ ensureAffiliateCommerceTables: mocks.ensure }));

import { extractAffiliateResearchCandidates, saveAffiliateResearchCandidates } from "./affiliate-ai-candidates.mjs";

const grounded = [
  "https://brand.example/products/charger",
  "https://amazon.com/dp/B000000000",
];

function answer(products: unknown[]) {
  return [
    "Research summary",
    "WASLA_CANDIDATE_PRODUCTS_JSON_START",
    JSON.stringify({ products }),
    "WASLA_CANDIDATE_PRODUCTS_JSON_END",
  ].join("\n");
}

const valid = {
  title_en: "USB-C charger",
  title_ar: "شاحن USB-C",
  description_en: "A compact charger described on the official brand page.",
  description_ar: "شاحن مدمج وفق المعلومات المنشورة على صفحة العلامة الرسمية.",
  source_url: "https://brand.example/products/charger?ref=search",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AI affiliate product research candidates", () => {
  it("accepts only bilingual candidates whose HTTPS source is grounded and not a marketplace", () => {
    const rows = extractAffiliateResearchCandidates(answer([
      valid,
      { ...valid, source_url: "https://amazon.com/dp/B000000000" },
      { ...valid, source_url: "https://www.amazon.ca/dp/B000000000" },
      { ...valid, source_url: "https://localhost/product" },
      { ...valid, source_url: "https://unrelated.example/product" },
      { ...valid, title_ar: "" },
    ]), grounded);

    expect(rows).toHaveLength(1);
    expect(rows[0].source_url).toBe("https://brand.example/products/charger");
  });

  it("rejects malformed or missing candidate blocks", () => {
    expect(extractAffiliateResearchCandidates("No JSON block", grounded)).toEqual([]);
    expect(extractAffiliateResearchCandidates(
      "WASLA_CANDIDATE_PRODUCTS_JSON_START{bad json}WASLA_CANDIDATE_PRODUCTS_JSON_END",
      grounded,
    )).toEqual([]);
  });

  it("saves candidates as unverified unpublished drafts with no outbound links", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT id FROM affiliate_programs")) return { rows: [{ id: "program-1" }] };
      if (String(sql).includes("INSERT INTO affiliate_items")) return { rows: [{ id: "item-1" }] };
      return { rows: [] };
    });

    const created = await saveAffiliateResearchCandidates({
      specialistKey: "product_analyst",
      inputContext: { scope: "affiliate_only", marketplaces: ["US"] },
      ownerUserId: "owner-1",
      answer: answer([valid]),
      groundedSourceUrls: grounded,
    });

    expect(created).toBe(1);
    expect(mocks.ensure).toHaveBeenCalledOnce();
    const insert = mocks.query.mock.calls.find(call => String(call[0]).includes("INSERT INTO affiliate_items"));
    expect(String(insert?.[0])).toContain("'unverified'");
    expect(String(insert?.[0])).toContain("'draft'");
    expect(String(insert?.[0])).toContain("last_verified_at");
    expect(String(insert?.[0])).toContain("'draft',NULL");
    expect(String(insert?.[0])).toContain(`'["US"]'::jsonb`);
    expect(String(insert?.[0])).not.toContain("outbound_url");
    expect(insert?.[1]?.[0]).toBe("program-1");
  });

  it("does not save results from other specialists or non-affiliate tasks", async () => {
    const otherSpecialist = await saveAffiliateResearchCandidates({
      specialistKey: "market_researcher",
      inputContext: { scope: "affiliate_only" },
      ownerUserId: "owner-1",
      answer: answer([valid]),
      groundedSourceUrls: grounded,
    });
    const otherScope = await saveAffiliateResearchCandidates({
      specialistKey: "product_analyst",
      inputContext: { scope: "official_store" },
      ownerUserId: "owner-1",
      answer: answer([valid]),
      groundedSourceUrls: grounded,
    });
    expect(otherSpecialist).toBe(0);
    expect(otherScope).toBe(0);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
});
