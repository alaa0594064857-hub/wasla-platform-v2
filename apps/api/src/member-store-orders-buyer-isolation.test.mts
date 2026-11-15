import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createWaslaServer } from "./server.js";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("./database.js", () => ({
  getDatabasePool: vi.fn(),
}));

let server: Server | undefined;
const query = vi.fn();
const clientQuery = vi.fn();
const release = vi.fn();
const connect = vi.fn();

async function startServer() {
  const currentServer = createWaslaServer();
  server = currentServer;
  await new Promise<void>((resolve, reject) => {
    currentServer.once("error", reject);
    currentServer.listen(0, "127.0.0.1", resolve);
  });
  const address = currentServer.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "11111111-1111-4111-8111-111111111111" },
  } as never);
  query.mockReset();
  clientQuery.mockReset();
  release.mockReset();
  connect.mockReset();
  connect.mockResolvedValue({ query: clientQuery, release });
  vi.mocked(getDatabasePool).mockReturnValue({ query, connect } as never);
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
  }
  server = undefined;
  vi.clearAllMocks();
});

describe("member store order buyer isolation", () => {
  it("does not let a buyer cancel another buyer's accepted order or restore its stock", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        status: "accepted",
        storeId: "store-1",
        inventoryCommittedAt: new Date(),
        items: [{ productId: "33333333-3333-4333-8333-333333333333", quantity: 2 }],
      }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/stores/demo/orders/22222222-2222-4222-8222-222222222222`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Order not found, access denied, or transition not allowed",
    });
    const updateSql = String(clientQuery.mock.calls[2][0]);
    expect(updateSql).toContain("o.buyer_user_id = $5 AND o.status IN ('pending_merchant_review', 'accepted')");
    expect(clientQuery.mock.calls[2][1][4]).toBe("11111111-1111-4111-8111-111111111111");
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE store_products"))).toBe(false);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO audit_logs"))).toBe(false);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO notifications"))).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
