import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  connect: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
}));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: mocks.authorize }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ connect: mocks.connect }) }));

let handleOfficialStoreImportCandidatesRequest: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
let server: Server | undefined;

async function startServer(): Promise<string> {
  server = createServer((request, response) => { void handleOfficialStoreImportCandidatesRequest(request, response); });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  ({ handleOfficialStoreImportCandidatesRequest } = await import("./official-store-import-candidates.mjs"));
  mocks.authorize.mockResolvedValue({ userId: "platform-owner" });
  mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  mocks.clientQuery.mockResolvedValue({ rows: [] });
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  }
  server = undefined;
  vi.resetAllMocks();
});

const validPayload = {
  provider: "merchant_feed",
  supplierName: "Verified later supplier",
  productUrl: "https://merchant.example/products/item",
  payload: {
    title: "Sample product",
    description: "Product description",
    price: "12.50",
    currency: "EUR",
    available: true,
    sku: "SKU-1",
    images: ["https://cdn.example/item.jpg"],
  },
};

describe("official-store supplier candidate import safeguards", () => {
  it("imports feed records as unverified review candidates and never publishes or confirms dropshipping", async () => {
    mocks.clientQuery.mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "candidate-1", proposed_title: "Sample product" }] })
      .mockResolvedValueOnce({ rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toMatchObject({ success: true, importedCount: 1, candidates: [{ id: "candidate-1" }] });
    const insert = String(mocks.clientQuery.mock.calls[1][0]);
    expect(insert).toContain("'unverified'");
    expect(insert).toContain("'needs_owner_review'");
    expect(insert).toContain("FALSE");
    expect(mocks.clientQuery.mock.calls[0][0]).toBe("BEGIN");
    expect(mocks.clientQuery.mock.calls[2][0]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(data.note).toMatch(/No images were copied or published/);
  });

  it("requires an approved registry record when an external marketplace is named", async () => {
    const baseUrl = await startServer();
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, sourcePlatform: "Alibaba.com" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("keeps the external marketplace separate from the merchant-feed ingestion adapter", async () => {
    mocks.clientQuery.mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "source-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "candidate-alibaba", proposed_title: "Sample product" }] })
      .mockResolvedValueOnce({ rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validPayload,
        sourcePlatform: "Alibaba.com",
        dataSourceId: "11111111-1111-4111-8111-111111111111",
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toMatchObject({ success: true, provider: "merchant_feed", sourcePlatform: "Alibaba.com" });
    expect(mocks.clientQuery.mock.calls[1][1]).toEqual([
      "11111111-1111-4111-8111-111111111111", "platform-owner", "Alibaba.com",
    ]);
    expect(mocks.clientQuery.mock.calls[2][1][10]).toBe("Alibaba.com");
    expect(mocks.clientQuery.mock.calls[0][0]).toBe("BEGIN");
    expect(mocks.clientQuery.mock.calls[3][0]).toBe("COMMIT");
  });

  it("rejects a registered data source unless it is approved for this owner and provider", async () => {
    mocks.clientQuery.mockResolvedValueOnce({ rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validPayload,
        dataSourceId: "11111111-1111-4111-8111-111111111111",
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.clientQuery.mock.calls[0][0]).toBe("BEGIN");
    expect(String(mocks.clientQuery.mock.calls[1][0])).toContain("permission_status='approved'");
    expect(mocks.clientQuery.mock.calls[1][1]).toEqual([
      "11111111-1111-4111-8111-111111111111", "platform-owner", "merchant_feed",
    ]);
    expect(mocks.clientQuery.mock.calls[2][0]).toBe("ROLLBACK");
    expect(mocks.clientQuery).toHaveBeenCalledTimes(3);
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
