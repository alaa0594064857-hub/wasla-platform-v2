import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({ query: vi.fn(), authorize: vi.fn() }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query }) }));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: mocks.authorize }));

let handleAffiliateCommerceRequest: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
let handleAffiliatePublicCatalogRequest: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
let handleAffiliateOutboundRequest: (req: IncomingMessage, res: ServerResponse, id: string) => Promise<void>;
let approvedOutboundUrl: (value: unknown, domain: unknown) => string | null;
let server: Server | undefined;

async function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  const module = await import("./affiliate-commerce.mjs");
  handleAffiliateCommerceRequest = module.handleAffiliateCommerceRequest;
  handleAffiliatePublicCatalogRequest = module.handleAffiliatePublicCatalogRequest;
  handleAffiliateOutboundRequest = module.handleAffiliateOutboundRequest;
  approvedOutboundUrl = module.approvedOutboundUrl;
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  }
  server = undefined;
  vi.resetAllMocks();
});

describe("affiliate outbound URL validation", () => {
  it("allows HTTPS URLs on the exact marketplace host or its subdomains", () => {
    expect(approvedOutboundUrl("https://amazon.com/item", "amazon.com")).toBe("https://amazon.com/item");
    expect(approvedOutboundUrl("https://www.amazon.com/item", "amazon.com")).toBe("https://www.amazon.com/item");
  });

  it.each([
    ["suffix attack", "https://evilamazon.com/item", "amazon.com"],
    ["unrelated host", "https://example.com/item", "amazon.com"],
    ["plain HTTP", "http://amazon.com/item", "amazon.com"],
    ["embedded credentials", "https://user:pass@amazon.com/item", "amazon.com"],
    ["missing domain", "https://amazon.com/item", ""],
    ["non-string URL", null, "amazon.com"],
  ])("rejects %s", (_reason, url, domain) => {
    expect(approvedOutboundUrl(url, domain)).toBeNull();
  });
});

describe("public affiliate catalog", () => {
  it("rejects missing or malformed country codes without querying the database", async () => {
    const baseUrl = await startServer((req, res) => { void handleAffiliatePublicCatalogRequest(req, res); });
    for (const path of ["/", "/?country=USA", "/?country=tr1"]) {
      const response = await fetch(baseUrl + path);
      expect(response.status).toBe(400);
      expect((await response.json()).success).toBe(false);
    }
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("queries only active, terms-reviewed, published and recently verified items scoped to the requested country", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const baseUrl = await startServer((req, res) => { void handleAffiliatePublicCatalogRequest(req, res); });
    const response = await fetch(baseUrl + "/?country=US");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, country: "US", items: [] });
    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("p.status='active'");
    expect(sql).toContain("p.terms_reviewed_at IS NOT NULL");
    expect(sql).toContain("i.publication_status='published'");
    expect(sql).toContain("i.last_verified_at >= NOW() - INTERVAL '30 days'");
    expect(sql).toContain("i.destination_countries ? $1");
    expect(mocks.query.mock.calls[0][1]).toEqual(["US"]);
  });

  it("does not expose editorial Vatan listings outside Türkiye", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const baseUrl = await startServer((req, res) => { void handleAffiliatePublicCatalogRequest(req, res); });
    const response = await fetch(baseUrl + "/?country=US");
    expect(response.status).toBe(200);
    const editorialSql = String(mocks.query.mock.calls[1][0]);
    expect(editorialSql).toContain("content_source='editorial'");
    expect(editorialSql).toContain("publication_status='published'");
    expect(editorialSql).toContain("owner_reviewed_at IS NOT NULL");
    expect(editorialSql).toContain("last_verified_at >= NOW() - INTERVAL '30 days'");
    expect(editorialSql).toContain("destination_countries ? $1");
    expect(editorialSql).toContain("provider_item_id NOT LIKE 'retail:vatan-%' OR $1 = 'TR'");
  });
});

describe("affiliate outbound redirect", () => {
  const validId = "11111111-1111-4111-8111-111111111111";

  it("returns not found and records no click when the stored destination host is unapproved", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: validId, outbound_url: "https://evilamazon.com/item", program_id: "program-1", marketplace_domain: "amazon.com" }] });
    const baseUrl = await startServer((req, res) => { void handleAffiliateOutboundRequest(req, res, validId); });
    const response = await fetch(baseUrl + "/out", { redirect: "manual" });
    expect(response.status).toBe(404);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("logs a click and redirects only after the destination passes validation", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: validId, outbound_url: "https://www.amazon.com/dp/example", program_id: "program-1", marketplace_domain: "amazon.com" }] })
      .mockResolvedValueOnce({ rows: [] });
    const baseUrl = await startServer((req, res) => { void handleAffiliateOutboundRequest(req, res, validId); });
    const response = await fetch(baseUrl + "/out", { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://www.amazon.com/dp/example");
    expect(String(mocks.query.mock.calls[0][0])).toContain("p.status='active'");
    expect(String(mocks.query.mock.calls[0][0])).toContain("i.last_verified_at >= NOW() - INTERVAL '30 days'");
    expect(String(mocks.query.mock.calls[1][0])).toContain("INSERT INTO affiliate_clicks");
    expect(mocks.query.mock.calls[1][1]).toEqual([validId, "program-1"]);
  });
});


