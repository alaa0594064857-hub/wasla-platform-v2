import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ connect: mocks.connect }),
}));

import { handleTradeDealResponse } from "./trade-deals.mjs";

const userId = "00000000-0000-4000-8000-000000000010";
const supplierAccountId = "00000000-0000-4000-8000-000000000020";
const dealId = "00000000-0000-4000-8000-000000000030";

function makeRequest(): IncomingMessage {
  const request = Readable.from([JSON.stringify({ decision: "accept" })]) as IncomingMessage;
  Object.assign(request, { method: "POST", headers: {} });
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

describe("trade deal response party separation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  });

  it("prevents the same user from accepting as both buyer and supplier member", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: dealId,
          buyer_user_id: userId,
          supplier_account_id: supplierAccountId,
          status: "proposed",
          proposed_by_user_id: "00000000-0000-4000-8000-000000000099",
        }],
      })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // active supplier membership
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const response = makeResponse();
    await handleTradeDealResponse(makeRequest(), response as unknown as ServerResponse, dealId);

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toEqual({
      success: false,
      error: "A user cannot act as both parties in one deal",
    });
    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements.some((sql) => sql.includes("UPDATE trade_deals"))).toBe(false);
    expect(mocks.release).toHaveBeenCalledOnce();
  }); 
  it("rejects a deal response when the supplier account is inactive", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: dealId,
          buyer_user_id: "00000000-0000-4000-8000-000000000011",
          supplier_account_id: supplierAccountId,
          status: "proposed",
          proposed_by_user_id: "00000000-0000-4000-8000-000000000011",
          account_status: "suspended",
        }],
      })
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const response = makeResponse();
    await handleTradeDealResponse(makeRequest(), response as unknown as ServerResponse, dealId);

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toEqual({
      success: false,
      error: "The supplier account is not active",
    });
    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements.some((sql) => sql.includes("UPDATE trade_deals"))).toBe(false);
    expect(statements).toHaveLength(3);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

});
