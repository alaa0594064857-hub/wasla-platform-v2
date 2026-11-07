import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ connect: mocks.connect }),
}));

let handleMemberAction: (
  request: IncomingMessage,
  response: ServerResponse,
  accountId: string,
  membershipId: string,
  action: "accept" | "revoke" | "decline",
) => Promise<void>;
let server: Server | undefined;

async function startServer(action: "accept" | "revoke" | "decline"): Promise<string> {
  server = createServer((request, response) => {
    void handleMemberAction(
      request,
      response,
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      action,
    );
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
  ({ handleMemberAction } = await import("./member-actions.mjs"));
  mocks.getSession.mockResolvedValue({ user: { id: "invited-user" } });
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
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

describe("account invitation actions", () => {
  it("notifies the inviter when the invited user accepts", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: "22222222-2222-4222-8222-222222222222",
          user_id: "invited-user",
          status: "invited",
          invited_by: "inviter-user",
          account_name: "Example Company",
          member_name: "Invited Member",
        }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const baseUrl = await startServer("accept");
    const response = await fetch(`${baseUrl}/api/member-action`, { method: "POST" });

    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
    expect(mocks.query).toHaveBeenCalledTimes(6);
    expect(String(mocks.query.mock.calls[4][0])).toContain("INSERT INTO notifications");
    expect(mocks.query.mock.calls[4][1][0]).toBe("inviter-user");
    expect(mocks.query.mock.calls[4][1][1]).toBe("تم قبول دعوة الحساب");
    expect(mocks.query.mock.calls[5][0]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("does not let another user accept an invitation or create a notification", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: "22222222-2222-4222-8222-222222222222",
          user_id: "different-user",
          status: "invited",
          invited_by: "inviter-user",
          account_name: "Example Company",
          member_name: "Invited Member",
        }],
      })
      .mockResolvedValueOnce({});

    const baseUrl = await startServer("accept");
    const response = await fetch(`${baseUrl}/api/member-action`, { method: "POST" });

    expect(response.status).toBe(403);
    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(String(mocks.query.mock.calls[2][0])).toBe("ROLLBACK");
    expect(mocks.query.mock.calls.some(call => String(call[0]).includes("INSERT INTO notifications"))).toBe(false);
  });
});
