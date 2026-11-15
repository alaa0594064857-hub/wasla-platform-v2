import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  query: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ query: mocks.query, connect: mocks.connect }),
}));

let handleStoreProductsRequest: (request: IncomingMessage, response: ServerResponse, slug: string) => Promise<void>;
let handleStoreProductDetailRequest: (request: IncomingMessage, response: ServerResponse, slug: string, productId: string) => Promise<void>;
let server: Server | undefined;

async function startServer(): Promise<string> {
  server = createServer((request, response) => {
    if (request.method === "PATCH") {
      void handleStoreProductDetailRequest(request, response, "sample-store", "product-1");
      return;
    }
    void handleStoreProductsRequest(request, response, "sample-store");
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
  ({ handleStoreProductsRequest, handleStoreProductDetailRequest } = await import("./store-products.mjs"));
  mocks.getSession.mockResolvedValue({ user: { id: "store-employee" } });
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
  }
  server = undefined;
  vi.resetAllMocks();
});

describe("store product operation permissions", () => {
  it("uses product-read permissions to load a store catalog", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "store-1", account_id: "account-1" }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/sample-store/products`);

    expect(response.status).toBe(200);
    const accessSql = String(mocks.query.mock.calls[0][0]);
    expect(accessSql).toContain("'account.product.read'");
    expect(accessSql).toContain("'store.product.read'");
    expect(accessSql).not.toContain("'store.product.create'");
  });

  it("does not expose a private store catalog when the signed-in user lacks read permission", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/sample-store/products`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Store not found or access denied",
    });
    const accessSql = String(mocks.query.mock.calls[0][0]);
    expect(accessSql).toContain("'account.product.read'");
    expect(accessSql).toContain("'store.product.read'");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("rejects insecure, credential-bearing, and local external checkout URLs", async () => {
    const baseUrl = await startServer();
    for (const sellerCheckoutUrl of [
      "http://seller.example/checkout",
      "https://user:password@seller.example/checkout",
      "https://localhost/checkout",
      "https://store.local/checkout",
    ]) {
      mocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "store-1", account_id: "account-1" }] });
      const response = await fetch(`${baseUrl}/api/stores/sample-store/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Valid product", price: 10, currency: "USD", stockQuantity: 1,
          sellerCheckoutUrl,
        }),
      });
      expect(response.status).toBe(400);
    }
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("keeps new member products in draft until platform review is enabled", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "store-1", account_id: "account-1" }] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/sample-store/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Public product", price: 10, currency: "USD", stockQuantity: 1, status: "active" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, code: "PRODUCT_REVIEW_REQUIRED" });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("requires product-create permission before accepting a new product", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/sample-store/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test product", price: 10, currency: "USD", stockQuantity: 1 }),
    });

    expect(response.status).toBe(404);
    const accessSql = String(mocks.query.mock.calls[0][0]);
    expect(accessSql).toContain("'account.product.create'");
    expect(accessSql).toContain("'store.product.create'");
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("prevents publishing an existing draft directly from the seller update route", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/sample-store/products/product-1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, code: "PRODUCT_REVIEW_REQUIRED" });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("does not allow a user without product-update permission to modify a store product", async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const release = vi.fn();
    mocks.connect.mockResolvedValueOnce({ query: clientQuery, release });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/sample-store/products/product-1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Unauthorized change" }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Product not found or access denied",
    });
    expect(clientQuery.mock.calls[0][0]).toBe("BEGIN");
    const updateSql = String(clientQuery.mock.calls[1][0]);
    expect(updateSql).toContain("'account.product.update'");
    expect(updateSql).toContain("'store.product.update'");
    expect(updateSql).toContain("p.id = $3");
    expect(updateSql).toContain("p.status <> 'active'");
    expect(clientQuery.mock.calls[2][0]).toBe("ROLLBACK");
    expect(clientQuery.mock.calls.some(call => String(call[0]).includes("INSERT INTO audit_logs"))).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
