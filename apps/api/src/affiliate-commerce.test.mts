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
    mocks.authorize.mockResolvedValueOnce({ user: { id: "owner-1" } });
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
