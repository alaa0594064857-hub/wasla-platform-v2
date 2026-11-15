import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createWaslaServer } from "./server.js";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

vi.mock("./auth.mjs", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("./database.js", () => ({ getDatabasePool: vi.fn() }));

let server: Server | undefined;
const query = vi.fn(), clientQuery = vi.fn(), release = vi.fn(), connect = vi.fn();
const buyer = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: buyer } } as never);
  query.mockReset(); clientQuery.mockReset(); release.mockReset(); connect.mockReset();
  connect.mockResolvedValue({ query: clientQuery, release });
  vi.mocked(getDatabasePool).mockReturnValue({ query, connect } as never);
});

afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.clearAllMocks();
});

async function start() {
  server = createWaslaServer();
  await new Promise<void>((resolve, reject) => { server!.once("error", reject); server!.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test address");
  return "http://127.0.0.1:" + address.port;
}

describe("member order cancellation boundaries", () => {
  it("does not allow a buyer to cancel an order after it has shipped", async () => {
    clientQuery.mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        status: "shipped", items: [{ productId: "33333333-3333-4333-8333-333333333333", quantity: 1 }],
        storeId: "44444444-4444-4444-8444-444444444444", inventoryCommittedAt: new Date(),
      }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    const base = await start();
    const response = await fetch(base + "/api/stores/demo/orders/" + orderId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Order not found, access denied, or transition not allowed",
    });
    expect(String(clientQuery.mock.calls[1][0])).toContain("FOR UPDATE OF o");
    const updateSql = String(clientQuery.mock.calls[2][0]);
    expect(updateSql).toContain("o.buyer_user_id = $5 AND o.status IN ('pending_merchant_review', 'accepted')");
    expect(updateSql).not.toContain("o.buyer_user_id = $5 AND o.status IN ('shipped'");
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE store_products"))).toBe(false);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO notifications"))).toBe(false);
    expect(String(clientQuery.mock.calls.at(-1)?.[0])).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
});
