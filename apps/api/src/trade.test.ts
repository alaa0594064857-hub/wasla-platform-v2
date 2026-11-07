import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  query: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
}));

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ query: mocks.query, connect: mocks.connect }),
}));

let handleTradeRequest: (
  request: IncomingMessage,
  response: ServerResponse,
  dealId?: string,
) => Promise<void>;
let server: Server | undefined;

async function startServer(dealId?: string): Promise<string> {
  server = createServer((request, response) => {
    void handleTradeRequest(request, response, dealId);
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
  ({ handleTradeRequest } = await import("./trade.mjs"));
  mocks.getSession.mockResolvedValue({ user: { id: "trade-creator" } });
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

describe("WASLA Trade deal creation", () => {
  it("creates a private draft only when the initiator has trade-create permission", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ allowed: true }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "counterparty-account" }] })
      .mockResolvedValueOnce({ rows: [{ id: "deal-id", status: "draft", title: "Supply agreement", currency: "USD", proposedAmount: "1250.00" }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/trade/deals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initiatorAccountId: "11111111-1111-4111-8111-111111111111",
        counterpartyAccountId: "22222222-2222-4222-8222-222222222222",
        title: "Supply agreement",
        currency: "USD",
        proposedAmount: 1250,
      }),
    });

    expect(response.status).toBe(201);
    expect((await response.json()).deal.status).toBe("draft");
    expect(mocks.query).toHaveBeenCalledTimes(7);
    expect(mocks.query.mock.calls[1][1]).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "trade-creator",
      "account.trade.create",
    ]);
    expect(String(mocks.query.mock.calls[4][0])).toContain("trade_deal_events");
    expect(String(mocks.query.mock.calls[5][0])).toContain("trade.deal.created");
    expect(mocks.query.mock.calls[6][0]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("does not create a deal for a counterparty with no authorized reader", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ allowed: true }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({});

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/trade/deals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initiatorAccountId: "11111111-1111-4111-8111-111111111111",
        counterpartyAccountId: "22222222-2222-4222-8222-222222222222",
        title: "Supply agreement",
        currency: "USD",
      }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: "Counterparty account is not ready to receive trade deals",
    });
    expect(mocks.query).toHaveBeenCalledTimes(4);
    expect(mocks.query.mock.calls[3][0]).toBe("ROLLBACK");
  });

  it("keeps draft deals private to the initiating account", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/trade/deals`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, deals: [] });
    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("d.status <> 'draft' OR EXISTS");
    expect(sql).toContain("draft_member.account_id = d.initiator_account_id");
    expect(sql).toContain("account.trade.read");
    expect(mocks.query.mock.calls[0][1]).toEqual(["trade-creator"]);
  });

  it("does not notify the counterparty when a private draft is cancelled", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "deal-id",
          initiator_account_id: "11111111-1111-4111-8111-111111111111",
          counterparty_account_id: "22222222-2222-4222-8222-222222222222",
          pending_response_account_id: null,
          status: "draft",
          proposed_amount: "100.00",
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const dealId = "33333333-3333-4333-8333-333333333333";
    const baseUrl = await startServer(dealId);
    const response = await fetch(`${baseUrl}/api/trade/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cancel",
        accountId: "11111111-1111-4111-8111-111111111111",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, status: "cancelled" });
    expect(mocks.query).toHaveBeenCalledTimes(7);
    expect(mocks.query.mock.calls.some(call => String(call[0]).includes("INSERT INTO notifications"))).toBe(false);
    expect(mocks.query.mock.calls[6][0]).toBe("COMMIT");
  });

  it("allows only the pending responder to accept a proposal", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "deal-id",
          initiator_account_id: "11111111-1111-4111-8111-111111111111",
          counterparty_account_id: "22222222-2222-4222-8222-222222222222",
          pending_response_account_id: "22222222-2222-4222-8222-222222222222",
          status: "proposed",
          proposed_amount: "100.00",
        }],
      })
      .mockResolvedValueOnce({});

    const dealId = "33333333-3333-4333-8333-333333333333";
    const baseUrl = await startServer(dealId);
    const response = await fetch(`${baseUrl}/api/trade/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "accept",
        accountId: "11111111-1111-4111-8111-111111111111",
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: "Only the pending responder can accept or decline",
    });
    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(mocks.query.mock.calls[2][0]).toBe("ROLLBACK");
  });
});
