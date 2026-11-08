import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  query: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock("./auth.mjs", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query }) }));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: mocks.authorize }));

let handler: (request: IncomingMessage, response: ServerResponse, id?: string) => Promise<void>;
let server: Server | undefined;

async function startServer(): Promise<string> {
  ({ handleTradeOpportunitiesRequest: handler } = await import("./trade-opportunities.mjs"));
  server = createServer((req, res) => { void handler(req, res, "review-history"); });
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
  mocks.authorize.mockResolvedValue({ userId: "platform-owner", roleNames: ["owner"], permissions: ["platform.manage"] });
  mocks.query.mockResolvedValue({
    rowCount: 1,
    rows: [{
      id: "123e4567-e89b-42d3-a456-426614174000",
      title: "Steel sheets for factory",
      opportunity_type: "buyer_request",
      review_status: "rejected",
      account_name: "Buyer Co",
      note: "Specifications need clarification",
      event_created_at: "2026-11-08T12:00:00.000Z",
    }],
  });
});

afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.resetAllMocks();
});

describe("WASLA trade opportunity review history", () => {
  it("returns the latest final decisions to authorized platform owners only", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/trade/opportunities/review-history`);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.decisions).toHaveLength(1);
    expect(data.decisions[0]).toMatchObject({
      title: "Steel sheets for factory",
      review_status: "rejected",
      account_name: "Buyer Co",
      note: "Specifications need clarification",
    });
    expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), expect.anything(), "platform.manage");
    expect(String(mocks.query.mock.calls[0][0])).toContain("e.event_type IN ('approved','rejected','closed')");
    expect(String(mocks.query.mock.calls[0][0])).toContain("ORDER BY e.created_at DESC LIMIT 100");
  });

  it("does not query decision history when platform authorization fails", async () => {
    mocks.authorize.mockImplementationOnce(async (_request, response) => {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ success: false, error: "Insufficient platform permissions" }));
      return null;
    });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/trade/opportunities/review-history`);
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests before querying history", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/trade/opportunities/review-history`);
    expect(response.status).toBe(401);
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
