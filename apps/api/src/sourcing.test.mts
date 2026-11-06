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

import { handleAcceptSupplierOffer, handleBuyerConfirmSourcingDelivery, handleSupplierOffer, handleSupplierSourcingOrders } from "./sourcing.mjs";

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


describe("buyer sourcing delivery confirmation lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: buyerId } });
    mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  });

  function deliveryRequest(): IncomingMessage {
    const request = Readable.from([]) as IncomingMessage;
    Object.assign(request, { method: "POST", headers: {} });
    return request;
  }

  function mockLockedOrder(status: string, owner = buyerId) {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "ROLLBACK" || sql === "COMMIT") return { rowCount: 0, rows: [] };
      if (sql.includes("FROM sourcing_orders WHERE id = $1 FOR UPDATE")) {
        return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000060", request_id: requestId, status, buyer_user_id: owner }] };
      }
      return { rowCount: 1, rows: [] };
    });
  }

  it("confirms only a shipped order and writes both audit events in the same transaction", async () => {
    mockLockedOrder("shipped");
    const response = makeResponse();

    await handleBuyerConfirmSourcingDelivery(
      deliveryRequest(), response as unknown as ServerResponse,
      "00000000-0000-4000-8000-000000000060",
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ success: true, order: { status: "completed" } });
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements.some(sql => sql.includes("UPDATE sourcing_orders SET status = 'completed'"))).toBe(true);
    expect(statements.some(sql => sql.includes("buyer.delivery_confirmed"))).toBe(true);
    expect(statements.some(sql => sql.includes("sourcing_order.delivery_confirmed"))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("rejects confirmation before shipment without writing audit events", async () => {
    mockLockedOrder("awaiting_payment");
    const response = makeResponse();

    await handleBuyerConfirmSourcingDelivery(
      deliveryRequest(), response as unknown as ServerResponse,
      "00000000-0000-4000-8000-000000000060",
    );

    expect(response.statusCode).toBe(409);
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements.some(sql => sql.includes("INSERT INTO sourcing_order_events"))).toBe(false);
    expect(statements.some(sql => sql.includes("INSERT INTO sourcing_request_events"))).toBe(false);
  });

  it("replays completed confirmation without duplicating audit events", async () => {
    mockLockedOrder("completed");
    const response = makeResponse();

    await handleBuyerConfirmSourcingDelivery(
      deliveryRequest(), response as unknown as ServerResponse,
      "00000000-0000-4000-8000-000000000060",
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ success: true, replayed: true, order: { status: "completed" } });
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements.at(-1)).toBe("COMMIT");
    expect(statements.some(sql => sql.includes("UPDATE sourcing_orders"))).toBe(false);
    expect(statements.some(sql => sql.includes("INSERT INTO sourcing_order_events"))).toBe(false);
  });

  it("does not disclose or confirm another buyer's order", async () => {
    mockLockedOrder("shipped", supplierUserId);
    const response = makeResponse();

    await handleBuyerConfirmSourcingDelivery(
      deliveryRequest(), response as unknown as ServerResponse,
      "00000000-0000-4000-8000-000000000060",
    );

    expect(response.statusCode).toBe(404);
    expect(mocks.clientQuery.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
});


describe("buyer offer acceptance idempotency scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: buyerId } });
    mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  });

  it("rejects reuse of an idempotency key for another request or offer", async () => {
    const otherRequestId = "00000000-0000-4000-8000-000000000099";
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "ROLLBACK" || sql === "COMMIT") return { rowCount: 0, rows: [] };
      if (sql.includes("FROM sourcing_requests WHERE id = $1 FOR UPDATE")) {
        return { rowCount: 1, rows: [{
          id: requestId, buyer_user_id: buyerId, item_name: "Test item",
          description: null, specifications: {}, quantity: 2, unit: "pieces",
          destination_country_code: "TR", destination_city: "Istanbul",
          delivery_location_snapshot: {}, requested_currency: "USD", status: "offers_available",
        }] };
      }
      if (sql.includes("FROM sourcing_orders WHERE buyer_user_id")) {
        return { rowCount: 1, rows: [{
          id: "00000000-0000-4000-8000-000000000070",
          request_id: otherRequestId, accepted_offer_id: offerId,
          status: "awaiting_payment",
        }] };
      }
      return { rowCount: 0, rows: [] };
    });
    const response = makeResponse();

    await handleAcceptSupplierOffer(makeRequest(), response as unknown as ServerResponse, requestId);

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      error: "Idempotency key was already used for a different offer or request",
    });
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements.some(sql => sql.includes("INSERT INTO sourcing_orders"))).toBe(false);
  });
});


describe("supplier offer submission membership locking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: supplierUserId } });
    mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "ROLLBACK" || sql === "COMMIT") return { rowCount: 0, rows: [] };
      if (sql.includes("FROM account_members am")) return { rowCount: 1, rows: [{
        id: supplierAccountId, account_type: "supplier", status: "active", country_code: "TR",
      }] };
      if (sql.includes("FROM sourcing_requests WHERE id = $1 FOR UPDATE")) return { rowCount: 1, rows: [{
        id: requestId, buyer_user_id: buyerId, quantity: 2, unit: "pieces",
        status: "submitted", destination_country_code: "TR",
      }] };
      if (sql.includes("INSERT INTO supplier_offers")) return { rowCount: 1, rows: [{
        id: offerId, request_id: requestId, supplier_account_id: supplierAccountId,
        origin_country_code: "TR", offered_quantity: 2, unit_price: "10.00",
        currency: "USD", shipping_amount: "2.00", lead_time_days: 3,
        status: "availability_pending", created_at: new Date().toISOString(),
      }] };
      return { rowCount: 1, rows: [] };
    });
  });

  it("share-locks the active supplier account membership during offer creation", async () => {
    const request = Readable.from([JSON.stringify({
      supplierAccountId, offeredQuantity: 2, unitPrice: "10.00",
      currency: "USD", shippingAmount: "2.00", leadTimeDays: 3,
    })]) as IncomingMessage;
    Object.assign(request, { method: "POST", headers: {} });
    const response = makeResponse();

    await handleSupplierOffer(request, response as unknown as ServerResponse, requestId);

    expect(response.statusCode).toBe(201);
    const membershipQuery = mocks.clientQuery.mock.calls
      .map(([sql]) => String(sql))
      .find(sql => sql.includes("FROM account_members am"));
    expect(membershipQuery).toContain("FOR SHARE OF am, a");
    expect(mocks.clientQuery.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
