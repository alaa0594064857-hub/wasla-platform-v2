import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), query: vi.fn(), connect: vi.fn() }));
vi.mock("./auth.mjs", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query, connect: mocks.connect }) }));

let handleProductInquiriesRequest: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
let server: Server | undefined;

async function startServer(): Promise<string> {
  server = createServer((request, response) => { void handleProductInquiriesRequest(request, response); });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  ({ handleProductInquiriesRequest } = await import("./product-inquiries.mjs"));
  mocks.getSession.mockResolvedValue({ user: { id: "signed-in-user" } });
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  }
  server = undefined;
  vi.resetAllMocks();
});

describe("private product inquiry access", () => {
  it("considers store and account administrators when resolving an inquiry recipient", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ product_id: "11111111-1111-4111-8111-111111111111", recipient_user_id: null }] });
    const base = await startServer();
    const response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "11111111-1111-4111-8111-111111111111", message: "Is this product available?" }),
    });

    expect(response.status).toBe(404);
    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("COALESCE(store_owner.user_id, store_admin.user_id, store_manager.user_id");
    expect(sql).toContain(") account_admin ON TRUE");
    expect(sql).toContain("r.name = 'store_admin'");
    expect(sql).toContain("r.name = 'account_admin'");
  });

  it("does not expose inquiry replies to users outside the inquiry", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/product-inquiries/11111111-1111-4111-8111-111111111111/replies`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: "Inquiry not found" });
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.query.mock.calls[0][1]).toEqual(["11111111-1111-4111-8111-111111111111", "signed-in-user"]);
    expect(String(mocks.query.mock.calls[0][0])).toContain("sender_user_id = $2 OR recipient_user_id = $2");
  });

  it("locks the open inquiry inside the reply transaction before inserting a reply", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "11111111-1111-4111-8111-111111111111", sender_user_id: "customer-user" }] }) // locked inquiry
      .mockResolvedValueOnce({ rows: [{ id: "reply-1", senderUserId: "seller-user", body: "Yes, available." }] })
      .mockResolvedValueOnce({ rows: [] }) // status update
      .mockResolvedValueOnce({ rows: [] }) // notification
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/product-inquiries/11111111-1111-4111-8111-111111111111/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Yes, available." }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, reply: { id: "reply-1" } });
    expect(String(client.query.mock.calls[1][0])).toContain("FOR UPDATE");
    expect(String(client.query.mock.calls[1][0])).toContain("status <> 'closed'");
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("does not insert a reply when the inquiry was closed before the transaction acquired its lock", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // no longer open
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/product-inquiries/11111111-1111-4111-8111-111111111111/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "A reply after closure." }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: "Open inquiry not found for this seller" });
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[2][0]).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("returns 413 when an inquiry request body exceeds the size limit", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/product-inquiries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(12_001),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ success: false, error: "Request body too large" });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("allows only the assigned seller recipient to change inquiry status", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/product-inquiries/11111111-1111-4111-8111-111111111111/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: "Inquiry not found for this seller" });
    expect(mocks.query.mock.calls[0][1]).toEqual(["11111111-1111-4111-8111-111111111111", "signed-in-user", "closed"]);
    expect(String(mocks.query.mock.calls[0][0])).toContain("recipient_user_id = $2");
  });

  it("limits the inquiry inbox to the signed-in seller", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(baseUrl);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, inquiries: [] });
    expect(mocks.query.mock.calls[0][1]).toEqual(["signed-in-user"]);
    expect(String(mocks.query.mock.calls[0][0])).toContain("WHERE i.recipient_user_id = $1");
  });
});
