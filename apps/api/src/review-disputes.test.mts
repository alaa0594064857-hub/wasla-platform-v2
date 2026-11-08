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
const query = vi.fn();
beforeEach(() => {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "11111111-1111-4111-8111-111111111111" } } as never);
  vi.mocked(authorizePlatformPermission).mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111", roleNames: ["platform_admin"], permissions: ["platform.reports.manage"] } as never);
  query.mockReset();
  vi.mocked(getDatabasePool).mockReturnValue({ query } as never);
});
afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.clearAllMocks();
});
async function startServer() {
  server = createWaslaServer();
  await new Promise<void>((resolve, reject) => { server!.once("error", reject); server!.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test address");
  return "http://127.0.0.1:" + address.port;
}
describe("review reports and appeals", () => {
  const id = "22222222-2222-4222-8222-222222222222";
  it("requires authentication before accepting a report", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never);
    const base = await startServer();
    const response = await fetch(base + "/api/reviews/" + id + "/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "spam" }) });
    expect(response.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
  it("accepts a report for a published review and prevents duplicate submissions", async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id }] }).mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "33333333-3333-4333-8333-333333333333", status: "open" }] });
    const base = await startServer();
    const response = await fetch(base + "/api/reviews/" + id + "/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "spam", details: "This appears to be repetitive promotional content." }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, report: { status: "open" } });
    expect(String(query.mock.calls[0][0])).toContain("status = 'published'");
    expect(String(query.mock.calls[1][0])).toContain("ON CONFLICT");
  });
  it("allows only the author of a rejected or hidden review to appeal", async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id }] }).mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "44444444-4444-4444-8444-444444444444", status: "open" }] });
    const base = await startServer();
    const response = await fetch(base + "/api/reviews/" + id + "/appeal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "I believe this review was incorrectly rejected and would like a second review." }) });
    expect(response.status).toBe(201);
    expect(String(query.mock.calls[0][0])).toContain("buyer_user_id = $2");
    expect(String(query.mock.calls[0][0])).toContain("status IN ('rejected','hidden')");
  });
  it("restricts the open report and appeal queue to platform moderators", async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const base = await startServer();
    const response = await fetch(base + "/api/platform/review-disputes");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, reports: [], appeals: [] });
    expect(authorizePlatformPermission).toHaveBeenCalledWith(expect.anything(), expect.anything(), "platform.reports.manage");
  });
});
