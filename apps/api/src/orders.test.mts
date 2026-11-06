import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  poolQuery: vi.fn(),
  connect: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
}));

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ query: mocks.poolQuery, connect: mocks.connect }),
}));

import { handleOrdersRequest, handleStoreOrdersRequest } from "./orders.mjs";

const userId = "00000000-0000-4000-8000-000000000010";
const storeId = "00000000-0000-4000-8000-000000000020";
const productId = "00000000-0000-4000-8000-000000000030";
const orderId = "00000000-0000-4000-8000-000000000040";

function makeRequest(body: Record<string, unknown>): IncomingMessage {
  const request = Readable.from([JSON.stringify(body)]) as IncomingMessage;
  Object.assign(request, { method: "POST", headers: {} });
  return request;
}
function makeResponse() {
  return {
    statusCode: 0,
    body: "",
    writeHead(status: number) { this.statusCode = status; return this; },
    end(body: string) { this.body = body; return this; },
  };
}
function checkoutBody() {
  return {
    storeSlug: "sample-shop",
    idempotencyKey: "checkout-attempt-000000000001",
    shippingAddress: {
      fullName: "Test Buyer",
      phone: "+12025550123",
      addressLine1: "10 Market Street",
      city: "New York",
      countryCode: "US",
    },
    items: [{ productId, quantity: 2 }],
  };
}
function setupSuccessfulCheckout(stockQuantity = 5) {
  mocks.clientQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT id FROM orders WHERE buyer_user_id")) return { rowCount: 0, rows: [] };
    if (sql.includes("SELECT id FROM stores")) return { rowCount: 1, rows: [{ id: storeId }] };
    if (sql.includes("FROM store_products")) return {
      rowCount: 1,
      rows: [{ id: productId, title: "Sample product", sku: "SKU-1", price: "12.50", currency: "USD", stockQuantity, status: "active" }],
    };
    if (sql.includes("INSERT INTO orders")) return { rowCount: 1, rows: [{ id: orderId }] };
    if (sql.includes("UPDATE store_products")) return { rowCount: 1, rows: [{ id: productId }] };
    if (sql.includes("INSERT INTO store_inventory_movements")) return { rowCount: 1, rows: [{ id: "movement-1" }] };
    if (sql.includes("SELECT id, order_number")) return {
      rowCount: 1,
      rows: [{ id: orderId, orderNumber: "WSL-TEST", currency: "USD", subtotal: "25.00", grandTotal: "25.00", status: "placed" }],
    };
    if (sql.includes("SELECT id, product_id")) return {
      rowCount: 1,
      rows: [{ productId, productTitle: "Sample product", quantity: 2, unitPrice: "12.50", lineSubtotal: "25.00" }],
    };
    return { rowCount: 1, rows: [] };
  });
}
describe("buyer order checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  });

  it("requires authentication before opening a transaction", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = makeResponse();
    await handleOrdersRequest(makeRequest(checkoutBody()), response as unknown as ServerResponse);
    expect(response.statusCode).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("rejects invalid quantities before opening a transaction", async () => {
    const body = checkoutBody();
    body.items[0].quantity = 0;
    const response = makeResponse();
    await handleOrdersRequest(makeRequest(body), response as unknown as ServerResponse);
    expect(response.statusCode).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("creates an order and deducts stock atomically using the catalog price", async () => {
    setupSuccessfulCheckout();
    const response = makeResponse();
    await handleOrdersRequest(makeRequest(checkoutBody()), response as unknown as ServerResponse);
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toMatchObject({
      success: true,
      replayed: false,
      order: { id: orderId, subtotal: "25.00", currency: "USD" },
    });
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toBe("BEGIN");
    expect(statements.some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(statements.some((sql) => sql.includes("FOR UPDATE"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO order_items"))).toBe(true);
    expect(statements.some((sql) => sql.includes("UPDATE store_products"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO store_inventory_movements"))).toBe(true);
    expect(statements.some((sql) => sql.includes("'order.placed'"))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("rolls back the entire checkout when stock is insufficient", async () => {
    setupSuccessfulCheckout(1);
    const response = makeResponse();
    await handleOrdersRequest(makeRequest(checkoutBody()), response as unknown as ServerResponse);
    expect(response.statusCode).toBe(409);
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements.some((sql) => sql.includes("INSERT INTO orders"))).toBe(false);
    expect(statements.some((sql) => sql.includes("UPDATE store_products"))).toBe(false);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("returns the original order for a repeated idempotency key without changing stock", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id FROM orders WHERE buyer_user_id")) return { rowCount: 1, rows: [{ id: orderId }] };
      if (sql.includes("SELECT id, order_number")) return {
        rowCount: 1,
        rows: [{ id: orderId, orderNumber: "WSL-TEST", currency: "USD", subtotal: "25.00", grandTotal: "25.00", status: "placed" }],
      };
      if (sql.includes("SELECT id, product_id")) return { rowCount: 1, rows: [] };
      return { rowCount: 1, rows: [] };
    });
    const response = makeResponse();
    await handleOrdersRequest(makeRequest(checkoutBody()), response as unknown as ServerResponse);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ success: true, replayed: true, order: { id: orderId } });
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes("INSERT INTO orders"))).toBe(false);
    expect(statements.some((sql) => sql.includes("UPDATE store_products"))).toBe(false);
    expect(statements.at(-1)).toBe("COMMIT");
  });
});


describe("store order workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  });

  it("restores stock and records cancellation atomically", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM orders o") && sql.includes("FOR UPDATE OF o")) return {
        rowCount: 1,
        rows: [{ id: orderId, status: "accepted", orderNumber: "WSL-TEST", storeId, accountId: "account-1" }],
      };
      if (sql.includes("FROM order_items WHERE order_id")) return {
        rowCount: 1,
        rows: [{ productId, quantity: 2 }],
      };
      if (sql.includes("FROM store_products") && sql.includes("FOR UPDATE")) return {
        rowCount: 1,
        rows: [{ id: productId, stockQuantity: 3 }],
      };
      if (sql.includes("UPDATE store_products")) return { rowCount: 1, rows: [{ id: productId }] };
      if (sql.includes("INSERT INTO store_inventory_movements")) return { rowCount: 1, rows: [{ id: "movement-2" }] };
      if (sql.includes("UPDATE orders SET status")) return {
        rowCount: 1,
        rows: [{ id: orderId, orderNumber: "WSL-TEST", status: "cancelled" }],
      };
      return { rowCount: 1, rows: [] };
    });
    const request = Readable.from([JSON.stringify({ status: "cancelled", reason: "Buyer requested cancellation" })]) as IncomingMessage;
    Object.assign(request, { method: "PATCH", headers: {} });
    const response = makeResponse();
    await handleStoreOrdersRequest(request, response as unknown as ServerResponse, "sample-shop", orderId);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ success: true, order: { status: "cancelled" } });
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes("FOR UPDATE OF o"))).toBe(true);
    expect(statements.some((sql) => sql.includes("UPDATE store_products"))).toBe(true);
    expect(statements.some((sql) => sql.includes("'inbound'"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO order_status_history"))).toBe(true);
    expect(mocks.clientQuery.mock.calls.some(([sql, values]) => String(sql).includes("INSERT INTO audit_logs") && (values as unknown[])[1] === "order.cancelled")).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("rejects an invalid status transition without restoring stock", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM orders o") && sql.includes("FOR UPDATE OF o")) return {
        rowCount: 1,
        rows: [{ id: orderId, status: "shipped", orderNumber: "WSL-TEST", storeId, accountId: "account-1" }],
      };
      return { rowCount: 1, rows: [] };
    });
    const request = Readable.from([JSON.stringify({ status: "cancelled", reason: "Cancel this shipment" })]) as IncomingMessage;
    Object.assign(request, { method: "PATCH", headers: {} });
    const response = makeResponse();
    await handleStoreOrdersRequest(request, response as unknown as ServerResponse, "sample-shop", orderId);
    expect(response.statusCode).toBe(409);
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements.some((sql) => sql.includes("UPDATE store_products"))).toBe(false);
    expect(statements.some((sql) => sql.includes("INSERT INTO store_inventory_movements"))).toBe(false);
  });
});
