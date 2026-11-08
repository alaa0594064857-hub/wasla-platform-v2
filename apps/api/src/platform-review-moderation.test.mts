import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createWaslaServer } from "./server.js";
import { authorizePlatformPermission } from "./platform-security.mjs";
import { getDatabasePool } from "./database.js";

vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: vi.fn() }));
vi.mock("./database.js", () => ({ getDatabasePool: vi.fn() }));

let server: Server | undefined;
const query = vi.fn();
const clientQuery = vi.fn();
const release = vi.fn();
const connect = vi.fn();

async function startServer() {
  const current = createWaslaServer();
  server = current;
  await new Promise<void>((resolve, reject) => {
    current.once("error", reject);
    current.listen(0, "127.0.0.1", resolve);
  });
  const address = current.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  vi.mocked(authorizePlatformPermission).mockResolvedValue({
    userId: "11111111-1111-4111-8111-111111111111",
    roleNames: ["platform_admin"], permissions: ["platform.reports.manage"],
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
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  }
  server = undefined;
  vi.clearAllMocks();
});

describe("platform review moderation", () => {
  const reviewId = "22222222-2222-4222-8222-222222222222";

  it("requires platform moderation permission", async () => {
    vi.mocked(authorizePlatformPermission).mockResolvedValueOnce(null as never);
    const base = await startServer();
    const response = await fetch(`${base}/api/platform/reviews`);
    expect(response.status).toBe(200); // authorization helper owns the response
    expect(query).not.toHaveBeenCalled();
  });

  it("lists the pending moderation queue only for authorized platform staff", async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: reviewId, status: "pending_moderation" }] });
    const base = await startServer();
    const response = await fetch(`${base}/api/platform/reviews`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, reviews: [{ status: "pending_moderation" }] });
    expect(String(query.mock.calls[0][0])).toContain("verified_product_reviews");
    expect(query.mock.calls[0][1]).toEqual(["pending_moderation"]);
    expect(authorizePlatformPermission).toHaveBeenCalledWith(expect.anything(), expect.anything(), "platform.reports.manage");
  });

  it("records moderation decisions and an audit event in one transaction", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: reviewId, status: "published" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const base = await startServer();
    const response = await fetch(`${base}/api/platform/reviews/${reviewId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published", note: "Verified and appropriate." }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, review: { status: "published" } });
    expect(clientQuery).toHaveBeenCalledWith("BEGIN");
    expect(String(clientQuery.mock.calls[1][0])).toContain("moderated_by = $3");
    expect(String(clientQuery.mock.calls[2][0])).toContain("INSERT INTO audit_logs");
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalled();
  });

  it("rejects invalid moderation states before starting a transaction", async () => {
    const base = await startServer();
    const response = await fetch(`${base}/api/platform/reviews/${reviewId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "delete" }),
    });
    expect(response.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });
});
