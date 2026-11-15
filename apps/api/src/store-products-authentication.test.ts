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
  mocks.getSession.mockResolvedValue(null);
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

describe("store product authentication boundary", () => {
  it("rejects unauthenticated catalog reads, product creation, and product updates before database access", async () => {
    const baseUrl = await startServer();

    const requests = [
      fetch(`${baseUrl}/api/stores/sample-store/products`),
      fetch(`${baseUrl}/api/stores/sample-store/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test product", price: 10, currency: "USD", stockQuantity: 1 }),
      }),
      fetch(`${baseUrl}/api/stores/sample-store/products/product-1`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Unauthorized change" }),
      }),
    ];

    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401]);
    for (const response of responses) {
      expect(await response.json()).toEqual({
        success: false,
        error: "Authentication required",
      });
    }
    expect(mocks.getSession).toHaveBeenCalledTimes(3);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
