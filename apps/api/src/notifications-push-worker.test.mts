import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ query: mocks.query }),
}));

describe("notification push outbox worker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not contact Expo when the queue is empty", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    const fetchImpl = vi.fn();

    const { processPushOutboxBatch } = await import("./notifications-push-worker.mjs");
    const result = await processPushOutboxBatch(fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ claimed: 0, delivered: 0, failed: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends queued notifications and marks Expo-accepted messages delivered", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ notification_id: "notice-1", attempts: 1 }] })
      .mockResolvedValueOnce({ rows: [{
        notification_id: "notice-1",
        user_id: "user-1",
        type: "message_received",
        title_ar: "رسالة جديدة",
        title_en: "New message",
        body_ar: "لديك رسالة",
        body_en: "You have a message",
        action_url: "/messages",
        token: "ExpoPushToken[abcdefgh12345678]",
      }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ status: "ok", id: "expo-ticket-1" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));

    const { processPushOutboxBatch } = await import("./notifications-push-worker.mjs");
    const result = await processPushOutboxBatch(fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ claimed: 1, delivered: 1, failed: 0 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const request = fetchImpl.mock.calls[0][1] as RequestInit;
    const messages = JSON.parse(String(request.body));
    expect(messages).toEqual([{
      to: "ExpoPushToken[abcdefgh12345678]",
      title: "New message",
      body: "You have a message",
      sound: "default",
      data: {
        notificationId: "notice-1",
        type: "message_received",
        actionUrl: "/messages",
      },
    }]);
    expect(String(mocks.query.mock.calls[0][0])).toContain("FOR UPDATE SKIP LOCKED");
    expect(String(mocks.query.mock.calls[2][0])).toContain("status = 'delivered'");
  });

  it("schedules retry after a temporary Expo rate limit", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ notification_id: "notice-2", attempts: 2 }] })
      .mockResolvedValueOnce({ rows: [{
        notification_id: "notice-2",
        user_id: "user-2",
        type: "message_received",
        title_ar: "رسالة",
        title_en: "Message",
        body_ar: null,
        body_en: null,
        action_url: "/messages",
        token: "ExpoPushToken[abcdefgh12345678]",
      }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const fetchImpl = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    const { processPushOutboxBatch } = await import("./notifications-push-worker.mjs");
    const result = await processPushOutboxBatch(fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ claimed: 1, delivered: 0, failed: 1 });
    expect(String(mocks.query.mock.calls[2][0])).toContain("status = $2");
    expect(mocks.query.mock.calls[2][1][1]).toBe("pending");
    expect(mocks.query.mock.calls[2][1][2]).toBe(120);
  });
});
