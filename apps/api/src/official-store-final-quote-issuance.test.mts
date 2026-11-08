import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), connect: vi.fn() }));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: mocks.authorize }));
vi.mock("./database.js", async (importOriginal) => ({ ...(await importOriginal<typeof import("./database.js")>()), getDatabasePool: () => ({ connect: mocks.connect }) }));

let handler: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse, id?: string) => Promise<void>;
let server: Server | undefined;
const orderId = "33333333-3333-4333-8333-333333333333";
const customerId = "customer-42";
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

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId, customerUserId: customerId, supplierStatus: "accepted",
    orderStatus: "supplier_confirmed", quoteStatus: null, quoteExpiresAt: null,
    productId: "11111111-1111-4111-8111-111111111111",
    sourcePlatform: "authorized_feed", supplierName: "Supplier A",
    supplierUnitCost: "12.00", supplierShippingCost: "3.00",
    supplierCostCurrency: "EUR", supplierShippingCurrency: "EUR",
    destinationCountry: "TR", sourceOfferId: offerId, ...overrides,
  };
}

beforeEach(async () => {
  ({ handleOfficialStoreFinalQuoteIssue: handler } = await import("./official-store-final-quotes.mjs"));
  mocks.authorize.mockResolvedValue({ userId: "owner-1" });
});

afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.resetAllMocks();
});

const validBody = {
  amount: 25.5, currency: "EUR", shippingDaysMin: 4, shippingDaysMax: 9,
  validityHours: 48, customerNote: "Delivery estimate confirmed for this destination.",
};

describe("official store final quote issuance", () => {
  it("requires platform management permission before connecting to the database", async () => {
    mocks.authorize.mockImplementationOnce((_request, response) => {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ success: false, error: "Forbidden" }));
      return null;
    });
    const base = await startServer();
    const response = await fetch(base, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validBody),
    });
    expect(response.status).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("rejects issuance until the supplier has been reconfirmed", async () => {
    const client = { query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [orderRow({ supplierStatus: "pending", orderStatus: "awaiting_supplier" })],
    }), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    const base = await startServer();
    const response = await fetch(base, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validBody),
    });
    expect(response.status).toBe(409);
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("issues a time-limited quote only against the exact currently approved supplier offer", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [orderRow()] })
      .mockResolvedValueOnce({ rows: [{ id: offerId }] })
      .mockResolvedValueOnce({ rows: [{ id: orderId, status: "pending_customer", amount: "25.50", currency: "EUR" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    const base = await startServer();
    const response = await fetch(base, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validBody),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, paymentEnabled: false });
    expect(String(client.query.mock.calls[2][0])).toContain("offer_status = 'approved'");
    expect(String(client.query.mock.calls[2][0])).toContain("supplier_identity_verified = TRUE");
    expect(String(client.query.mock.calls[2][0])).toContain("direct_to_customer_confirmed = TRUE");
    expect(String(client.query.mock.calls[2][0])).toContain("ships_to_countries @>");
    expect(client.query.mock.calls[3][1][0]).toBe(orderId);
    expect(String(client.query.mock.calls[4][0])).toContain("final_quote_issued");
    expect(JSON.parse(client.query.mock.calls[4][1][2])).toMatchObject({
      amount: "25.50", currency: "EUR", paymentEnabled: false, supplierPurchasePlaced: false,
    });
    expect(String(client.query.mock.calls[5][0])).toContain("INSERT INTO notifications");
    expect(client.query.mock.calls[5][1][0]).toBe(customerId);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("does not replace an unexpired quote already awaiting the customer", async () => {
    const client = { query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [orderRow({ quoteStatus: "pending_customer", quoteExpiresAt: new Date(Date.now() + 3600000) })],
    }), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    const base = await startServer();
    const response = await fetch(base, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validBody),
    });
    expect(response.status).toBe(409);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
