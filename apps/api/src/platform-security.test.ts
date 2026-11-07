import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  query: vi.fn(),
}));

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("./database.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./database.js")>();
  return {
    ...actual,
    getDatabasePool: () => ({ query: mocks.query }),
  };
});

let authorizePlatformPermission: (
  request: IncomingMessage,
  response: ServerResponse,
  requiredPermission: string,
) => Promise<{ userId: string; roleNames: string[]; permissions: string[] } | null>;

beforeEach(async () => {
  ({ authorizePlatformPermission } = await import("./platform-security.mjs"));
});

let server: Server | undefined;

async function callAuthorization(headers: Record<string, string> = {}) {
  server = createServer(async (request, response) => {
    try {
      const access = await authorizePlatformPermission(
        request,
        response,
        "platform.manage",
      );
      if (access) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: true, userId: access.userId }));
      }
    } catch {
      if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: false }));
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine test server address");
  }

  return fetch(`http://127.0.0.1:${address.port}/protected`, { headers });
}

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => (error ? reject(error) : resolve()));
    });
  }
  server = undefined;
  vi.resetAllMocks();
});

describe("platform authorization", () => {
  it("rejects unauthenticated requests before querying platform roles", async () => {
    mocks.getSession.mockResolvedValueOnce(null);

    const response = await callAuthorization();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Authentication required",
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("denies an authenticated user without the required permission", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "session-user" } });
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const response = await callAuthorization({
      "x-user-id": "attacker-selected-user",
      "x-platform-role": "admin",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: "Insufficient platform permissions",
    });
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.query.mock.calls[0][1]).toEqual(["session-user"]);
    const authorizationSql = mocks.query.mock.calls[0][0] as string;
    expect(authorizationSql).toContain("u.status = 'active'");
    expect(authorizationSql).toContain("u.email_verified = TRUE");
    expect(authorizationSql).toContain("pra.status = 'active'");
    expect(authorizationSql).toContain("pra.role_scope = 'platform'");
    expect(authorizationSql).toContain("r.scope_type = 'platform'");
    expect(authorizationSql).toContain("rp.scope_type = 'platform'");
    expect(authorizationSql).toContain("p.scope_type = 'platform'");
  });

  it("grants access only from the permissions returned for the session user", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "verified-owner" } });
    mocks.query.mockResolvedValueOnce({
      rows: [
        { user_id: "verified-owner", role_name: "platform_owner", permission_key: "platform.manage" },
        { user_id: "verified-owner", role_name: "platform_owner", permission_key: "platform.security.read" },
      ],
    });

    const response = await callAuthorization({ "x-user-id": "different-user" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      userId: "verified-owner",
    });
    expect(mocks.query.mock.calls[0][1]).toEqual(["verified-owner"]);
  });

  it("does not grant access when the session user has unrelated permissions", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "buyer-user" } });
    mocks.query.mockResolvedValueOnce({
      rows: [
        { user_id: "buyer-user", role_name: "buyer", permission_key: "store.inquiry.create" },
      ],
    });

    const response = await callAuthorization();

    expect(response.status).toBe(403);
  });
});
