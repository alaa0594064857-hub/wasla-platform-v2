import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createWaslaServer } from "./server.js";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("./database.js", () => ({
  getDatabasePool: vi.fn(),
}));

let server: Server | undefined;
const query = vi.fn();
const clientQuery = vi.fn();
const release = vi.fn();
const connect = vi.fn();

async function startServer() {
  const currentServer = createWaslaServer();
  server = currentServer;
  await new Promise<void>((resolve, reject) => {
    currentServer.once("error", reject);
    currentServer.listen(0, "127.0.0.1", resolve);
  });
  const address = currentServer.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "11111111-1111-4111-8111-111111111111" },
  } as never);
  query.mockReset();
  clientQuery.mockReset();
  release.mockReset();
  connect.mockReset();
  connect.mockResolvedValue({ query: clientQuery, release });
  vi.mocked(getDatabasePool).mockReturnValue({ query, connect } as never);
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
  }
  server = undefined;
  vi.clearAllMocks();
});

describe("member store order requests", () => {
  it("requires a signed-in buyer", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Authentication required" });
    expect(query).not.toHaveBeenCalled();
  });

  it("validates order lines before opening a database transaction", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ productId: "not-a-uuid", quantity: 1 }] }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Each item needs a valid product and quantity",
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it("allows a buyer to cancel only their own pending order request", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "22222222-2222-4222-8222-222222222222", orderNumber: "WS-TEST", status: "cancelled" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders/22222222-2222-4222-8222-222222222222`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, order: { status: "cancelled" } });
    const updateSql = String(clientQuery.mock.calls[1][0]);
    expect(updateSql).toContain("o.buyer_user_id = $5");
    expect(updateSql).toContain("o.status = 'pending_merchant_review'");
    expect(updateSql).toContain("p.permission_key = ANY($6::text[])");
    expect(clientQuery.mock.calls[1][1]).toEqual([
      "cancelled", "", "22222222-2222-4222-8222-222222222222", "demo",
      "11111111-1111-4111-8111-111111111111", ["store.order.manage", "account.order.manage"],
    ]);
  });

  it("lists only buyer-owned orders or orders the merchant may read", async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, orders: [] });
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("o.buyer_user_id = $2");
    expect(query.mock.calls[0][1]).toEqual([
      "demo", "11111111-1111-4111-8111-111111111111",
      ["store.order.read", "account.order.read"],
    ]);
    expect(sql).toContain("LIMIT 100");
  });
});
