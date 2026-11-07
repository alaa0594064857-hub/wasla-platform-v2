import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  query: vi.fn(),
}));

vi.mock("./platform-security.mjs", () => ({
  authorizePlatformPermission: mocks.authorize,
}));

vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ query: mocks.query }),
}));

let handlePlatformAuditRequest: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
let server: Server | undefined;

async function startServer(): Promise<string> {
  server = createServer((request, response) => {
    void handlePlatformAuditRequest(request, response);
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
  ({ handlePlatformAuditRequest } = await import("./platform-audit.mjs"));
  mocks.authorize.mockResolvedValue({ userId: "owner-user", roleNames: ["platform_owner"], permissions: ["platform.audit.read"] });
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
  }
  server = undefined;
  vi.resetAllMocks();
});

describe("platform audit endpoint", () => {
  it("requires platform audit-read permission and returns bounded recent entries", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "audit-1", action: "product.created" }] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/platform/audit?limit=25`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, entries: [{ id: "audit-1", action: "product.created" }] });
    expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), expect.anything(), "platform.audit.read");
    expect(mocks.query.mock.calls[0][1]).toEqual([25]);
    expect(String(mocks.query.mock.calls[0][0])).toContain("ORDER BY al.created_at DESC");
  });

  it("does not query audit data when platform permission is denied", async () => {
    mocks.authorize.mockResolvedValueOnce(null);

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/platform/audit`);

    expect(response.status).toBe(200);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
