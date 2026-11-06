import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query }) }));

import { handlePublicStorefrontRequest } from "./storefront.mjs";

function request(method = "GET") { return { method } as IncomingMessage; }
function response() {
  return {
    statusCode: 0, headers: {} as Record<string, string>, body: "",
    writeHead(status: number, headers: Record<string, string>) { this.statusCode = status; this.headers = headers; return this; },
    end(body: string) { this.body = body; return this; },
  };
}

describe("public storefront API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an active shop and its published catalog without requiring a session", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "store-1", name: "Public Shop", slug: "public-shop" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "product-1", title: "Published item", price: "15.00", currency: "USD" }] });
    const res = response();
    await handlePublicStorefrontRequest(request(), res as unknown as ServerResponse, "public-shop");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      success: true,
      store: { slug: "public-shop" },
      products: [{ id: "product-1", title: "Published item" }],
    });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(String(mocks.query.mock.calls[1][0])).toContain("status = 'active'");
    expect(String(mocks.query.mock.calls[1][0])).not.toContain("stock_quantity");
  });

  it("returns 404 when the shop is not publicly active", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = response();
    await handlePublicStorefrontRequest(request(), res as unknown as ServerResponse, "hidden-shop");
    expect(res.statusCode).toBe(404);
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("rejects unsupported methods", async () => {
    const res = response();
    await handlePublicStorefrontRequest(request("POST"), res as unknown as ServerResponse, "public-shop");
    expect(res.statusCode).toBe(405);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
