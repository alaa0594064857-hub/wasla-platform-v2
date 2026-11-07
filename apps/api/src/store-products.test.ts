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
let server: Server | undefined;

async function startServer(): Promise<string> {
  server = createServer((request, response) => {
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
  ({ handleStoreProductsRequest } = await import("./store-products.mjs"));
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
});
