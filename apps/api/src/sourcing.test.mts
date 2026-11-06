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

import { handleAcceptSupplierOffer, handleBuyerConfirmSourcingDelivery, handleSourcingOrderEvents, handleSupplierAvailability, handleSupplierOffer, handleSupplierSourcingOrders } from "./sourcing.mjs";

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


describe("buyer offer acceptance financial bounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: buyerId } });
    mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  });

  it("rejects totals above the order numeric precision before changing offer or request states", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "ROLLBACK" || sql === "COMMIT") return { rowCount: 0, rows: [] };
      if (sql.includes("FROM sourcing_requests WHERE id = $1 FOR UPDATE")) return { rowCount: 1, rows: [{
        id: requestId, buyer_user_id: buyerId, item_name: "Bulk item",
        description: null, specifications: {}, quantity: 2_147_483_647, unit: "pieces",
        destination_country_code: "TR", destination_city: "Istanbul",
        delivery_location_snapshot: {}, requested_currency: "USD", status: "offers_available",
      }] };
      if (sql.includes("FROM sourcing_orders WHERE buyer_user_id")) return { rowCount: 0, rows: [] };
      if (sql.includes("FROM supplier_offers o")) return { rowCount: 1, rows: [{
        id: offerId, request_id: requestId, supplier_account_id: supplierAccountId,
        submitted_by_user_id: supplierUserId, origin_country_code: "TR",
        offered_quantity: 2_147_483_647, unit_price: "9999999999.9999",
        currency: "USD", shipping_amount: "0.00", lead_time_days: 3, status: "available",
        availability_confirmed_at: new Date().toISOString(), availability_valid_until: null,
        quote_valid_until: null, supplier_name: "Test Supplier",
        supplier_account_status: "active", supplier_account_type: "supplier", terms_snapshot: {},
      }] };
      if (sql.includes("FROM account_members am")) return { rowCount: 1, rows: [{ "?column?": 1 }] };
      if (sql.includes("AS exceeds_order_amount_limit")) return { rowCount: 1, rows: [{
        subtotal: "21474836469999999997.85", shipping_total: "0.00",
        grand_total: "21474836469999999997.85", exceeds_order_amount_limit: true,
      }] };
      return { rowCount: 1, rows: [] };
    });
    const response = makeResponse();

    await handleAcceptSupplierOffer(makeRequest(), response as unknown as ServerResponse, requestId);

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      error: "Offer total exceeds the supported order amount limit",
    });
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements.some(sql => sql.includes("UPDATE supplier_offers"))).toBe(false);
    expect(statements.some(sql => sql.includes("UPDATE sourcing_requests"))).toBe(false);
    expect(statements.some(sql => sql.includes("INSERT INTO sourcing_orders"))).toBe(false);
  });
});


describe("supplier availability update safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: supplierUserId } });
    mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  });

  function availabilityRequest(body: Record<string, unknown>): IncomingMessage {
    const request = Readable.from([JSON.stringify(body)]) as IncomingMessage;
    Object.assign(request, { method: "PATCH", headers: {} });
    return request;
  }

  it("locks the offer, active membership, account and request before updating availability", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (["BEGIN", "ROLLBACK", "COMMIT"].includes(sql)) return { rowCount: 0, rows: [] };
      if (sql.includes("SELECT o.id") && sql.includes("FOR UPDATE OF o")) {
        return { rowCount: 1, rows: [{ id: offerId }] };
      }
      if (sql.includes("UPDATE supplier_offers o")) return { rowCount: 1, rows: [{
        id: offerId, request_id: requestId, status: "available",
        availability_confirmed_at: new Date().toISOString(),
        availability_valid_until: null, quote_valid_until: null,
      }] };
      return { rowCount: 1, rows: [] };
    });
    const response = makeResponse();

    await handleSupplierAvailability(
      availabilityRequest({ availability: "available" }),
      response as unknown as ServerResponse,
      offerId,
    );

    expect(response.statusCode).toBe(200);
    const lock = mocks.clientQuery.mock.calls.map(([sql]) => String(sql))
      .find(sql => sql.includes("SELECT o.id") && sql.includes("FOR UPDATE OF o"));
    expect(lock).toContain("FOR SHARE OF am, a, sr");
    const updateCall = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes("UPDATE supplier_offers o"));
    expect(String(updateCall?.[0])).toContain("CASE WHEN $6 THEN $2 ELSE o.availability_valid_until END");
    expect(String(updateCall?.[0])).toContain("CASE WHEN $7 THEN $3 ELSE o.quote_valid_until END");
    expect(updateCall?.[1]?.[5]).toBe(false);
    expect(updateCall?.[1]?.[6]).toBe(false);
    expect(mocks.clientQuery.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("allows an explicit null to clear previously stored validity dates", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (["BEGIN", "ROLLBACK", "COMMIT"].includes(sql)) return { rowCount: 0, rows: [] };
      if (sql.includes("SELECT o.id") && sql.includes("FOR UPDATE OF o")) return { rowCount: 1, rows: [{ id: offerId }] };
      if (sql.includes("UPDATE supplier_offers o")) return { rowCount: 1, rows: [{
        id: offerId, request_id: requestId, status: "available",
        availability_confirmed_at: new Date().toISOString(),
        availability_valid_until: null, quote_valid_until: null,
      }] };
      return { rowCount: 1, rows: [] };
    });
    const response = makeResponse();

    await handleSupplierAvailability(
      availabilityRequest({ availability: "available", availabilityValidUntil: null, quoteValidUntil: null }),
      response as unknown as ServerResponse,
      offerId,
    );

    const updateCall = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes("UPDATE supplier_offers o"));
    expect(response.statusCode).toBe(200);
    expect(updateCall?.[1]?.[5]).toBe(true);
    expect(updateCall?.[1]?.[6]).toBe(true);
    expect(updateCall?.[1]?.[1]).toBeNull();
    expect(updateCall?.[1]?.[2]).toBeNull();
  });

  it("rejects expired validity dates before opening a transaction", async () => {
    const response = makeResponse();
    await handleSupplierAvailability(
      availabilityRequest({ availability: "available", availabilityValidUntil: "2000-01-01T00:00:00.000Z" }),
      response as unknown as ServerResponse,
      offerId,
    );
    expect(response.statusCode).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});


