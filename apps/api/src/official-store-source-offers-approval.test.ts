import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), connect: vi.fn(), clientQuery: vi.fn(), release: vi.fn() }));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: mocks.authorize }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ connect: mocks.connect }) }));

let handleOfficialStoreSourceOffersRequest: (
  request: IncomingMessage, response: ServerResponse, offerId?: string
) => Promise<void>;
let server: Server | undefined;

async function startServer(offerId: string): Promise<string> {
  server = createServer((request, response) => {
    void handleOfficialStoreSourceOffersRequest(request, response, offerId);
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
  ({ handleOfficialStoreSourceOffersRequest } = await import("./official-store-source-offers.mjs"));
  mocks.authorize.mockResolvedValue({ userId: "platform-owner" });
  mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  }
  server = undefined;
  vi.resetAllMocks();
});

describe("official store source offer approval", () => {
  it("blocks approval until supplier identity, exact specifications, evidence, direct shipping and quote are verified", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "offer-id",
          product_id: "product-id",
          offer_status: "needs_review",
          supplier_identity_verified: false,
          specifications_verified: false,
          direct_to_customer_confirmed: false,
          minimum_order_quantity: null,
          availability_status: "needs_confirmation",
          quote_valid_until: null,
          evidence: [],
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const baseUrl = await startServer("11111111-1111-4111-8111-111111111111");
    const response = await fetch(baseUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerStatus: "approved" }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.clientQuery.mock.calls[0][0]).toBe("BEGIN");
    expect(String(mocks.clientQuery.mock.calls[1][0])).toContain("FOR UPDATE");
    expect(mocks.clientQuery.mock.calls[2][0]).toBe("ROLLBACK");
    expect(mocks.clientQuery).toHaveBeenCalledTimes(3);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("does not permit approval in the same request as material offer changes", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: "offer-id", product_id: "product-id", offer_status: "approved",
        supplier_identity_verified: true, specifications_verified: true,
        direct_to_customer_confirmed: true, minimum_order_quantity: 1,
        availability_status: "available", quote_valid_until: "2026-12-01T00:00:00Z",
        evidence: [{ type: "supplier_evidence_url" }, { type: "product_specification" }],
      }] })
      .mockResolvedValueOnce({ rows: [] });
    const baseUrl = await startServer("11111111-1111-4111-8111-111111111111");
    const response = await fetch(baseUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerStatus: "approved", supplierPrice: 9.99 }),
    });

    expect(response.status).toBe(409);
    expect(mocks.clientQuery.mock.calls[2][0]).toBe("ROLLBACK");
    expect(mocks.clientQuery).toHaveBeenCalledTimes(3);
  });
});
