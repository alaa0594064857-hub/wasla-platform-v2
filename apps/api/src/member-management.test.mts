import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  clientQuery: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
}));

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ connect: mocks.connect }),
}));

let handleMemberManagement: typeof import("./member-management.mjs").handleMemberManagement;
let server: Server | undefined;
const accountId = "11111111-1111-4111-8111-111111111111";
const membershipId = "22222222-2222-4222-8222-222222222222";

async function startServer(): Promise<string> {
  server = createServer((request, response) => {
    void handleMemberManagement(request, response, accountId, membershipId);
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
  ({ handleMemberManagement } = await import("./member-management.mjs"));
  mocks.getSession.mockResolvedValue({ user: { id: "account-owner-user" } });
  mocks.clientQuery.mockReset();
  mocks.release.mockReset();
  mocks.connect.mockReset().mockResolvedValue({
    query: mocks.clientQuery,
    release: mocks.release,
  });
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close(error => error ? reject(error) : resolve());
    });
  }
  server = undefined;
  vi.clearAllMocks();
});

describe("business account member management", () => {
  it("requires authentication before opening a database transaction", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/accounts/${accountId}/members/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "suspended" }),
    });
    expect(response.status).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("scopes the locked membership lookup to both account and membership identifiers", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/accounts/${accountId}/members/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "suspended" }),
    });
    expect(response.status).toBe(404);
    expect(String(mocks.clientQuery.mock.calls[1][0])).toContain("am.account_id = $2");
    expect(mocks.clientQuery.mock.calls[1][1]).toEqual([membershipId, accountId]);
    expect(mocks.clientQuery.mock.calls[2][0]).toBe("ROLLBACK");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("prevents owners and administrators from being changed through member management", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: membershipId, user_id: "protected-owner", status: "active", role: "account_owner" }] })
      .mockResolvedValueOnce({});
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/accounts/${accountId}/members/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "suspended" }),
    });
    expect(response.status).toBe(403);
    expect(mocks.clientQuery.mock.calls[2][0]).toBe("ROLLBACK");
    expect(mocks.clientQuery.mock.calls.some(call => String(call[0]).includes("UPDATE account_members"))).toBe(false);
  });

  it("allows an authorized account owner to change a manageable member role with an audit record", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: membershipId, user_id: "employee-user", status: "active", role: "account_employee" }] })
      .mockResolvedValueOnce({ rows: [{ role: "account_owner" }] })
      .mockResolvedValueOnce({ rows: [{ id: "viewer-role" }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/accounts/${accountId}/members/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "account_viewer" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, updatedField: "role", value: "account_viewer" });
    expect(String(mocks.clientQuery.mock.calls[4][0])).toContain("UPDATE account_members");
    expect(String(mocks.clientQuery.mock.calls[5][0])).toContain("INSERT INTO audit_logs");
    expect(mocks.clientQuery.mock.calls[6][0]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("rejects attempts to assign privileged roles to ordinary members", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: membershipId, user_id: "employee-user", status: "active", role: "account_employee" }] })
      .mockResolvedValueOnce({ rows: [{ role: "account_owner" }] })
      .mockResolvedValueOnce({});
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/accounts/${accountId}/members/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "platform_owner" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.clientQuery.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(mocks.clientQuery.mock.calls.some(call => String(call[0]).includes("UPDATE account_members"))).toBe(false);
  });
});
