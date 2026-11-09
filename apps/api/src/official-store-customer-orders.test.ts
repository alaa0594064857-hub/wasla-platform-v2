import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), query: vi.fn(), connect: vi.fn() }));
vi.mock("better-auth/node", () => ({ fromNodeHeaders: vi.fn(() => ({})) }));
vi.mock("./auth.mjs", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query, connect: mocks.connect }) }));

let handler: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => Promise<void>;
let server: Server | undefined;

async function startServer(): Promise<string> {
  server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  ({ handleOfficialStoreCustomerOrdersRequest: handler } = await import("./official-store-customer-orders.mjs"));
  mocks.getSession.mockResolvedValue({ user: { id: "customer-1" } });
});

afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.resetAllMocks();
});

describe("official store customer supplier-confirmation requests", () => {
  it("requires an authenticated customer", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const base = await startServer();
    const response = await fetch(base, { method: "POST", body: "{}" });
    expect(response.status).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("lists only the signed-in customer's own requests", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ orderNumber: "WS-1" }] });
    const base = await startServer();
    const response = await fetch(base);
    expect(response.status).toBe(200);
    const customerPayload = await response.json();
    expect(customerPayload).toMatchObject({ success: true, requests: [{ orderNumber: "WS-1" }] });
    expect(mocks.query.mock.calls[0][1]).toEqual(["customer-1"]);
    const customerQuery = String(mocks.query.mock.calls[0][0]);
    expect(customerQuery).toContain("WHERE customer_user_id = $1");
    expect(customerQuery).not.toContain("supplier_name");
    expect(customerQuery).not.toContain("source_platform");
    expect(customerQuery).not.toContain("supplier_unit_cost");
    expect(customerQuery).not.toContain("supplier_order_url");
    expect(customerQuery).not.toContain("supplier_tracking_url");
    expect(JSON.stringify(customerPayload)).not.toMatch(/supplierName|supplier_name|sourcePlatform|source_platform|supplierCost|supplierOrderUrl|supplierTrackingUrl/i);
  });

  it("rejects a request without explicit customer confirmation", async () => {
    const base = await startServer();
    const response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "11111111-1111-4111-8111-111111111111", destinationCountry: "TR" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("creates a review-only supplier confirmation request and records its event atomically", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{
        productId: "11111111-1111-4111-8111-111111111111",
        titleEn: "Product", unitPrice: "25.00", currency: "EUR",
        sourceOfferId: "22222222-2222-4222-8222-222222222222",
        sourcePlatform: "authorized_feed", supplierName: "Private supplier",
        supplierUnitCost: "12.00", supplierShippingCost: "3.00",
        supplierCostCurrency: "EUR", supplierShippingCurrency: "EUR", shipsToCountries: ["TR", "DE"],
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: "33333333-3333-4333-8333-333333333333", orderNumber: "WS-1",
        orderStatus: "awaiting_supplier", paymentStatus: "not_enabled",
      }] })
      .mockResolvedValueOnce({ rows: [] }) // event
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const base = await startServer();
    const response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: "11111111-1111-4111-8111-111111111111",
        destinationCountry: "TR", confirmed: true,
      }),
    });
    expect(response.status).toBe(201);
    const customerResponse = await response.json();
    expect(customerResponse).toMatchObject({
      success: true,
      request: { orderStatus: "awaiting_supplier", paymentStatus: "not_enabled" },
    });
    expect(JSON.stringify(customerResponse)).not.toMatch(
      /supplierName|supplier_name|sourcePlatform|source_platform|supplierCost|supplierUnitCost|supplierShippingCost|supplierOrderUrl|supplierTrackingUrl|sourceOfferId/i,
    );
    expect(client.query.mock.calls[0][0]).toBe("BEGIN");
    const orderSql = String(client.query.mock.calls[1][0]);
    expect(orderSql).toContain("official_store_price_approvals");
    expect(orderSql).toContain("approval.destination_country = $2");
    expect(orderSql).toContain("trim_scale(approval.customer_price)::text");
    expect(orderSql).toContain("o.id = approval.offer_id");
    expect(client.query.mock.calls[1][1]).toEqual(["11111111-1111-4111-8111-111111111111", "TR"]);
    expect(String(client.query.mock.calls[2][0])).toContain("owner_review_required");
    expect(String(client.query.mock.calls[2][0])).toContain("'not_enabled'");
    expect(String(client.query.mock.calls[3][0])).toContain("supplier_confirmation_requested");
    expect(JSON.parse(client.query.mock.calls[3][1][2])).toMatchObject({
      customerConfirmedRequest: true, paymentEnabled: false, supplierPurchasePlaced: false,
    });
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects destinations not covered by the verified offer", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        productId: "11111111-1111-4111-8111-111111111111",
        shipsToCountries: ["DE"],
      }] })
      .mockResolvedValueOnce({ rows: [] });
    const base = await startServer();
    const response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: "11111111-1111-4111-8111-111111111111",
        destinationCountry: "TR", confirmed: true,
      }),
    });
    expect(response.status).toBe(400);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
