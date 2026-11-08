import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createWaslaServer } from "./server.js";
import { auth } from "./auth.mjs";
import { authorizePlatformPermission } from "./platform-security.mjs";
import { getDatabasePool } from "./database.js";

vi.mock("./auth.mjs", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: vi.fn() }));
vi.mock("./database.js", () => ({ getDatabasePool: vi.fn() }));
let server: Server | undefined;
const query = vi.fn(), clientQuery = vi.fn(), release = vi.fn(), connect = vi.fn();
const buyer = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const storeId = "33333333-3333-4333-8333-333333333333";
const disputeId = "44444444-4444-4444-8444-444444444444";
beforeEach(() => {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: buyer } } as never);
  vi.mocked(authorizePlatformPermission).mockResolvedValue({ userId: buyer, roleNames: ["platform_admin"], permissions: ["platform.reports.manage"] } as never);
  query.mockReset(); clientQuery.mockReset(); release.mockReset(); connect.mockReset();
  connect.mockResolvedValue({ query: clientQuery, release });
  vi.mocked(getDatabasePool).mockReturnValue({ query, connect } as never);
});
afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined; vi.clearAllMocks();
});
async function start() {
  server = createWaslaServer();
  await new Promise<void>((resolve, reject) => { server!.once("error", reject); server!.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test address");
  return "http://127.0.0.1:" + address.port;
}
const url = "/api/stores/demo/orders/" + orderId + "/dispute";
describe("member store order complaints", () => {
  it("requires a signed-in buyer", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never);
    const base = await start();
    const response = await fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "other", details: "The item is not what I ordered." }) });
    expect(response.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });
  it("opens a complaint only for the buyer's eligible order and records an audit event", async () => {
    clientQuery.mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ orderStatus: "completed", buyerId: buyer, storeId }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: disputeId, status: "open" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const base = await start();
    const response = await fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "not_as_described", details: "The product received is materially different from the listing." }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, dispute: { id: disputeId, status: "open" } });
    expect(String(clientQuery.mock.calls[2][0])).toContain("ON CONFLICT");
    expect(String(clientQuery.mock.calls[3][0])).toContain("audit_logs");
  });
  it("rejects a duplicate open complaint without committing", async () => {
    clientQuery.mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ orderStatus: "shipped", buyerId: buyer, storeId }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const base = await start();
    const response = await fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "delivery_problem", details: "The tracking has not updated for several days." }) });
    expect(response.status).toBe(409);
    expect(String(clientQuery.mock.calls[3][0])).toBe("ROLLBACK");
  });
  it("protects the moderator queue and only permits authorized decisions", async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const base = await start();
    const response = await fetch(base + "/api/platform/order-disputes");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, disputes: [] });
    expect(authorizePlatformPermission).toHaveBeenCalledWith(expect.anything(), expect.anything(), "platform.reports.manage");
  });
  it("records a moderator resolution and audit entry atomically", async () => {
    clientQuery.mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: disputeId, status: "merchant_responded" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: disputeId, status: "resolved" }] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const base = await start();
    const response = await fetch(base + "/api/platform/order-disputes/" + disputeId, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "resolved", note: "The evidence supports the buyer's complaint." }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, dispute: { id: disputeId, status: "resolved" } });
    expect(String(clientQuery.mock.calls[3][0])).toContain("audit_logs");
    expect(String(clientQuery.mock.calls[4][0])).toBe("COMMIT");
  });
});
