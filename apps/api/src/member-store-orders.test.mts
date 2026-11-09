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
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "pending_merchant_review" }] })
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
    const updateSql = String(clientQuery.mock.calls[2][0]);
    expect(String(clientQuery.mock.calls[1][0])).toContain("SELECT o.status");
    expect(updateSql).toContain("o.buyer_user_id = $5");
    expect(updateSql).toContain("o.status IN ('pending_merchant_review', 'accepted')");
    expect(updateSql).toContain("p.permission_key = ANY(6::text[])");
    expect(clientQuery.mock.calls[2][1]).toEqual([
      "cancelled", "", "22222222-2222-4222-8222-222222222222", "demo",
      "11111111-1111-4111-8111-111111111111", ["store.order.manage", "account.order.manage"],
      null, null, null, "11111111-1111-4111-8111-111111111111",
    ]);
  });


  it("notifies active store/account order managers when a buyer cancels a pending request", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "pending_merchant_review" }] })
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
    const notificationCall = clientQuery.mock.calls[4];
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

    it("restores stock atomically when a buyer cancels an accepted order before shipment", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        status: "accepted", storeId: "store-1", inventoryCommittedAt: new Date(),
        items: [{ productId: "33333333-3333-4333-8333-333333333333", quantity: 2 }],
      }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: "22222222-2222-4222-8222-222222222222", orderNumber: "WS-RESTOCK",
        buyerUserId: "11111111-1111-4111-8111-111111111111", status: "cancelled",
      }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "33333333-3333-4333-8333-333333333333" }] })
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
    const restoreCall = clientQuery.mock.calls[3];
    expect(String(clientQuery.mock.calls[1][0])).toContain("inventory_committed_at AS \"inventoryCommittedAt\"");
    expect(String(restoreCall[0])).toContain("stock_quantity = stock_quantity + $3");
    expect(restoreCall[1]).toEqual(["33333333-3333-4333-8333-333333333333", "store-1", 2]);
    expect(String(clientQuery.mock.calls[4][0])).toContain("INSERT INTO audit_logs");
    expect(clientQuery.mock.calls[4][1][2]).toContain('"inventoryReleased":[{"productId":"33333333-3333-4333-8333-333333333333","quantity":2}]');
    expect(String(clientQuery.mock.calls[5][0])).toContain("INSERT INTO notifications");
    expect(clientQuery.mock.calls[6][0]).toBe("COMMIT");
  });
  it("allows an authorized merchant to cancel an accepted order and restores stock for the buyer", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "88888888-8888-4888-8888-888888888888" },
    } as never);
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        status: "accepted", storeId: "store-1", inventoryCommittedAt: new Date(),
        items: [{ productId: "33333333-3333-4333-8333-333333333333", quantity: 2 }],
      }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: "22222222-2222-4222-8222-222222222222", orderNumber: "WS-MERCHANT-CANCEL",
        buyerUserId: "11111111-1111-4111-8111-111111111111", status: "cancelled",
      }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "33333333-3333-4333-8333-333333333333" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders/22222222-2222-4222-8222-222222222222`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled", note: "Supplier could not fulfil the order" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, order: { status: "cancelled" } });
    const updateCall = clientQuery.mock.calls[2];
    expect(String(updateCall[0])).toContain("am.user_id = $5");
    expect(String(updateCall[0])).toContain("p.permission_key = ANY($6::text[])");
    expect(updateCall[1]).toEqual([
      "cancelled", "Supplier could not fulfil the order",
      "22222222-2222-4222-8222-222222222222", "demo",
      "88888888-8888-4888-8888-888888888888", ["store.order.manage", "account.order.manage"],
      null, null, null, "88888888-8888-4888-8888-888888888888",
    ]);
    const restoreCall = clientQuery.mock.calls[3];
    expect(String(restoreCall[0])).toContain("stock_quantity = stock_quantity + $3");
    expect(restoreCall[1]).toEqual(["33333333-3333-4333-8333-333333333333", "store-1", 2]);
    const buyerNotification = clientQuery.mock.calls[5];
    expect(String(buyerNotification[0])).toContain("The merchant cancelled your order");
    expect(buyerNotification[1]).toEqual([
      "11111111-1111-4111-8111-111111111111", "demo", "WS-MERCHANT-CANCEL",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(clientQuery.mock.calls[6][0]).toBe("COMMIT");
  });
it("notifies the buyer when a merchant accepts a pending request", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: "22222222-2222-4222-8222-222222222222", orderNumber: "WS-ACCEPT",
        buyerUserId: "77777777-7777-4777-8777-777777777777", status: "accepted",
        storeId: "store-1", items: [{ productId: "33333333-3333-4333-8333-333333333333", quantity: 2 }],
      }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "33333333-3333-4333-8333-333333333333" }] })
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
    const stockCall = clientQuery.mock.calls[2];
    expect(String(stockCall[0])).toContain("UPDATE store_products");
    expect(String(stockCall[0])).toContain("stock_quantity >= $3");
    expect(String(clientQuery.mock.calls[1][0])).toContain("inventory_committed_at = CASE WHEN $1 = 'accepted'");
    expect(stockCall[1]).toEqual(["33333333-3333-4333-8333-333333333333", "store-1", 2]);
    const notificationCall = clientQuery.mock.calls[4];
    expect(String(notificationCall[0])).toContain("INSERT INTO notifications");
    expect(String(notificationCall[0])).toContain("Your order request was accepted");
    expect(notificationCall[1]).toEqual(["77777777-7777-4777-8777-777777777777", "accepted", "demo", "22222222-2222-4222-8222-222222222222", "WS-ACCEPT"]);
  });
  it("does not accept an order or consume partial stock when any item is unavailable", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: "22222222-2222-4222-8222-222222222222", orderNumber: "WS-LOW-STOCK",
        buyerUserId: "77777777-7777-4777-8777-777777777777", status: "accepted",
        storeId: "store-1", items: [
          { productId: "33333333-3333-4333-8333-333333333333", quantity: 2 },
          { productId: "44444444-4444-4444-8444-444444444444", quantity: 5 },
        ],
      }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "33333333-3333-4333-8333-333333333333" }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders/22222222-2222-4222-8222-222222222222`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted", note: "Ready for processing" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, error: "Insufficient stock to accept this order. Update inventory or contact the buyer." });
    expect(String(clientQuery.mock.calls[2][0])).toContain("stock_quantity >= $3");
    expect(clientQuery.mock.calls[2][1]).toEqual(["33333333-3333-4333-8333-333333333333", "store-1", 2]);
    expect(String(clientQuery.mock.calls[3][0])).toContain("stock_quantity >= $3");
    expect(clientQuery.mock.calls[3][1]).toEqual(["44444444-4444-4444-8444-444444444444", "store-1", 5]);
    expect(String(clientQuery.mock.calls[4][0])).toBe("ROLLBACK");
    expect(clientQuery).toHaveBeenCalledTimes(5);
  });
  it("returns a safe event timeline only to the buyer or an authorized store member", async () => {
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "22222222-2222-4222-8222-222222222222" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: "99999999-9999-4999-8999-999999999999", eventType: "order.status_changed",
        fromStatus: "accepted", toStatus: "shipped", source: "application",
        reasonCode: null, metadata: { carrierName: "DHL" }, createdAt: "2026-11-08T12:00:00Z",
      }] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders/22222222-2222-4222-8222-222222222222`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      events: [{ eventType: "order.status_changed", fromStatus: "accepted", toStatus: "shipped" }],
    });
    expect(body.events[0]).not.toHaveProperty("metadata");
    expect(body.events[0]).not.toHaveProperty("trackingNumber");
    expect(body.events[0]).not.toHaveProperty("trackingUrl");
    expect(String(query.mock.calls[0][0])).toContain("o.buyer_user_id = $3");
    expect(String(query.mock.calls[1][0])).toContain("FROM member_store_order_events");
    expect(String(query.mock.calls[1][0])).toContain("LIMIT 200");
    expect(String(query.mock.calls[1][0])).toContain("ORDER BY created_at ASC, id ASC");
    expect(String(query.mock.calls[1][0])).not.toContain("tracking_number");
    expect(String(query.mock.calls[1][0])).not.toContain("tracking_url");
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
    const insertValues = clientQuery.mock.calls[3][1] as unknown[];
    expect(insertValues[3]).toBe(currency);
    expect(insertValues[5]).toBe(expectedSubtotal);
    expect(String(clientQuery.mock.calls[3][0])).toContain("subtotal");
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

  it("allows an authorized merchant to ship an accepted order with secure tracking details", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: "22222222-2222-4222-8222-222222222222", orderNumber: "WS-SHIP",
        buyerUserId: "77777777-7777-4777-8777-777777777777", status: "shipped",
      }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders/22222222-2222-4222-8222-222222222222`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "shipped", carrierName: "DHL", trackingNumber: "TRACK-123",
        trackingUrl: "https://tracking.example.test/TRACK-123",
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, order: { status: "shipped" } });
    const sql = String(clientQuery.mock.calls[1][0]);
    expect(sql).toContain("o.status = 'accepted'");
    expect(sql).toContain("o.status = 'shipped'");
    expect(sql).toContain("o.tracking_url AS");
    expect(clientQuery.mock.calls[1][1]).toEqual([
      "shipped", "", "22222222-2222-4222-8222-222222222222", "demo",
      "11111111-1111-4111-8111-111111111111", ["store.order.manage", "account.order.manage"],
      "DHL", "TRACK-123", "https://tracking.example.test/TRACK-123",
      "11111111-1111-4111-8111-111111111111",
    ]);
    expect(String(clientQuery.mock.calls[3][0])).toContain("Your order has shipped");
  });

  it("allows only the buyer to confirm delivery after shipment", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: "22222222-2222-4222-8222-222222222222", orderNumber: "WS-DELIVERED",
        buyerUserId: "11111111-1111-4111-8111-111111111111", status: "completed",
      }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders/22222222-2222-4222-8222-222222222222`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, order: { status: "completed" } });
    const sql = String(clientQuery.mock.calls[1][0]);
    expect(sql).toContain("o.buyer_user_id = $5 AND o.status = 'shipped'");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("d.status IN ('open', 'merchant_responded')");
    expect(sql).toContain("delivery_confirmed_at");
    expect(String(clientQuery.mock.calls[3][0])).toContain("Buyer confirmed delivery");
  });

  it("does not allow a buyer to mark an order as shipped", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders/22222222-2222-4222-8222-222222222222`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "shipped", carrierName: "DHL", trackingNumber: "TRACK-123",
        trackingUrl: "https://tracking.example.test/TRACK-123",
      }),
    });
    expect(response.status).toBe(404);
    const sql = String(clientQuery.mock.calls[1][0]);
    expect(sql).toContain("o.status = 'accepted'");
    expect(sql).toContain("p.permission_key = ANY(6::text[])");
    expect(clientQuery.mock.calls[1][1][5]).toEqual(["store.order.manage", "account.order.manage"]);
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO notifications"), expect.anything());
  });

  it("does not allow a merchant to confirm delivery on behalf of the buyer", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders/22222222-2222-4222-8222-222222222222`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    expect(response.status).toBe(404);
    const sql = String(clientQuery.mock.calls[1][0]);
    expect(sql).toContain("o.buyer_user_id = $5 AND o.status = 'shipped'");
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO notifications"), expect.anything());
  });

  it("rejects insecure or incomplete shipment tracking before opening a transaction", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders/22222222-2222-4222-8222-222222222222`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shipped", carrierName: "DHL", trackingNumber: "TRACK-123", trackingUrl: "http://tracking.example.test" }),
    });
    expect(response.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects malformed HTTPS tracking URLs before opening a transaction", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders/22222222-2222-4222-8222-222222222222`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shipped", carrierName: "DHL", trackingNumber: "TRACK-123", trackingUrl: "https://" }),
    });
    expect(response.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
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
