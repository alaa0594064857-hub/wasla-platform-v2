import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), query: vi.fn() }));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: mocks.authorize }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query }) }));

let handlePlatformOverviewRequest: (
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
) => Promise<void>;
let server: Server | undefined;

async function startServer(): Promise<string> {
  server = createServer((request, response) => { void handlePlatformOverviewRequest(request, response); });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  ({ handlePlatformOverviewRequest } = await import("./platform-overview.mjs"));
  mocks.authorize.mockResolvedValue({ userId: "platform-owner" });
});

afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.resetAllMocks();
});

describe("platform overview official store metrics", () => {
  it("reports only real official order, product and supplier-offer counts", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ account_type: "company", status: "active", total: 2 }] })
      .mockResolvedValueOnce({ rows: [{ status: "active", total: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: "active", total: 2 }] })
      .mockResolvedValueOnce({ rows: [{ total: 3, needs_review: 1 }] })
      .mockResolvedValueOnce({ rows: [{ total: 4 }] })
      .mockResolvedValueOnce({ rows: [{ total: 5, needs_review: 2 }] })
      .mockResolvedValueOnce({ rows: [{ total: 6, active: 4 }] })
      .mockResolvedValueOnce({ rows: [{ total: 7 }] })
      .mockResolvedValueOnce({ rows: [{ total: 8 }] })
      .mockResolvedValueOnce({ rows: [{ total: 9 }] })
      .mockResolvedValueOnce({ rows: [{ total: 0, active: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 0, active: 0 }] });

    const baseUrl = await startServer();
    const response = await fetch(baseUrl);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.totals).toMatchObject({
      officialStoreOrders: 3,
      officialStoreOrdersNeedingReview: 1,
      officialStoreProducts: 4,
      supplierOffers: 5,
      supplierOffersNeedingReview: 2,
      memberProducts: 6,
      activeMemberProducts: 4,
      messageConversations: 7,
      productInquiries: 8,
      tradeDeals: 9,
      subscriptionPlans: 0,
      subscriptions: 0,
    });
    expect(data.availableModules.orders).toBe(true);
    expect(data.availableModules.officialPlatformStore).toBe(true);
    expect(data.availableModules.memberCatalog).toBe(true);
    expect(data.availableModules.messages).toBe(true);
    expect(data.availableModules.trade).toBe(true);
    expect(data.availableModules.subscriptionManagement).toBe(true);
    expect(String(mocks.query.mock.calls[11][0])).toContain("is_active = TRUE");
    expect(String(mocks.query.mock.calls[12][0])).toContain("FROM subscriptions");
    expect(mocks.query).toHaveBeenCalledTimes(13);
  });

  it("requires report permission before reading platform metrics", async () => {
    mocks.authorize.mockImplementationOnce((_request, response) => {
      response.writeHead(403);
      response.end();
      return null;
    });
    const baseUrl = await startServer();
    const response = await fetch(baseUrl);
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
