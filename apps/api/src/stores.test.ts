import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  query: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ query: mocks.query, connect: mocks.connect }),
}));

let handleStoresRequest: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
let server: Server | undefined;

async function startServer(): Promise<string> {
  server = createServer((request, response) => {
    void handleStoresRequest(request, response);
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
  ({ handleStoresRequest } = await import("./stores.mjs"));
  mocks.getSession.mockResolvedValue({ user: { id: "store-member-user" } });
  mocks.query.mockResolvedValue({ rows: [{ id: "store-1", name: "Assigned Store" }] });
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

describe("member store visibility", () => {
  it("allows a store member without an account membership to list their assigned store", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      stores: [{ id: "store-1", name: "Assigned Store" }],
    });
    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("LEFT JOIN account_members am");
    expect(sql).toContain("LEFT JOIN store_members sm");
    expect(sql).toContain("OR sm.id IS NOT NULL");
    expect(mocks.query.mock.calls[0][1]).toEqual(["store-member-user"]);
  });
});
