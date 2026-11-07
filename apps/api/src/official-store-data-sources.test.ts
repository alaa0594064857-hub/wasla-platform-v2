import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), query: vi.fn() }));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: mocks.authorize }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query }) }));

let handleOfficialStoreDataSourcesRequest: (
  request: IncomingMessage, response: ServerResponse, sourceId?: string
) => Promise<void>;
let server: Server | undefined;

async function startServer(sourceId?: string): Promise<string> {
  server = createServer((request, response) => { void handleOfficialStoreDataSourcesRequest(request, response, sourceId); });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  ({ handleOfficialStoreDataSourcesRequest } = await import("./official-store-data-sources.mjs"));
  mocks.authorize.mockResolvedValue({ userId: "platform-owner" });
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  }
  server = undefined;
  vi.resetAllMocks();
});

describe("authorized official-store data source registry", () => {
  it("always registers a new source as pending review, never automatically approved", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "source-id", permission_status: "pending_review" }] });
    const baseUrl = await startServer();
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Licensed product feed",
        provider: "Merchant",
        sourceCategory: "catalog",
        accessMethod: "licensed_feed",
        dataTypes: ["product", "price"],
        markets: ["TR"],
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, source: { permission_status: "pending_review" } });
    expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), expect.anything(), "platform.manage");
    expect(String(mocks.query.mock.calls[0][0])).toContain("'pending_review'");
    expect(mocks.query.mock.calls[0][1][0]).toBe("platform-owner");
  });

  it("refuses approval without HTTPS permission evidence", async () => {
    const baseUrl = await startServer("11111111-1111-4111-8111-111111111111");
    const response = await fetch(baseUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissionStatus: "approved" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("requires HTTPS for permission evidence and confines changes to the source owner", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "source-id", permission_status: "approved" }] });
    const baseUrl = await startServer("11111111-1111-4111-8111-111111111111");
    const response = await fetch(baseUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissionStatus: "approved", permissionEvidenceUrl: "https://provider.example/terms" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.query.mock.calls[0][1]).toEqual([
      "approved", "https://provider.example/terms", "11111111-1111-4111-8111-111111111111", "platform-owner",
    ]);
    expect(String(mocks.query.mock.calls[0][0])).toContain("WHERE id=$3 AND created_by=$4");
  });
});
