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
  getDatabasePool: () => ({
    query: mocks.poolQuery,
    connect: mocks.connect,
  }),
}));

import { handleInventoryMovementsRequest } from "./inventory-movements.mjs";

const userId = "00000000-0000-4000-8000-000000000010";
const productId = "00000000-0000-4000-8000-000000000020";
const storeId = "00000000-0000-4000-8000-000000000030";
const accountId = "00000000-0000-4000-8000-000000000040";
const movementId = "00000000-0000-4000-8000-000000000050";

function makeRequest(body: Record<string, unknown>): IncomingMessage {
  const request = Readable.from([JSON.stringify(body)]) as IncomingMessage;
  Object.assign(request, {
    method: "POST",
    headers: {},
  });
  return request;
}

function makeResponse() {
  const response = {
    statusCode: 0,
    body: "",
    writeHead(status: number) {
      this.statusCode = status;
      return this;
    },
    end(body: string) {
      this.body = body;
      return this;
    },
  };
  return response;
}

function setupProductLock(quantityBefore: number) {
  mocks.clientQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT p.id")) {
      return {
        rowCount: 1,
        rows: [{ id: productId, storeId, accountId, quantityBefore }],
      };
    }
    if (sql.includes("INSERT INTO store_inventory_movements")) {
      return {
        rowCount: 1,
        rows: [{
          id: movementId,
          productId,
          movementType: "outbound",
          quantityDelta: -3,
          quantityBefore,
          quantityAfter: quantityBefore - 3,
          reason: "Customer order",
          referenceCode: null,
          actorUserId: userId,
          createdAt: "2026-11-06T10:00:00.000Z",
        }],
      };
    }
    return { rowCount: 1, rows: [] };
  });
}

describe("inventory movement transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.connect.mockResolvedValue({
      query: mocks.clientQuery,
      release: mocks.release,
    });
  });

  it("updates stock, writes the movement and audit record, then commits", async () => {
    setupProductLock(8);
    const response = makeResponse();

    await handleInventoryMovementsRequest(
      makeRequest({
        movementType: "outbound",
        quantityDelta: -3,
        reason: "Customer order",
      }),
      response as unknown as ServerResponse,
      "sample-shop",
      productId,
    );

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toMatchObject({
      success: true,
      stockQuantity: 5,
      movement: { quantityBefore: 8, quantityAfter: 5, quantityDelta: -3 },
    });
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toBe("BEGIN");
    expect(statements.some((sql) => sql.includes("UPDATE store_products"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO store_inventory_movements"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO audit_logs"))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("rejects an outbound movement larger than available stock without writing records", async () => {
    setupProductLock(2);
    const response = makeResponse();

    await handleInventoryMovementsRequest(
      makeRequest({
        movementType: "outbound",
        quantityDelta: -3,
        reason: "Customer order",
      }),
      response as unknown as ServerResponse,
      "sample-shop",
      productId,
    );

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({ success: false });
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements).toEqual(["BEGIN", expect.stringContaining("SELECT p.id"), "ROLLBACK"]);
    expect(statements.some((sql) => sql.includes("UPDATE store_products"))).toBe(false);
    expect(statements.some((sql) => sql.includes("INSERT INTO store_inventory_movements"))).toBe(false);
    expect(statements.some((sql) => sql.includes("INSERT INTO audit_logs"))).toBe(false);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("rolls back the stock update and movement if the audit insert fails", async () => {
    setupProductLock(8);
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT p.id")) {
        return {
          rowCount: 1,
          rows: [{ id: productId, storeId, accountId, quantityBefore: 8 }],
        };
      }
      if (sql.includes("INSERT INTO store_inventory_movements")) {
        return {
          rowCount: 1,
          rows: [{
            id: movementId,
            productId,
            movementType: "outbound",
            quantityDelta: -3,
            quantityBefore: 8,
            quantityAfter: 5,
            reason: "Customer order",
            referenceCode: null,
            actorUserId: userId,
            createdAt: "2026-11-06T10:00:00.000Z",
          }],
        };
      }
      if (sql.includes("INSERT INTO audit_logs")) {
        throw new Error("Audit storage unavailable");
      }
      return { rowCount: 1, rows: [] };
    });
    const response = makeResponse();

    await handleInventoryMovementsRequest(
      makeRequest({
        movementType: "outbound",
        quantityDelta: -3,
        reason: "Customer order",
      }),
      response as unknown as ServerResponse,
      "sample-shop",
      productId,
    );

    expect(response.statusCode).toBe(500);
    const statements = mocks.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes("UPDATE store_products"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO store_inventory_movements"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO audit_logs"))).toBe(true);
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("rejects unauthenticated requests before opening a database transaction", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = makeResponse();

    await handleInventoryMovementsRequest(
      makeRequest({ movementType: "inbound", quantityDelta: 2, reason: "Restock" }),
      response as unknown as ServerResponse,
      "sample-shop",
      productId,
    );

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toMatchObject({ success: false });
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.clientQuery).not.toHaveBeenCalled();
  });

  it("rejects invalid movement quantities before opening a database transaction", async () => {
    const response = makeResponse();

    await handleInventoryMovementsRequest(
      makeRequest({ movementType: "outbound", quantityDelta: 0, reason: "No change" }),
      response as unknown as ServerResponse,
      "sample-shop",
      productId,
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ success: false });
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.clientQuery).not.toHaveBeenCalled();
  });

});
