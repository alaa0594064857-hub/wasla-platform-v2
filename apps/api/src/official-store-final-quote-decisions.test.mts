import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), connect: vi.fn() }));
vi.mock("./auth.mjs", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ connect: mocks.connect }) }));

let handler: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse, id?: string) => Promise<void>;
let server: Server | undefined;
const orderId = "33333333-3333-4333-8333-333333333333";
const customerId = "customer-42";

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

beforeEach(async () => {
  ({ handleOfficialStoreFinalQuoteDecision: handler } = await import("./official-store-final-quotes.mjs"));
  mocks.getSession.mockResolvedValue({ user: { id: customerId } });
});

afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.resetAllMocks();
});

describe("official store customer final quote decisions", () => {
  it("does not disclose another customer's quote", async () => {
    const client = { query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: orderId, customer_user_id: "someone-else", final_quote_status: "pending_customer" }] }), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    const base = await startServer();
    const response = await fetch(base, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "accepted" }),
    });
    expect(response.status).toBe(404);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects a second decision after a quote has already been decided", async () => {
    const client = { query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: orderId, customer_user_id: customerId, final_quote_status: "accepted", final_quote_expires_at: new Date(Date.now() + 3600000) }] }), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    const base = await startServer();
    const response = await fetch(base, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "rejected" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false });
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO official_store_order_events"))).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("expires an overdue quote and records a system event without payment", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: orderId, customer_user_id: customerId, final_quote_status: "pending_customer", final_quote_expires_at: new Date(Date.now() - 1000) }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    const base = await startServer();
    const response = await fetch(base, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "accepted" }),
    });
    expect(response.status).toBe(409);
    expect(String(client.query.mock.calls[2][0])).toContain("final_quote_status = 'expired'");
    expect(String(client.query.mock.calls[3][0])).toContain("'final_quote_expired'");
    expect(String(client.query.mock.calls[3][0])).toContain('"paymentEnabled":false');
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("accepts only the authenticated customer's pending unexpired quote and never enables payment", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: orderId, customer_user_id: customerId, final_quote_status: "pending_customer", final_quote_expires_at: new Date(Date.now() + 3600000) }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    const base = await startServer();
    const response = await fetch(base, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "accepted" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, decision: "accepted", paymentEnabled: false });
    expect(String(client.query.mock.calls[2][0])).toContain("SET final_quote_status = $2");
    expect(client.query.mock.calls[2][1]).toEqual([orderId, "accepted"]);
    expect(client.query.mock.calls[3][1][2]).toBe("final_quote_accepted");
    expect(JSON.parse(client.query.mock.calls[3][1][3])).toMatchObject({
      decision: "accepted", paymentEnabled: false, supplierPurchasePlaced: false,
    });
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
