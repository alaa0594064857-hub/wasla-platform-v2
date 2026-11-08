import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({ query: vi.fn(), authorize: vi.fn() }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query }) }));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: mocks.authorize }));

let handleOfficialStoreProductsRequest: (
  request: IncomingMessage, response: ServerResponse, productId?: string, publicCatalogue?: boolean
) => Promise<void>;
let server: Server | undefined;

async function startServer(publicCatalogue = true): Promise<string> {
  server = createServer((request, response) => {
    void handleOfficialStoreProductsRequest(request, response, undefined, publicCatalogue);
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
  ({ handleOfficialStoreProductsRequest } = await import("./official-store-products.mjs"));
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  }
  server = undefined;
  vi.resetAllMocks();
});

describe("official WASLA Store public catalogue", () => {
  it("returns only public product fields and requires a currently approved verified direct-shipping offer", async () => {
    mocks.query.mockImplementation(async (sql: unknown) => String(sql).includes("SELECT p.id")
      ? { rows: [{
          id: "product-1", title_ar: "منتج", title_en: "Product", price: "20.00",
          currency: "EUR", availability_status: "available", deliveryCountries: ["TR"],
          estimatedDeliveryDaysMin: 4, estimatedDeliveryDaysMax: 8,
        }] }
      : { rows: [] });
    const baseUrl = await startServer(true);
    const response = await fetch(`${baseUrl}?country=TR`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ success: true, products: [{ id: "product-1", title_en: "Product", deliveryCountries: ["TR"], estimatedDeliveryDaysMin: 4, estimatedDeliveryDaysMax: 8 }] });
    expect(JSON.stringify(data)).not.toMatch(/supplier_name|supplier_price|supplier_reference|source_product_url|shipping_cost/i);
    const sql = String(mocks.query.mock.calls.find(call => String(call[0]).includes("SELECT p.id"))?.[0]);
    expect(sql).toContain("s.status = 'active'");
    expect(sql).toContain("official_store_price_approvals");
    expect(sql).toContain("approval.status = 'active'");
    expect(sql).toContain("approval.destination_country = $1");
    expect(sql).toContain("offer.offer_status = 'approved'");
    expect(sql).toContain("offer.direct_to_customer_confirmed = TRUE");
    expect(sql).toContain("offer.supplier_identity_verified = TRUE");
    expect(sql).toContain("offer.specifications_verified = TRUE");
    expect(sql).toContain("offer.minimum_order_quantity = 1");
    expect(sql).toContain("offer.quote_valid_until > NOW()");
    expect(sql).toContain("offer.last_verified_at IS NOT NULL");
    expect(sql).toContain('ARRAY[approval.destination_country] AS "deliveryCountries"');
    expect(sql).toContain('offer.estimated_shipping_days_min AS "estimatedDeliveryDaysMin"');
    expect(sql).toContain("offer.ships_to_countries @> to_jsonb");
    expect(sql).not.toContain("supplier_name");
    expect(sql).not.toContain("supplier_price");
    expect(sql).not.toContain("p.supplier_dropship_confirmed = TRUE");
  });

  it("requires a destination country before returning public prices", async () => {
    const baseUrl = await startServer(true);
    const response = await fetch(baseUrl);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("keeps the public catalogue read-only", async () => {
    const baseUrl = await startServer(true);
    const response = await fetch(baseUrl, { method: "POST" });
    expect(response.status).toBe(405);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
