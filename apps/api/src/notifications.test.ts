import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  query: vi.fn(),
}));

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ query: mocks.query }),
}));

let handleNotificationsRequest: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
let createNotification: typeof import("./notifications.mjs")["createNotification"];
let server: Server | undefined;

async function startServer(): Promise<string> {
  server = createServer((request, response) => {
    void handleNotificationsRequest(request, response);
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
  ({ handleNotificationsRequest, createNotification } = await import("./notifications.mjs"));
  mocks.getSession.mockResolvedValue({ user: { id: "notification-owner" } });
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

describe("notification creation safeguards", () => {
  it.each(["https://attacker.example/path", "//attacker.example/path", "javascript:alert(1)", "/\\\\attacker.example/path"])(
    "rejects non-internal action URL %s before inserting",
    async (actionUrl) => {
      const client = { query: vi.fn() } as unknown as Parameters<typeof createNotification>[0];
      await expect(createNotification(client, {
        userId: "notification-owner",
        type: "message_received",
        titleAr: "رسالة",
        titleEn: "Message",
        actionUrl,
      })).rejects.toThrow("Notification action must be an internal path");
      expect((client as unknown as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
    },
  );

  it("stores a valid internal action path with parameterized values", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Parameters<typeof createNotification>[0];
    await createNotification(client, {
      userId: "notification-owner",
      type: "message_received",
      titleAr: "رسالة",
      titleEn: "Message",
      actionUrl: "/messages/conversation-1",
    });
    expect((client as { query: ReturnType<typeof vi.fn> }).query).toHaveBeenCalledOnce();
    expect((client as { query: ReturnType<typeof vi.fn> }).query.mock.calls[0][1]).toContain("/messages/conversation-1");
  });
});

describe("private in-app notifications", () => {
  it("lists only the signed-in user's notifications and unread count", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: "notice-1", titleEn: "New message" }] })
      .mockResolvedValueOnce({ rows: [{ total: "1" }] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/notifications`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      notifications: [{ id: "notice-1", titleEn: "New message" }],
      unreadCount: 1,
    });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[0][1]).toEqual(["notification-owner"]);
    expect(String(mocks.query.mock.calls[0][0])).toContain("WHERE user_id = $1");
    expect(mocks.query.mock.calls[1][1]).toEqual(["notification-owner"]);
    expect(String(mocks.query.mock.calls[1][0])).toContain("read_at IS NULL");
  });

  it("marks all notifications read only for the signed-in user", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 2, rows: [] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/notifications/read-all`, { method: "PATCH" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, markedRead: 2 });
    expect(mocks.query.mock.calls[0][1]).toEqual(["notification-owner"]);
    expect(String(mocks.query.mock.calls[0][0])).toContain("WHERE user_id = $1");
  });

  it("does not let a user mark another user's notification as read", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/notifications/11111111-1111-4111-8111-111111111111/read`, {
      method: "PATCH",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: "Notification not found" });
    expect(mocks.query.mock.calls[0][1]).toEqual(["11111111-1111-4111-8111-111111111111", "notification-owner"]);
    expect(String(mocks.query.mock.calls[0][0])).toContain("WHERE id = $1 AND user_id = $2");
  });

  it("rejects unauthenticated notification reads without querying private data", async () => {
    mocks.getSession.mockResolvedValueOnce(null);

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/notifications`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Authentication required" });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects unsupported notification methods", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/notifications`, { method: "POST" });

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ success: false, error: "Method not allowed" });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

});
