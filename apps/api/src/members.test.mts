import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
}));

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("./database.js", () => ({
  getDatabasePool: () => ({
    query: mocks.poolQuery,
    connect: mocks.connect,
  }),
}));

let handleMembersRequest: typeof import("./members.mjs").handleMembersRequest;
let server: Server | undefined;
const accountId = "11111111-1111-4111-8111-111111111111";

async function startServer(): Promise<string> {
  server = createServer((request, response) => {
    void handleMembersRequest(request, response, accountId);
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
  ({ handleMembersRequest } = await import("./members.mjs"));
  mocks.getSession.mockResolvedValue({ user: { id: "owner-user" } });
  mocks.poolQuery.mockReset();
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

describe("business account member access", () => {
  it("requires an authenticated session before querying account membership", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/accounts/${accountId}/members`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Authentication required" });
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("returns only the requested account's members to an authorized member", async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ role: "account_viewer" }] })
      .mockResolvedValueOnce({ rows: [{ membership_id: "membership-1", user_id: "member-1", email: "member@example.com" }] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/accounts/${accountId}/members`);
    expect(response.status).toBe(200);
    expect((await response.json()).members).toHaveLength(1);
    expect(mocks.poolQuery).toHaveBeenCalledTimes(2);
    expect(String(mocks.poolQuery.mock.calls[1][0])).toContain("WHERE am.account_id = $1");
    expect(mocks.poolQuery.mock.calls[1][1]).toEqual([accountId]);
  });

  it("does not reveal member records when the caller has no account permission", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/accounts/${accountId}/members`);
    expect(response.status).toBe(403);
    expect(mocks.poolQuery).toHaveBeenCalledOnce();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("restricts invitations to account owners and administrators", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ role: "account_employee" }] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/accounts/${accountId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", role: "account_viewer" }),
    });
    expect(response.status).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("creates an invitation only for an existing active verified user and records the audit event", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ role: "account_owner" }] });
    mocks.clientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: "target-user", name: "Target User", email: "target@example.com" }] })
      .mockResolvedValueOnce({ rows: [{ id: "viewer-role" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "membership-2", status: "invited" }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/accounts/${accountId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "TARGET@example.com", role: "account_viewer" }),
    });
    expect(response.status).toBe(201);
    expect((await response.json()).member).toMatchObject({ membershipId: "membership-2", status: "invited", role: "account_viewer" });
    expect(String(mocks.clientQuery.mock.calls[1][0])).toContain("email_verified = TRUE");
    expect(mocks.clientQuery.mock.calls[1][1]).toEqual(["target@example.com"]);
    expect(String(mocks.clientQuery.mock.calls[5][0])).toContain("INSERT INTO audit_logs");
    expect(String(mocks.clientQuery.mock.calls[6][0])).toContain("INSERT INTO notifications");
    expect(mocks.clientQuery.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("rejects an invitation role outside the limited member roles", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ role: "account_owner" }] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/accounts/${accountId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "target@example.com", role: "account_owner" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
