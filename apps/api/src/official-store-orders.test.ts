import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), query: vi.fn() }));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: mocks.authorize }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query }) }));

let handleOfficialStoreOrdersRequest: (
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  orderId?: string,
) => Promise<void>;
let server: Server | undefined;

async function startServer(orderId?: string): Promise<string> {
  server = createServer((request, response) => {
    void handleOfficialStoreOrdersRequest(request, response, orderId);
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
  ({ handleOfficialStoreOrdersRequest } = await import("./official-store-orders.mjs"));
  mocks.authorize.mockResolvedValue({ userId: "platform-owner" });
});

afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.resetAllMocks();
});

describe("official store order desk", () => {
  it("requires platform management permission before reading order data", async () => {
    mocks.authorize.mockImplementationOnce((_request, response) => {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ success: false, error: "Forbidden" }));
      return null;
    });
    const baseUrl = await startServer();
    const response = await fetch(baseUrl);
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("lists only a bounded set of owner-visible order fields and is explicitly read-only", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "order-1", orderStatus: "awaiting_supplier" }] });
    const baseUrl = await startServer();
    const response = await fetch(baseUrl);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toMatchObject({ success: true, readOnly: true, orders: [{ id: "order-1" }] });
    expect(String(mocks.query.mock.calls[0][0])).toContain("LIMIT 100");
    expect(String(mocks.query.mock.calls[0][0])).toContain("supplier_purchase_status");
  });

  it("returns the order event history for a valid order identifier", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: "11111111-1111-4111-8111-111111111111", orderStatus: "awaiting_supplier" }] })
      .mockResolvedValueOnce({ rows: [{ eventType: "created", actorType: "system" }] });
    const baseUrl = await startServer("11111111-1111-4111-8111-111111111111");
    const response = await fetch(baseUrl);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toMatchObject({ success: true, readOnly: true, events: [{ eventType: "created" }] });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("rejects write methods without touching the database", async () => {
    const baseUrl = await startServer();
    const response = await fetch(baseUrl, { method: "POST" });
    expect(response.status).toBe(405);
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
