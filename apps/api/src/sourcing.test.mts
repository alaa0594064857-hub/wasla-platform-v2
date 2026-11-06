import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  connect: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
}));

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ connect: mocks.connect }),
}));

import { handleAcceptSupplierOffer, handleSupplierSourcingOrders } from "./sourcing.mjs";

const buyerId = "00000000-0000-4000-8000-000000000010";
const requestId = "00000000-0000-4000-8000-000000000020";
const offerId = "00000000-0000-4000-8000-000000000030";
const supplierAccountId = "00000000-0000-4000-8000-000000000040";
const supplierUserId = "00000000-0000-4000-8000-000000000050";

function makeRequest(): IncomingMessage {
  const request = Readable.from([JSON.stringify({
    offerId,
    idempotencyKey: "accept-offer-test-0001",
  })]) as IncomingMessage;
  Object.assign(request, {
    method: "POST",
    headers: { "idempotency-key": "accept-offer-test-0001" },
  });
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

describe("supplier offer acceptance authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: buyerId } });
    mocks.connect.mockResolvedValue({
      query: mocks.clientQuery,
      release: mocks.release,
    });
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "ROLLBACK" || sql === "COMMIT") {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("FROM sourcing_requests WHERE id = $1 FOR UPDATE")) {
        return { rowCount: 1, rows: [{
          id: requestId, buyer_user_id: buyerId, item_name: "Test item",
          description: null, specifications: {}, quantity: 2, unit: "pieces",
          destination_country_code: "TR", destination_city: "Istanbul",
          delivery_location_snapshot: {}, requested_currency: "USD", status: "offers_available",
        }] };
      }
      if (sql.includes("FROM sourcing_orders WHERE buyer_user_id")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("FROM supplier_offers o")) {
        return { rowCount: 1, rows: [{
          id: offerId, request_id: requestId, supplier_account_id: supplierAccountId,
          submitted_by_user_id: supplierUserId, origin_country_code: "TR",
          offered_quantity: 2, unit_price: "10.00", currency: "USD",
          shipping_amount: "2.00", lead_time_days: 3, status: "available",
          availability_confirmed_at: new Date().toISOString(),
          availability_valid_until: null, quote_valid_until: null,
          supplier_name: "Test Supplier", supplier_account_status: "active",
          supplier_account_type: "supplier", terms_snapshot: {},
        }] };
      }
      if (sql.includes("FROM account_members am")) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    });
  });

  it("rechecks and share-locks supplier membership before accepting the offer", async () => {
    const response = makeResponse();

    await handleAcceptSupplierOffer(
      makeRequest(),
      response as unknown as ServerResponse,
      requestId,
    );

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      error: "Supplier membership is no longer active",
    });
    const membershipCheck = mocks.clientQuery.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes("FROM account_members am"));
    expect(membershipCheck).toContain("FOR SHARE OF am, a");
    expect(mocks.clientQuery.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("does not open a transaction for an unauthenticated buyer", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = makeResponse();

    await handleAcceptSupplierOffer(
      makeRequest(),
      response as unknown as ServerResponse,
      requestId,
    );

    expect(response.statusCode).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});


describe("supplier payment-state protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: supplierUserId } });
  });

  it("does not allow suppliers to mark an order as paid", async () => {
    const request = Readable.from([JSON.stringify({ status: "paid" })]) as IncomingMessage;
    Object.assign(request, { method: "PATCH", headers: {} });
    const response = makeResponse();

    await handleSupplierSourcingOrders(
      request,
      response as unknown as ServerResponse,
      "00000000-0000-4000-8000-000000000060",
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      error: "Supplier status must be fulfilment_pending or shipped",
    });
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
