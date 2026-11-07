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

let handleMessagesRequest: (request: IncomingMessage, response: ServerResponse, conversationId?: string) => Promise<void>;
let server: Server | undefined;

async function startServer(conversationId?: string): Promise<string> {
  server = createServer((request, response) => {
    void handleMessagesRequest(request, response, conversationId);
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
  ({ handleMessagesRequest } = await import("./messages.mjs"));
  mocks.getSession.mockResolvedValue({ user: { id: "buyer-user" } });
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

describe("product-based private messaging", () => {
  it("resolves the seller from an active product without exposing a seller user id", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ recipient_id: "seller-user" }] })
      .mockResolvedValueOnce({ rows: [{ id: "conversation-id" }] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "11111111-1111-4111-8111-111111111111" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, conversationId: "conversation-id" });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[0][1]).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(mocks.query.mock.calls[1][1]).toEqual(["buyer-user", "seller-user"]);
    expect(String(mocks.query.mock.calls[0][0])).toContain("p.status = 'active'");
    expect(String(mocks.query.mock.calls[0][0])).toContain("r.name = 'store_manager'");
    expect(String(mocks.query.mock.calls[0][0])).toContain("COALESCE(store_owner.user_id, store_manager.user_id");
  });

  it("prevents a seller from starting a conversation with themselves through their product", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ recipient_id: "buyer-user" }] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "11111111-1111-4111-8111-111111111111" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "You cannot start a conversation with yourself",
    });
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("requires exactly one recipientId or productId", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "11111111-1111-4111-8111-111111111111", recipientId: "22222222-2222-4222-8222-222222222222" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("uses public member profile details in conversation lists", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ id: "conversation-id", peer_name: "Profile Name", peer_image: "https://example.com/avatar.png" }],
    });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/messages`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      conversations: [{ id: "conversation-id", peer_name: "Profile Name", peer_image: "https://example.com/avatar.png" }],
    });
    const sql = String(mocks.query.mock.calls[0][0]);
    expect(sql).toContain("COALESCE(peer_profile.display_name, peer.name)");
    expect(sql).toContain("LEFT JOIN profiles peer_profile");
    expect(sql).toContain("AS unread_count");
    expect(sql).toContain("participant_low_last_read_at");
  });

  it("marks a conversation read when its messages are opened", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "conversation-id" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "message-id", sender_id: "seller-user", body: "Hello" }] });

    const baseUrl = await startServer("11111111-1111-4111-8111-111111111111");
    const response = await fetch(`${baseUrl}/api/messages/11111111-1111-4111-8111-111111111111`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      messages: [{ id: "message-id", sender_id: "seller-user", body: "Hello" }],
    });
    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(String(mocks.query.mock.calls[1][0])).toContain("participant_high_last_read_at");
  });
});
