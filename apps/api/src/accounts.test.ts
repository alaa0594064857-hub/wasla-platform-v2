import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), query: vi.fn(), connect: vi.fn() }));
vi.mock("./auth.mjs", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query, connect: mocks.connect }) }));

let handler: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => Promise<void>;
let server: Server | undefined;

async function startServer(): Promise<string> {
  ({ handleAccountsRequest: handler } = await import("./accounts.mjs"));
  server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}/api/accounts`;
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({ user: { id: "signed-in-user" } });
});
afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.resetAllMocks();
});

describe("business account access isolation", () => {
  it("requires authentication before listing accounts", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const response = await fetch(await startServer());
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("lists only accounts linked to the authenticated user's active account.read membership", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: "signed-in-user" }] })
      .mockResolvedValueOnce({ rows: [{ id: "owned-account", account_type: "company" }] });
    const response = await fetch(await startServer());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, accounts: [{ id: "owned-account" }] });
    const accountGateSql = String(mocks.query.mock.calls[0][0]);
    expect(accountGateSql).toContain("status = 'active'");
    expect(accountGateSql).toContain("email_verified = TRUE");
    expect(mocks.query.mock.calls[0][1]).toEqual(["signed-in-user"]);
    const sql = String(mocks.query.mock.calls[1][0]);
    expect(sql).toContain("am.user_id = $1");
    expect(sql).toContain("am.status = 'active'");
    expect(sql).toContain("p.permission_key = 'account.read'");
    expect(mocks.query.mock.calls[1][1]).toEqual(["signed-in-user"]);
  });

  it("creates the account and owner membership for the authenticated session user in one transaction", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "signed-in-user" }] });
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "owner-role" }] })
      .mockResolvedValueOnce({ rows: [{ id: "new-account", account_type: "company", legal_name: "Example Ltd", display_name: "Example", status: "active", country_code: "TR" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await fetch(await startServer(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: "company", legalName: "Example Ltd", displayName: "Example", countryCode: "TR", ownerUserId: "attacker-selected-user" }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, account: { id: "new-account", role: "account_owner", membershipStatus: "active" } });
    const membershipCall = client.query.mock.calls[4];
    expect(String(membershipCall[0])).toContain("INSERT INTO account_members");
    expect(membershipCall[1]).toEqual(["new-account", "signed-in-user", "owner-role"]);
    expect(membershipCall[1]).not.toContain("attacker-selected-user");
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("blocks pending, unverified, or suspended users from account operations", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    const response = await fetch(await startServer(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: "company", legalName: "Example Ltd", displayName: "Example" }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, error: "An active, verified account is required" });
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("rejects invalid account types before opening a transaction", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "signed-in-user" }] });
    const response = await fetch(await startServer(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: "buyer", legalName: "Buyer", displayName: "Buyer" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
