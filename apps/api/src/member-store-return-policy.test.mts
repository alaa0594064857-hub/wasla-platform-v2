import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createWaslaServer } from "./server.js";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

vi.mock("./auth.mjs", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("./database.js", () => ({ getDatabasePool: vi.fn() }));

let server: Server | undefined;
const query = vi.fn();
const connect = vi.fn();
const clientQuery = vi.fn();
const release = vi.fn();
const userId = "11111111-1111-4111-8111-111111111111";
const publicPath = "/api/stores/demo/return-policy";

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: userId } } as never);
  query.mockReset();
  connect.mockReset();
  clientQuery.mockReset();
  release.mockReset();
  vi.mocked(getDatabasePool).mockReturnValue({ query, connect } as never);
});
afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  server = undefined;
  vi.clearAllMocks();
});
async function start() {
  server = createWaslaServer();
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test address");
  return "http://127.0.0.1:" + address.port;
}

describe("member store return policy API", () => {
  it("returns a neutral disclosure when no policy is published", async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ policy: null, version: 0, publishedAt: null }] });
    const base = await start();
    const response = await fetch(base + publicPath);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true, status: "not_provided", policy: null,
      disclosure: "contact_seller_policy_not_provided",
    });
  });

  it("exposes only the currently published policy on the public endpoint", async () => {
    const policy = { acceptsReturns: true, acceptsExchanges: false, requestWindowDays: 14 };
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ policy, version: 3, publishedAt: "2026-11-09T10:00:00.000Z" }] });
    const base = await start();
    const response = await fetch(base + publicPath);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, status: "published", policy, version: 3 });
    expect(String(query.mock.calls[0][0])).not.toContain("member_store_return_policy_versions");
  });

  it("requires authentication for the merchant workspace", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never);
    const base = await start();
    const response = await fetch(base + publicPath + "/manage");
    expect(response.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects an invalid request window before opening a database transaction", async () => {
    const base = await start();
    const response = await fetch(base + publicPath + "/manage", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy: {
        acceptsReturns: true, acceptsExchanges: false, requestWindowDays: 0,
        itemConditionsAr: "", itemConditionsEn: "", exclusionsAr: "", exclusionsEn: "",
        buyerInstructionsAr: "", buyerInstructionsEn: "", contactInstructionsAr: "", contactInstructionsEn: "",
      } }),
    });
    expect(response.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });
});
