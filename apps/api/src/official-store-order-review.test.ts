import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), connect: vi.fn() }));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: mocks.authorize }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ connect: mocks.connect }) }));

let handler: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse, id?: string) => Promise<void>;
let server: Server | undefined;
const orderId = "33333333-3333-4333-8333-333333333333";
const productId = "11111111-1111-4111-8111-111111111111";
const offerId = "22222222-2222-4222-8222-222222222222";

async function startServer(): Promise<string> {
  server = createServer((request, response) => { void handler(request, response, orderId); });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

function orderRow() {
  return {
    id: orderId, productId,
    supplierConfirmationStatus: "pending", orderStatus: "awaiting_supplier",
    sourcePlatform: "authorized_feed", supplierName: "Supplier A",
    supplierUnitCost: "12.00", supplierShippingCost: "3.00",
    supplierCostCurrency: "EUR", supplierShippingCurrency: "EUR", destinationCountry: "TR", sourceOfferId: offerId,
  };
}
function offerRow() {
  return {
    sourcePlatform: "authorized_feed", supplierName: "Supplier A",
    supplierUnitCost: "12.00", supplierShippingCost: "3.00",
    supplierCostCurrency: "EUR", supplierShippingCurrency: "EUR", shipsToCountries: ["TR", "DE"],
  };
}

beforeEach(async () => {
  ({ handleOfficialStoreOrderSupplierReview: handler } = await import("./official-store-order-review.mjs"));
  mocks.authorize.mockResolvedValue({ userId: "owner-1" });
});

afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.resetAllMocks();
});

describe("owner supplier confirmation review", () => {
  it("requires platform management permission", async () => {
    mocks.authorize.mockImplementationOnce((_request, response) => {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ success: false, error: "Forbidden" }));
      return null;
    });
    const base = await startServer();
    const response = await fetch(base, { method: "PATCH", body: "{}" });
    expect(response.status).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("requires an HTTPS evidence URL and a review note to accept a supplier", async () => {
    const base = await startServer();
    const response = await fetch(base, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "accepted", note: "Supplier confirmed all details" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("accepts only the exact still-valid supplier offer and keeps payment/purchasing disabled", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [orderRow()] })
      .mockResolvedValueOnce({ rows: [offerRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: orderId, orderStatus: "supplier_confirmed",
        supplierConfirmationStatus: "accepted", paymentStatus: "not_enabled",
        supplierPurchaseStatus: "not_placed", ownerReviewRequired: true,
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const base = await startServer();
    const response = await fetch(base, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "accepted", note: "Supplier reconfirmed exact item and delivery.",
        evidenceUrl: "https://supplier.example/confirmation/123",
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      order: { orderStatus: "supplier_confirmed", paymentStatus: "not_enabled", supplierPurchaseStatus: "not_placed" },
    });
    expect(String(client.query.mock.calls[2][0])).toContain("quote_valid_until > NOW()");
    expect(String(client.query.mock.calls[3][0])).toContain("supplier_confirmation_status = 'pending'");
    expect(client.query.mock.calls[3][1]).toEqual([orderId, "accepted", "supplier_confirmed"]);
    expect(client.query.mock.calls[4][1][1]).toBe("owner-1");
    expect(JSON.parse(client.query.mock.calls[4][1][3])).toMatchObject({
      decision: "accepted", paymentEnabled: false, supplierPurchasePlaced: false,
    });
    expect(String(client.query.mock.calls[5][0])).toContain("official_store_order");
    expect(String(client.query.mock.calls[5][0])).toContain("'/account/orders'");
    expect(client.query.mock.calls[5][1][5]).toBe(orderId);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("refuses acceptance if the source offer price changed", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [orderRow()] })
      .mockResolvedValueOnce({ rows: [{ ...offerRow(), supplierUnitCost: "15.00" }] })
      .mockResolvedValueOnce({ rows: [] });
    const base = await startServer();
    const response = await fetch(base, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "accepted", note: "Supplier reconfirmed exact item and delivery.",
        evidenceUrl: "https://supplier.example/confirmation/123",
      }),
    });
    expect(response.status).toBe(409);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("closes a rejected supplier request without payment or procurement", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [orderRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: orderId, orderStatus: "cancelled", supplierConfirmationStatus: "rejected",
        paymentStatus: "not_enabled", supplierPurchaseStatus: "not_placed", ownerReviewRequired: true,
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const base = await startServer();
    const response = await fetch(base, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "rejected", note: "Supplier confirmed that this item is unavailable." }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true, order: { orderStatus: "cancelled", paymentStatus: "not_enabled" },
    });
    expect(String(client.query.mock.calls[4][0])).toContain("official_store_order");
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
