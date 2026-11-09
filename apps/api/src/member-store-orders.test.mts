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
    expect(updateSql).toContain("p.permission_key = ANY(6::text[])");
    expect(clientQuery.mock.calls[1][1]).toEqual([
      "cancelled", "", "22222222-2222-4222-8222-222222222222", "demo",
      "11111111-1111-4111-8111-111111111111", ["store.order.manage", "account.order.manage"],
    ]);
  });


  it("notifies active store/account order managers when a buyer cancels a pending request", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "22222222-2222-4222-8222-222222222222", orderNumber: "WS-CANCEL", buyerUserId: "11111111-1111-4111-8111-111111111111", status: "cancelled" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
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
    const notificationCall = clientQuery.mock.calls[3];
    expect(String(notificationCall[0])).toContain("INSERT INTO notifications");
    expect(String(notificationCall[0])).toContain("A buyer cancelled an order request");
    expect(String(notificationCall[0])).toContain("store_members");
    expect(String(notificationCall[0])).toContain("account_members");
    expect(String(notificationCall[0])).toContain("recipients.user_id <> $4");
    expect(notificationCall[1]).toEqual([
      "demo", "22222222-2222-4222-8222-222222222222",
      ["store.order.read", "store.order.manage", "account.order.read", "account.order.manage"],
      "11111111-1111-4111-8111-111111111111", "WS-CANCEL",
    ]);
  });

  it("notifies the buyer when a merchant accepts a pending request", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "22222222-2222-4222-8222-222222222222", orderNumber: "WS-ACCEPT", buyerUserId: "77777777-7777-4777-8777-777777777777", status: "accepted" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders/22222222-2222-4222-8222-222222222222`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted", note: "Ready for processing" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, order: { status: "accepted" } });
    const notificationCall = clientQuery.mock.calls[3];
    expect(String(notificationCall[0])).toContain("INSERT INTO notifications");
    expect(String(notificationCall[0])).toContain("Your order request was accepted");
    expect(notificationCall[1]).toEqual(["77777777-7777-4777-8777-777777777777", "accepted", "demo", "22222222-2222-4222-8222-222222222222", "WS-ACCEPT"]);
  });
  it("notifies only active store/account order managers when a buyer submits a request", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] }) // begin
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "33333333-3333-4333-8333-333333333333", accountId: "44444444-4444-4444-8444-444444444444" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "55555555-5555-4555-8555-555555555555", title: "Test item", sku: "SKU-1", price: "12.50", currency: "USD", stockQuantity: 4 }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "66666666-6666-4666-8666-666666666666", orderNumber: "WS-TEST-1", status: "pending_merchant_review" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // audit
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // notifications
      .mockResolvedValueOnce({ rowCount: null, rows: [] }); // commit

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "buyer-order-001" },
      body: JSON.stringify({ items: [{ productId: "55555555-5555-4555-8555-555555555555", quantity: 2 }] }),
    });

    expect(response.status).toBe(201);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ success: true, order: { orderNumber: expect.any(String) } });
    const notificationCall = clientQuery.mock.calls[6];
    expect(String(notificationCall[0])).toContain("INSERT INTO notifications");
    expect(String(notificationCall[0])).toContain("store_members");
    expect(String(notificationCall[0])).toContain("account_members");
    expect(String(notificationCall[0])).toContain("p.permission_key = ANY($4::text[])");
    expect(String(notificationCall[0])).toContain("recipients.user_id <> $7");
    expect(notificationCall[1]).toEqual([
      "demo", "66666666-6666-4666-8666-666666666666", "44444444-4444-4444-8444-444444444444",
      ["store.order.read", "store.order.manage", "account.order.read", "account.order.manage"],
      "33333333-3333-4333-8333-333333333333", expect.stringMatching(/^WS-/),
      "11111111-1111-4111-8111-111111111111",
    ]);
  });

  it.each([
    ["USD", "12.34", 3, "37.02"],
    ["JPY", "120", 3, "360"],
    ["KWD", "1.234", 3, "3.702"],
  ])("calculates %s order totals using the currency's minor units", async (currency, price, quantity, expectedSubtotal) => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "33333333-3333-4333-8333-333333333333", accountId: "44444444-4444-4444-8444-444444444444" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "55555555-5555-4555-8555-555555555555", title: "Currency test", sku: null, price, currency, stockQuantity: 10 }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "66666666-6666-4666-8666-666666666666", orderNumber: "WS-CURRENCY", status: "pending_merchant_review" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ productId: "55555555-5555-4555-8555-555555555555", quantity }] }),
    });

    expect(response.status).toBe(201);
    const insertValues = clientQuery.mock.calls[4][1] as unknown[];
    expect(insertValues[3]).toBe(currency);
    expect(insertValues[5]).toBe(expectedSubtotal);
    expect(String(clientQuery.mock.calls[4][0])).toContain("subtotal");
  });

  it("rejects prices with more fractional digits than the currency allows", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "33333333-3333-4333-8333-333333333333", accountId: "44444444-4444-4444-8444-444444444444" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "55555555-5555-4555-8555-555555555555", title: "JPY precision test", sku: null, price: "120.50", currency: "JPY", stockQuantity: 10 }] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ productId: "55555555-5555-4555-8555-555555555555", quantity: 1 }] }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: "Order total or currency precision is invalid" });
    expect(clientQuery).toHaveBeenCalledTimes(4);
  });

  it("lists only buyer-owned orders or orders the merchant may read", async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, orders: [] });
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("o.buyer_user_id = $2");
    expect(sql).toContain('CASE WHEN o.buyer_user_id = $2 THEN NULL ELSE o.merchant_note END AS "merchantNote"');
    expect(query.mock.calls[0][1]).toEqual([
      "demo", "11111111-1111-4111-8111-111111111111",
      ["store.order.read", "account.order.read"],
    ]);
    expect(sql).toContain("LIMIT 100");
  });
});
