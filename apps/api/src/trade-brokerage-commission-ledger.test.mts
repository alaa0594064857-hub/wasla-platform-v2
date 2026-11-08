import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  query: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
  authorizePlatformPermission: vi.fn(),
}));

vi.mock("./auth.mjs", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ query: mocks.query, connect: mocks.connect }),
}));
vi.mock("./platform-security.mjs", () => ({
  authorizePlatformPermission: mocks.authorizePlatformPermission,
}));

let handleLedger: (
  request: IncomingMessage,
  response: ServerResponse,
  entryId?: string,
) => Promise<void>;
let server: Server | undefined;

async function startServer(entryId?: string): Promise<string> {
  server = createServer((request, response) => {
    void handleLedger(request, response, entryId);
  });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

const entryId = "11111111-1111-4111-8111-111111111111";
const entry = { id: entryId, status: "recorded", trade_reference: "PO-2026-42" };

beforeEach(async () => {
  ({ handleBrokerageCommissionLedger: handleLedger } = await import("./trade-brokerage-commission-ledger.mjs"));
  mocks.getSession.mockResolvedValue({ user: { id: "platform-owner" } });
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

describe("WASLA brokerage commission ledger status boundaries", () => {
  it("rejects unauthenticated ledger access before permission or database work", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/commission-ledger`);

    expect(response.status).toBe(401);
    expect(mocks.authorizePlatformPermission).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each(["invoiced", "paid"])("does not allow the ledger endpoint to set %s directly", async (status) => {
    const baseUrl = await startServer(entryId);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/commission-ledger/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, evidenceUrl: "https://evidence.example.com/receipt/1" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("requires a reason before a commission can be waived", async () => {
    const baseUrl = await startServer(entryId);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/commission-ledger/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "waived", note: "no" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("does not waive an entry with an open or paid invoice", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "recorded", has_invoice: true }] });

    const baseUrl = await startServer(entryId);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/commission-ledger/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "waived", note: "Waived by owner after review" }),
    });

    expect(response.status).toBe(409);
    expect(String(mocks.query.mock.calls.at(-1)?.[0])).toBe("ROLLBACK");
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });

  it("records a reasoned waiver only for a recorded commission with no invoice", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "recorded", has_invoice: false }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ ...entry, status: "waived" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const baseUrl = await startServer(entryId);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/commission-ledger/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "waived", note: "Waived after owner evidence review" }),
    });

    expect(response.status).toBe(200);
    expect(String(mocks.query.mock.calls[2][0])).toContain("SET status='waived'");
    expect(mocks.query.mock.calls[2][1]).toEqual([entryId, "Waived after owner evidence review"]);
    expect(String(mocks.query.mock.calls[3][0])).toContain("trade_brokerage_commission_events");
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("does not waive an entry that is already paid or otherwise no longer recorded", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "paid", has_invoice: true }] });

    const baseUrl = await startServer(entryId);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/commission-ledger/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "waived", note: "Attempted late waiver" }),
    });

    expect(response.status).toBe(409);
    expect(String(mocks.query.mock.calls.at(-1)?.[0])).toBe("ROLLBACK");
  });
});