describe("supplier fulfilment transition lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: supplierUserId } });
    mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  });

  it("records shipment transition and tracking details atomically", async () => {
    const request = Readable.from([JSON.stringify({
      status: "shipped", trackingReference: "TRACK-12345", carrier: "Example Carrier",
    })]) as IncomingMessage;
    Object.assign(request, { method: "PATCH", headers: {} });
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (["BEGIN", "ROLLBACK", "COMMIT"].includes(sql)) return { rowCount: 0, rows: [] };
      if (sql.includes("FROM sourcing_orders so WHERE so.id = $1 FOR UPDATE")) return { rowCount: 1, rows: [{
        id: "00000000-0000-4000-8000-000000000060", request_id: requestId,
        supplier_account_id: supplierAccountId, status: "fulfilment_pending", buyer_user_id: buyerId,
      }] };
      if (sql.includes("FROM account_members am")) return { rowCount: 1, rows: [{ "?column?": 1 }] };
      return { rowCount: 1, rows: [] };
    });
    const response = makeResponse();

    await handleSupplierSourcingOrders(
      request, response as unknown as ServerResponse,
      "00000000-0000-4000-8000-000000000060",
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ success: true, order: { status: "shipped" } });
    const calls = mocks.clientQuery.mock.calls;
    const event = calls.find(([sql]) => String(sql).includes("INSERT INTO sourcing_order_events"));
    expect(event?.[1]?.[2]).toBe("fulfilment_pending");
    expect(event?.[1]?.[3]).toBe("shipped");
    expect(String(event?.[1]?.[4])).toContain("TRACK-12345");
    expect(calls.at(-1)?.[0]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});


describe("sourcing order event history access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: buyerId } });
    mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  });

  function historyRequest(): IncomingMessage {
    const request = Readable.from([]) as IncomingMessage;
    Object.assign(request, { method: "GET", headers: {} });
    return request;
  }

  it("returns an empty history for an authorized order using one scoped query", async () => {
    mocks.clientQuery.mockResolvedValue({ rowCount: 1, rows: [{ id: null }] });
    const response = makeResponse();
    await handleSourcingOrderEvents(
      historyRequest(), response as unknown as ServerResponse,
      "00000000-0000-4000-8000-000000000060",
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ success: true, events: [] });
    expect(mocks.clientQuery).toHaveBeenCalledOnce();
    const sql = String(mocks.clientQuery.mock.calls[0][0]);
    expect(sql).toContain("LEFT JOIN sourcing_order_events");
    expect(sql).toContain("so.buyer_user_id = $2");
    expect(sql).toContain("am.status = 'active'");
  });

  it("returns not found when the order is absent or outside the caller's access scope", async () => {
    mocks.clientQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    const response = makeResponse();
    await handleSourcingOrderEvents(
      historyRequest(), response as unknown as ServerResponse,
      "00000000-0000-4000-8000-000000000060",
    );
    expect(response.statusCode).toBe(404);
    expect(mocks.clientQuery).toHaveBeenCalledOnce();
  });
});
