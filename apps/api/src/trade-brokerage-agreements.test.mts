import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  query: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
  authorizePlatformPermission: vi.fn(),
}));

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ query: mocks.query, connect: mocks.connect }),
}));

vi.mock("./platform-security.mjs", () => ({
  authorizePlatformPermission: mocks.authorizePlatformPermission,
}));

let handleBrokerageAgreements: (
  request: IncomingMessage,
  response: ServerResponse,
  agreementId?: string,
) => Promise<void>;
let server: Server | undefined;

async function startServer(agreementId?: string): Promise<string> {
  server = createServer((request, response) => {
    void handleBrokerageAgreements(request, response, agreementId);
  });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

const agreement = {
  id: "33333333-3333-4333-8333-333333333333",
  buyer_account_id: "11111111-1111-4111-8111-111111111111",
  supplier_account_id: "22222222-2222-4222-8222-222222222222",
  status: "pending_acceptance",
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  buyer_accepted_at: null,
  supplier_accepted_at: null,
};

beforeEach(async () => {
  ({ handleBrokerageAgreements } = await import("./trade-brokerage-agreements.mjs"));
  mocks.getSession.mockResolvedValue({ user: { id: "trade-party-user" } });
  mocks.authorizePlatformPermission.mockResolvedValue(true);
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
  }
  server = undefined;
  vi.resetAllMocks();
});

describe("WASLA Trade brokerage agreement access and acceptance", () => {
  it("rejects unauthenticated agreement requests without reading agreement data", async () => {
    mocks.getSession.mockResolvedValueOnce(null);

    const baseUrl = await startServer(agreement.id);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/${agreement.id}`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Authentication required" });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("prevents a user outside both business accounts from accepting brokerage terms", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [agreement] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({});

    const baseUrl = await startServer(agreement.id);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/${agreement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", accountId: agreement.buyer_account_id }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("records the first party acceptance without activating the agreement or collecting payment", async () => {
    const accepted = { ...agreement, buyer_accepted_at: new Date().toISOString(), buyer_accepted_by: "trade-party-user" };
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [agreement] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [accepted] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const baseUrl = await startServer(agreement.id);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/${agreement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", accountId: agreement.buyer_account_id }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, agreement: { status: "pending_acceptance" } });
    expect(String(mocks.query.mock.calls[4][0])).toContain("buyer_accepted_at");
    expect(String(mocks.query.mock.calls[5][0])).toContain("trade_brokerage_agreement_events");
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).toLowerCase().includes("payment"))).toBe(false);
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("activates the agreement only after the second distinct party accepts", async () => {
    const alreadyAccepted = { ...agreement, buyer_accepted_at: new Date().toISOString() };
    const active = { ...alreadyAccepted, supplier_accepted_at: new Date().toISOString(), status: "active" };
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [alreadyAccepted] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [active] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const baseUrl = await startServer(agreement.id);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/${agreement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", accountId: agreement.supplier_account_id }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, agreement: { status: "active" } });
    expect(String(mocks.query.mock.calls[4][0])).toContain("supplier_accepted_at");
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(mocks.query.mock.calls.some(([sql]) => /payment|charge|transfer/i.test(String(sql)))).toBe(false);
  });

  it("records rejection and prevents any acceptance update", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [agreement] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const baseUrl = await startServer(agreement.id);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/${agreement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", accountId: agreement.buyer_account_id, note: "Terms not accepted" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, status: "rejected" });
    expect(String(mocks.query.mock.calls[4][0])).toContain("status='rejected'");
    expect(String(mocks.query.mock.calls[5][0])).toContain("event_type");
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("buyer_accepted_at"))).toBe(false);
  });

  it("expires an overdue agreement and records the expiry event instead of accepting it", async () => {
    const overdue = { ...agreement, expires_at: new Date(Date.now() - 60_000).toISOString() };
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [overdue] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const baseUrl = await startServer(agreement.id);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/${agreement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", accountId: agreement.buyer_account_id }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, error: "This agreement has expired." });
    expect(String(mocks.query.mock.calls[4][0])).toContain("status='expired'");
    expect(String(mocks.query.mock.calls[5][0])).toContain("'expired'");
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("denies an inactive account member because the authorization query requires active membership and account status", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [agreement] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({});

    const baseUrl = await startServer(agreement.id);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/${agreement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", accountId: agreement.buyer_account_id }),
    });

    expect(response.status).toBe(403);
    expect(String(mocks.query.mock.calls[2][0])).toContain("a.status='active'");
    expect(String(mocks.query.mock.calls[2][0])).toContain("am.status='active'");
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });


  it("denies an active account member who lacks the trade-create permission", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [agreement] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({});

    const baseUrl = await startServer(agreement.id);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/${agreement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", accountId: agreement.buyer_account_id }),
    });

    expect(response.status).toBe(403);
    expect(String(mocks.query.mock.calls[2][0])).toContain("p.permission_key='account.trade.create'");
    expect(String(mocks.query.mock.calls[2][0])).toContain("am.status='active'");
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

});
