import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createWaslaServer } from "./server.js";
import { authorizePlatformPermission } from "./platform-security.mjs";
import { getDatabasePool } from "./database.js";

vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: vi.fn() }));
vi.mock("./database.js", async importOriginal => {\n  const actual = await importOriginal<typeof import("./database.js")>();\n  return { ...actual, getDatabasePool: vi.fn() };\n});

let server: Server | undefined;
const query = vi.fn();
const connect = vi.fn();

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
    roleNames: ["platform_owner"],
    permissions: ["platform.manage"],
  });
  query.mockReset();
  connect.mockReset();
  vi.mocked(getDatabasePool).mockReturnValue({ query, connect } as never);
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) =>
      server!.close(error => error ? reject(error) : resolve()));
  }
  server = undefined;
  vi.clearAllMocks();
});

describe("platform business account review queue", () => {
  it("denies callers without platform management permission before querying the database", async () => {
    vi.mocked(authorizePlatformPermission).mockImplementationOnce(async (_request, response) => {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ success: false, error: "Insufficient platform permissions" }));
      return null;
    });

    const base = await startServer();
    const response = await fetch(`${base}/api/platform/business-accounts`);

    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it("requires the platform owner role even when the caller has platform.manage", async () => {
    vi.mocked(authorizePlatformPermission).mockResolvedValueOnce({
      userId: "11111111-1111-4111-8111-111111111111",
      roleNames: ["platform_admin"],
      permissions: ["platform.manage"],
    });

    const base = await startServer();
    const response = await fetch(`${base}/api/platform/business-accounts`);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Platform owner access required",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("lists business accounts with every selected non-aggregate field covered by GROUP BY", async () => {
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: "22222222-2222-4222-8222-222222222222",
        account_type: "company",
        status: "pending_verification",
        description: "Test business profile",
        verification_status: "unverified",
        store_count: 0,
        active_owner_count: 1,
      }],
    });

    const base = await startServer();
    const response = await fetch(`${base}/api/platform/business-accounts`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      accounts: [{ id: "22222222-2222-4222-8222-222222222222" }],
    });
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("bp.description");
    expect(sql).toContain("bp.website");
    expect(sql).toContain("bp.contact_information");
    expect(sql).toContain("bp.verification_status");
    expect(sql).toContain("GROUP BY a.id, bp.description, bp.website, bp.contact_information, bp.verification_status");
    expect(sql).toContain("COUNT(DISTINCT s.id)");
  });

  it("rejects unsupported methods without querying the database", async () => {
    const base = await startServer();
    const response = await fetch(`${base}/api/platform/business-accounts`, { method: "POST" });

    expect(response.status).toBe(405);
    expect(await response.json()).toMatchObject({ success: false, error: "Method not allowed" });
    expect(query).not.toHaveBeenCalled();
  });
});
