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
const productId = "22222222-2222-4222-8222-222222222222";

async function startServer() {
  server = createWaslaServer();
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  vi.mocked(authorizePlatformPermission).mockResolvedValue({
    userId: "11111111-1111-4111-8111-111111111111",
    roleNames: ["platform_owner"], permissions: ["platform.manage"],
  });
  query.mockReset(); clientQuery.mockReset(); release.mockReset(); connect.mockReset();
  connect.mockResolvedValue({ query: clientQuery, release });
  vi.mocked(getDatabasePool).mockReturnValue({ query, connect } as never);
});

afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) =>
    server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.clearAllMocks();
});

describe("member product moderation", () => {
  it("denies requests without platform management permission", async () => {
    vi.mocked(authorizePlatformPermission).mockImplementationOnce(async (_request, response) => {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ success: false, error: "Insufficient platform permissions" }));
      return null;
    });
    const base = await startServer();
    const response = await fetch(`${base}/api/platform/member-products/review`);
    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it("does not allow a platform admin without the owner role to moderate products", async () => {
    vi.mocked(authorizePlatformPermission).mockResolvedValueOnce({
      userId: "11111111-1111-4111-8111-111111111111",
      roleNames: ["platform_admin"], permissions: ["platform.manage"],
    });
    const base = await startServer();
    const response = await fetch(`${base}/api/platform/member-products/review`);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, error: "Platform owner access required" });
    expect(query).not.toHaveBeenCalled();
  });

  it("lists drafts only from active stores and active business accounts", async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: productId, title: "Sample", storeName: "Store" }] });
    const base = await startServer();
    const response = await fetch(`${base}/api/platform/member-products/review`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, products: [{ id: productId }] });
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("p.status = 'draft'");
    expect(sql).toContain("s.status = 'active'");
    expect(sql).toContain("a.status = 'active'");
  });

  it("approves a locked draft and writes its audit event in the same transaction", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: productId, status: "draft", store_status: "active", account_status: "active", business_verification_status: "verified" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const base = await startServer();
    const response = await fetch(`${base}/api/platform/member-products/review/${productId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, status: "active" });
    expect(clientQuery.mock.calls[0][0]).toBe("BEGIN");
    expect(String(clientQuery.mock.calls[1][0])).toContain("FOR UPDATE OF p");
    expect(String(clientQuery.mock.calls[1][0])).toContain("bp.verification_status AS business_verification_status");
    expect(clientQuery.mock.calls[2][1]).toEqual([productId, "active"]);
    expect(String(clientQuery.mock.calls[3][0])).toContain("INSERT INTO audit_logs");
    expect(clientQuery.mock.calls[4][0]).toBe("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not publish a product until the business profile is verified", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: productId, status: "draft", store_status: "active", account_status: "active",
        business_verification_status: "unverified",
      }] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const base = await startServer();
    const response = await fetch(`${base}/api/platform/member-products/review/${productId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, code: "BUSINESS_VERIFICATION_REQUIRED" });
    expect(clientQuery.mock.calls[2][0]).toBe("ROLLBACK");
    expect(clientQuery.mock.calls.some(call => String(call[0]).includes("UPDATE store_products"))).toBe(false);
    expect(clientQuery.mock.calls.some(call => String(call[0]).includes("INSERT INTO audit_logs"))).toBe(false);
  });

  it("requires a meaningful rejection reason before opening a transaction", async () => {
    const base = await startServer();
    const response = await fetch(`${base}/api/platform/member-products/review/${productId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "reject", note: "no" }),
    });
    expect(response.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects repeated decisions when the product is no longer a draft", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: productId, status: "active", store_status: "active", account_status: "active", business_verification_status: "verified" }] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const base = await startServer();
    const response = await fetch(`${base}/api/platform/member-products/review/${productId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, code: "PRODUCT_NOT_PENDING" });
    expect(clientQuery.mock.calls[2][0]).toBe("ROLLBACK");
    expect(clientQuery.mock.calls.some(call => String(call[0]).includes("INSERT INTO audit_logs"))).toBe(false);
  });
});