describe("affiliate owner metrics", () => {
  it("returns distinct item and click counts without multiplying item totals", async () => {
    mocks.authorize.mockResolvedValueOnce({ userId: "owner-1", roleNames: ["platform_owner"] });
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: "program-1", item_count: 5, published_item_count: 2, click_count: 7 }] })
      .mockResolvedValueOnce({ rows: [] });
    const baseUrl = await startServer((req, res) => { void handleAffiliateCommerceRequest(req, res); });
    const response = await fetch(baseUrl + "/");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      programs: [{ item_count: 5, published_item_count: 2, click_count: 7 }],
    });
    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("COUNT(DISTINCT i.id)::int AS item_count");
    expect(sql).toContain("COUNT(DISTINCT i.id) FILTER (WHERE i.publication_status='published')::int AS published_item_count");
    expect(sql).toContain("COUNT(DISTINCT c.id)::int AS click_count");
  });
});


describe("owner review of AI research drafts", () => {
  const validId = "22222222-2222-4222-8222-222222222222";
  const candidate = {
    id: validId,
    title_en: "USB-C charger",
    title_ar: "شاحن USB-C",
    description_en: "A compact charger described on the manufacturer's product page.",
    description_ar: "شاحن مدمج موصوف في صفحة المنتج لدى الشركة المصنّعة.",
    source_url: "https://brand.example/products/charger?ref=grounding",
    outbound_url: null,
    content_source: "unverified",
    publication_status: "draft",
  };

  it("requires an explicit owner confirmation before changing a candidate", async () => {
    mocks.authorize.mockResolvedValueOnce({ userId: "owner-1", roleNames: ["platform_owner"] });
    const baseUrl = await startServer((req, res) => { void handleAffiliateCommerceRequest(req, res); });
    const response = await fetch(baseUrl + "/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve_editorial", itemId: validId, ownerConfirmed: false }),
    });
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("publishes only a reviewed HTTPS editorial card with no affiliate link", async () => {
    mocks.authorize.mockResolvedValueOnce({ userId: "owner-1", roleNames: ["platform_owner"] });
    mocks.query
      .mockResolvedValueOnce({ rows: [candidate] })
      .mockResolvedValueOnce({ rows: [{ id: validId }] });
    const baseUrl = await startServer((req, res) => { void handleAffiliateCommerceRequest(req, res); });
    const response = await fetch(baseUrl + "/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve_editorial", itemId: validId, ownerConfirmed: true }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true, action: "published_editorial", itemId: validId, commission: false,
    });
    const updateSql = String(mocks.query.mock.calls[1][0]);
    expect(updateSql).toContain("content_source='editorial'");
    expect(updateSql).toContain("publication_status='published'");
    expect(updateSql).toContain("outbound_url IS NULL");
    expect(mocks.query.mock.calls[1][1]).toEqual([validId, "https://brand.example/products/charger"]);
  });

  it("allows the owner to explicitly approve a seeded editorial draft", async () => {
    mocks.authorize.mockResolvedValueOnce({ userId: "owner-1", roleNames: ["platform_owner"] });
    mocks.query
      .mockResolvedValueOnce({ rows: [{ ...candidate, content_source: "editorial" }] })
      .mockResolvedValueOnce({ rows: [{ id: validId }] });
    const baseUrl = await startServer((req, res) => { void handleAffiliateCommerceRequest(req, res); });
    const response = await fetch(baseUrl + "/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve_editorial", itemId: validId, ownerConfirmed: true }),
    });
    expect(response.status).toBe(200);
    const updateSql = String(mocks.query.mock.calls[1][0]);
    expect(updateSql).toContain("owner_reviewed_at=NOW()");
    expect(updateSql).toContain("content_source IN ('unverified','editorial')");
  });

  it("rejects retailer marketplace sources from editorial publication", async () => {
    mocks.authorize.mockResolvedValueOnce({ userId: "owner-1", roleNames: ["platform_owner"] });
    mocks.query.mockResolvedValueOnce({ rows: [{ ...candidate, source_url: "https://www.amazon.com/dp/B000000000" }] });
    const baseUrl = await startServer((req, res) => { void handleAffiliateCommerceRequest(req, res); });
    const response = await fetch(baseUrl + "/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve_editorial", itemId: validId, ownerConfirmed: true }),
    });
    expect(response.status).toBe(422);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("archives an unverified draft without publishing it", async () => {
    mocks.authorize.mockResolvedValueOnce({ userId: "owner-1", roleNames: ["platform_owner"] });
    mocks.query
      .mockResolvedValueOnce({ rows: [candidate] })
      .mockResolvedValueOnce({ rows: [{ id: validId }] });
    const baseUrl = await startServer((req, res) => { void handleAffiliateCommerceRequest(req, res); });
    const response = await fetch(baseUrl + "/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive", itemId: validId, ownerConfirmed: true }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, action: "archived", itemId: validId });
    expect(String(mocks.query.mock.calls[1][0])).toContain("publication_status='archived'");
  });
});
