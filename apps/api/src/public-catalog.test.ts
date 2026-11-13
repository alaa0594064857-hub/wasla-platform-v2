import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query }) }));

let handlePublicCatalogRequest: (
  request: IncomingMessage, response: ServerResponse, storeSlug?: string, productId?: string
) => Promise<void>;
let handlePublicStoresDirectoryRequest: (
  request: IncomingMessage, response: ServerResponse
) => Promise<void>;
let server: Server | undefined;

async function startServer(route: { storeSlug?: string; productId?: string } = {}): Promise<string> {
  server = createServer((request, response) => {
    void handlePublicCatalogRequest(request, response, route.storeSlug, route.productId);
  });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  ({ handlePublicCatalogRequest, handlePublicStoresDirectoryRequest } = await import("./public-catalog.mjs"));
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  }
  server = undefined;
  vi.resetAllMocks();
});

describe("public catalog privacy and visibility", () => {
  it("returns only the explicit public product projection, never supplier source details", async () => {
    mocks.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: "33333333-3333-4333-8333-333333333333",
        title: "Sample public product",
        description: "Public description",
        price: "29.00",
        currency: "EUR",
        imageUrl: null,
        videoUrl: null,
        sellerCheckoutUrl: "https://merchant.example/checkout",
        storeId: "44444444-4444-4444-8444-444444444444",
        storeName: "Member Store",
        storeSlug: "member-store",
      }],
    });
    const baseUrl = await startServer({ productId: "33333333-3333-4333-8333-333333333333" });
    const response = await fetch(baseUrl);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.product).toMatchObject({ title: "Sample public product", price: "29.00", storeName: "Member Store" });
    expect(JSON.stringify(data)).not.toMatch(/supplier|source_product_url|supplier_price|supplier_reference/i);
    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("p.status = 'active'");
    expect(sql).not.toMatch(/supplier_name|supplier_price|source_product_url|source_offer/i);
  });

  it("does not query the database for an invalid product identifier", async () => {
    const baseUrl = await startServer({ productId: "not-a-uuid" });
    const response = await fetch(baseUrl);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects non-GET requests without reading catalog data", async () => {
    const baseUrl = await startServer({ storeSlug: "member-store" });
    const response = await fetch(baseUrl, { method: "POST" });
    expect(response.status).toBe(405);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("lists only active public store products using a supplier-free projection", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "store-id", name: "Member Store", slug: "member-store", businessName: "Member Business", businessDescription: null, website: null, logoReference: "https://cdn.example/logo.webp" }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "product-id", title: "Public item", price: "12.00", currency: "USD" }],
      });
    const baseUrl = await startServer({ storeSlug: "member-store" });
    const response = await fetch(baseUrl);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.store.slug).toBe("member-store");
    expect(data.store.logoReference).toBe("https://cdn.example/logo.webp");
    expect(data.products).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/supplier|source_offer|supplier_price|supplier_name/i);
    expect(String(mocks.query.mock.calls[0][0])).toContain("s.status = 'active'");
    expect(String(mocks.query.mock.calls[1][0])).toContain("status = 'active'");
    expect(String(mocks.query.mock.calls[1][0])).not.toMatch(/supplier|source_offer/i);
  });
});


describe("public member store directory", () => {
  async function startDirectoryServer(): Promise<string> {
    server = createServer((request, response) => {
      void handlePublicStoresDirectoryRequest(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address unavailable");
    return `http://127.0.0.1:${address.port}`;
  }

  it("returns searchable active stores with public-only fields and a bounded result set", async () => {
    mocks.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: "store-id", name: "Green Market", slug: "green-market",
        businessName: "Green Trading", countryCode: "TR",
        businessDescription: "Everyday goods", website: null, activeProductCount: 4,
      }],
    });
    const baseUrl = await startDirectoryServer();
    const response = await fetch(`${baseUrl}?q=green&country=TR`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.stores).toHaveLength(1);
    expect(data.stores[0]).toMatchObject({ slug: "green-market", countryCode: "TR", activeProductCount: 4 });
    expect(JSON.stringify(data)).not.toMatch(/supplier|source_offer|supplier_price|supplier_name|supplier_order_url/i);
    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("s.status = 'active'");
    expect(sql).toContain("a.status = 'active'");
    expect(sql).toContain("p.status = 'active'");
    expect(sql).toContain("LIMIT 50");
    expect(sql).not.toMatch(/supplier|source_offer|supplier_price|supplier_name/i);
    expect(mocks.query.mock.calls[0][1]).toEqual(["green", "TR"]);
  });

  it("rejects invalid country filters without querying the database", async () => {
    const baseUrl = await startDirectoryServer();
    const response = await fetch(`${baseUrl}?country=Turkey`);
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects non-GET directory requests", async () => {
    const baseUrl = await startDirectoryServer();
    const response = await fetch(baseUrl, { method: "POST" });
    expect(response.status).toBe(405);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
