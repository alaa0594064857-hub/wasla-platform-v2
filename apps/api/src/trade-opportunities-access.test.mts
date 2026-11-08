import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), query: vi.fn() }));
vi.mock("./auth.mjs", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query }) }));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: vi.fn() }));

let handler: (request: IncomingMessage, response: ServerResponse, id?: string) => Promise<void>;
let server: Server | undefined;

async function startServer(): Promise<string> {
  ({ handleTradeOpportunitiesRequest: handler } = await import("./trade-opportunities.mjs"));
  server = createServer((req,res) => { void handler(req,res); });
  await new Promise<void>((resolve,reject) => {
    server!.once("error",reject);
    server!.listen(0,"127.0.0.1",resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({user:{id:"trade-reader"}});
});
afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));
  server=undefined;
  vi.resetAllMocks();
});

describe("WASLA Trade opportunity list access", () => {
  it("requires an active owning account as well as active membership and trade-read permission", async () => {
    mocks.query.mockResolvedValueOnce({rowCount:0,rows:[]});
    const baseUrl=await startServer();
    const response=await fetch(`${baseUrl}/api/trade/opportunities`);
    expect(response.status).toBe(200);
    expect(String(mocks.query.mock.calls[0][0])).toContain("INNER JOIN accounts a ON a.id=o.account_id AND a.status='active'");
    expect(String(mocks.query.mock.calls[0][0])).toContain("am.status='active'");
    expect(String(mocks.query.mock.calls[0][0])).toContain("p.permission_key='account.trade.read'");
  });

  it("does not query private opportunity data for an unauthenticated user", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const baseUrl=await startServer();
    const response=await fetch(`${baseUrl}/api/trade/opportunities`);
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
