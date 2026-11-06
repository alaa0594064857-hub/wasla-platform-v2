
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createWaslaServer } from "./server";
import { checkDatabaseConnection } from "./database.js";

vi.mock("./database.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./database.js")>();

  return {
    ...actual,
    checkDatabaseConnection: vi.fn(),
  };
});

let server: Server | undefined;

async function startTestServer(): Promise<string> {
  server = createWaslaServer();

  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Could not determine test server address");
  }

  return `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  vi.mocked(checkDatabaseConnection).mockResolvedValue(true);
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  server = undefined;
  vi.clearAllMocks();
});

describe("WASLA API", () => {
  it("returns healthy status from GET /health", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      service: "WASLA API",
      status: "healthy",
    });
  });

  it("rejects unsupported methods on /health", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/health`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({
      success: false,
      error: "Method not allowed",
    });
  });

  it("returns ready status when the database connection succeeds", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/ready`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      service: "WASLA API",
      status: "ready",
      database: "connected",
    });
    expect(checkDatabaseConnection).toHaveBeenCalledOnce();
  });

  it("returns 503 when the database connection fails", async () => {
    vi.mocked(checkDatabaseConnection).mockRejectedValueOnce(
      new Error("Database unavailable"),
    );

    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/ready`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      service: "WASLA API",
      status: "not_ready",
      database: "unavailable",
    });
  });

  it("rejects unsupported methods on /ready", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/ready`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({
      success: false,
      error: "Method not allowed",
    });
    expect(checkDatabaseConnection).not.toHaveBeenCalled();
  });

  it("responds to the Better Auth health endpoint", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/auth/ok`);

    expect(response.status).toBe(200);
  });

  it("requires authentication for inventory movement history", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(
      `${baseUrl}/api/stores/sample-shop/products/00000000-0000-4000-8000-000000000001/inventory-movements`,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Authentication required",
    });
  });

  it("rejects unsupported methods on inventory movement routes", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(
      `${baseUrl}/api/stores/sample-shop/products/00000000-0000-4000-8000-000000000001/inventory-movements`,
      { method: "PATCH" },
    );

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({
      success: false,
      error: "Method not allowed",
    });
  });

  it("requires authentication to create or list sourcing requests", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/sourcing-requests`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Authentication required",
    });
  });

  it("requires authentication before buyer delivery confirmation", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/sourcing-orders/00000000-0000-4000-8000-000000000001/confirm-delivery`, { method: "POST" });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Authentication required" });
  });

  it("validates sourcing order IDs before buyer delivery confirmation", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/sourcing-orders/not-a-uuid/confirm-delivery`, { method: "POST" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Invalid sourcing order ID" });
  });

  it("requires authentication to read sourcing order history", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/sourcing-orders/00000000-0000-4000-8000-000000000001/events`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Authentication required" });
  });

  it("validates sourcing order history IDs", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/sourcing-orders/not-a-uuid/events`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Invalid sourcing order ID" });
  });

  it("requires authentication to list supplier sourcing orders", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/supplier/sourcing-orders`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Authentication required" });
  });

  it("requires authentication before supplier order status updates", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(
      `${baseUrl}/api/supplier/sourcing-orders/00000000-0000-4000-8000-000000000001/status`,
      { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "shipped", trackingReference: "TRACK-123" }) },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Authentication required" });
  });

  it("validates supplier sourcing order IDs before status changes", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/supplier/sourcing-orders/not-a-uuid/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shipped", trackingReference: "TRACK-123" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Invalid sourcing order ID" });
  });

  it("requires authentication to discover supplier opportunities", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/sourcing-opportunities`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Authentication required",
    });
  });

  it("validates sourcing request identifiers before loading details", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/sourcing-requests/not-a-uuid`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid request ID",
    });
  });

  it("requires authentication before accepting a supplier offer", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(
      `${baseUrl}/api/sourcing-requests/00000000-0000-4000-8000-000000000001/accept-offer`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerId: "00000000-0000-4000-8000-000000000002", idempotencyKey: "accept-offer-test-1" }) },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Authentication required",
    });
  });

  it("validates supplier offer identifiers before availability updates", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/sourcing-offers/not-a-uuid/availability`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ availability: "available" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid offer ID",
    });
  });

  it("requires authentication to list or create message conversations", async () => {
    const baseUrl = await startTestServer();
    const listResponse = await fetch(`${baseUrl}/api/messages`);
    expect(listResponse.status).toBe(401);
    expect(await listResponse.json()).toEqual({ success: false, error: "Authentication required" });

    const createResponse = await fetch(`${baseUrl}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientUserId: "00000000-0000-4000-8000-000000000002" }),
    });
    expect(createResponse.status).toBe(401);
    expect(await createResponse.json()).toEqual({ success: false, error: "Authentication required" });
  });

  it("requires authentication to read or send conversation messages", async () => {
    const baseUrl = await startTestServer();
    const conversationId = "00000000-0000-4000-8000-000000000001";
    const readResponse = await fetch(`${baseUrl}/api/messages/${conversationId}`);
    expect(readResponse.status).toBe(401);
    expect(await readResponse.json()).toEqual({ success: false, error: "Authentication required" });

    const sendResponse = await fetch(`${baseUrl}/api/messages/${conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Hello" }),
    });
    expect(sendResponse.status).toBe(401);
    expect(await sendResponse.json()).toEqual({ success: false, error: "Authentication required" });
  });

  it("validates conversation IDs before accessing messages", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/messages/not-a-uuid`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Invalid conversation ID" });
  });

  it("requires authentication to list or create Trade deals", async () => {
    const baseUrl = await startTestServer();
    const listResponse = await fetch(`${baseUrl}/api/trade-deals`);
    expect(listResponse.status).toBe(401);
    expect(await listResponse.json()).toEqual({ success: false, error: "Authentication required" });

    const createResponse = await fetch(`${baseUrl}/api/trade-deals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourcingOrderId: "00000000-0000-4000-8000-000000000001",
        termsSnapshot: { delivery: "Agreed separately" },
      }),
    });
    expect(createResponse.status).toBe(401);
    expect(await createResponse.json()).toEqual({ success: false, error: "Authentication required" });
  });

  it("validates Trade deal IDs and requires authentication for responses", async () => {
    const baseUrl = await startTestServer();
    const invalidDetail = await fetch(`${baseUrl}/api/trade-deals/not-a-uuid`);
    expect(invalidDetail.status).toBe(400);
    expect(await invalidDetail.json()).toEqual({ success: false, error: "Invalid deal ID" });

    const response = await fetch(`${baseUrl}/api/trade-deals/00000000-0000-4000-8000-000000000001/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Authentication required" });
  });

  it("requires authentication for Trade amendments and milestones", async () => {
    const baseUrl = await startTestServer();
    const dealId = "00000000-0000-4000-8000-000000000001";
    const amendment = await fetch(`${baseUrl}/api/trade-deals/${dealId}/amendments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ termsSnapshot: { delivery: "Updated" } }),
    });
    expect(amendment.status).toBe(401);
    expect(await amendment.json()).toEqual({ success: false, error: "Authentication required" });

    const milestone = await fetch(`${baseUrl}/api/trade-deals/${dealId}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Inspection" }),
    });
    expect(milestone.status).toBe(401);
    expect(await milestone.json()).toEqual({ success: false, error: "Authentication required" });
  });

  it("validates Trade amendment and milestone identifiers", async () => {
    const baseUrl = await startTestServer();
    const amendment = await fetch(`${baseUrl}/api/trade-deals/not-a-uuid/amendments`, { method: "POST" });
    expect(amendment.status).toBe(400);
    expect(await amendment.json()).toEqual({ success: false, error: "Invalid deal or amendment ID" });

    const milestone = await fetch(`${baseUrl}/api/trade-deals/not-a-uuid/milestones/not-a-uuid`, { method: "PATCH" });
    expect(milestone.status).toBe(400);
    expect(await milestone.json()).toEqual({ success: false, error: "Invalid deal or milestone ID" });
  });

  it("returns 404 for unknown routes", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/unknown`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Route not found",
    });
  });
});
