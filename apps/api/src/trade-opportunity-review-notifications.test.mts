import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  query: vi.fn(),
  connect: vi.fn(),
  clientQuery: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock("./auth.mjs", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ query: mocks.query, connect: mocks.connect }),
}));
vi.mock("./platform-security.mjs", () => ({
  authorizePlatformPermission: mocks.authorize,
}));

let handler: (request: IncomingMessage, response: ServerResponse, id?: string) => Promise<void>;
let server: Server | undefined;
const opportunityId = "123e4567-e89b-42d3-a456-426614174000";

async function startServer(): Promise<string> {
  ({ handleTradeOpportunitiesRequest: handler } = await import("./trade-opportunities.mjs"));
  server = createServer((req, res) => { void handler(req, res, opportunityId); });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({ user: { id: "platform-owner" } });
  mocks.authorize.mockResolvedValue(true);
  mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: vi.fn() });
  mocks.clientQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("UPDATE trade_opportunities")) {
      return { rowCount: 1, rows: [{ id: opportunityId, review_status: "approved", created_by_user_id: "submitter-user" }] };
    }
    return { rowCount: 1, rows: [] };
  });
});

afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.resetAllMocks();
});

describe("WASLA trade opportunity review notifications", () => {
  it.each([
    ["approved", "approved"],
    ["rejected", "rejected"],
    ["closed", "closed"],
  ] as const)("notifies the submitter and records the %s decision in the same transaction", async (reviewStatus, expected) => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/trade/opportunities/${opportunityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewStatus, note: "Reviewed by WASLA" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO trade_opportunity_events"),
      [opportunityId, "platform-owner", expected, "Reviewed by WASLA"],
    );
    expect(mocks.clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO notifications"),
      [
        "submitter-user",
        "trade_deal",
        "تمت مراجعة فرصتك في WASLA",
        "Your WASLA trade opportunity was reviewed",
        expect.stringContaining("Reviewed by WASLA"),
        expect.stringContaining("Reviewed by WASLA"),
        "/trade",
        opportunityId,
        JSON.stringify({ opportunityId, reviewStatus }),
      ],
    );
    expect(mocks.clientQuery.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("does not create an event or notification when the opportunity is no longer pending review", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE trade_opportunities")) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [] };
    });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/trade/opportunities/${opportunityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewStatus: "approved" }),
    });
    expect(response.status).toBe(404);
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO trade_opportunity_events"))).toBe(false);
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO notifications"))).toBe(false);
  });
});
