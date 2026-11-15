import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createWaslaServer } from "./server.js";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

vi.mock("./auth.mjs", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("./database.js", () => ({ getDatabasePool: vi.fn() }));

let server: Server | undefined;
const query = vi.fn(), clientQuery = vi.fn(), release = vi.fn(), connect = vi.fn();
const merchant = "11111111-1111-4111-8111-111111111111";
const buyer = "55555555-5555-4555-8555-555555555555";
const orderId = "22222222-2222-4222-8222-222222222222";
const storeId = "33333333-3333-4333-8333-333333333333";
const disputeId = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: merchant } } as never);
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

const basePath = "/api/stores/demo/orders/" + orderId + "/dispute";

describe("member order complaint authorization boundaries", () => {
  it("denies a merchant without store order permissions from responding to a complaint", async () => {
    clientQuery.mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ orderStatus: "completed", buyerId: buyer, storeId }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: disputeId, status: "open", buyerId: buyer }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    const base = await start();
    const response = await fetch(base + basePath + "/response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: "We reviewed the order and are investigating the issue." }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, error: "Store order management permission required" });
    expect(String(clientQuery.mock.calls[3][0])).toContain("account_members");
    expect(String(clientQuery.mock.calls[3][0])).toContain("store_members");
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE member_store_order_disputes"))).toBe(false);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("audit_logs"))).toBe(false);
    expect(String(clientQuery.mock.calls.at(-1)?.[0])).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("prevents a buyer from closing another buyer's complaint", async () => {
    clientQuery.mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ orderStatus: "completed", buyerId: buyer, storeId }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: disputeId, status: "resolved", buyerId: buyer }] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    const base = await start();
    const response = await fetch(base + basePath + "/close", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, error: "Only the buyer can close this complaint" });
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE member_store_order_disputes"))).toBe(false);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("audit_logs"))).toBe(false);
    expect(String(clientQuery.mock.calls.at(-1)?.[0])).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
});
