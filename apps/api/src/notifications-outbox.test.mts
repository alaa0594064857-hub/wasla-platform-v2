import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }));

vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ query: mocks.query }),
}));

describe("notification push outbox bootstrap", () => {
  it("creates a transactional outbox and enqueues every inserted in-app notification", async () => {
    const { ensureNotificationsTable } = await import("./notifications.mjs");
    await ensureNotificationsTable();

    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    const outboxTable = statements.findIndex((sql) => sql.includes("CREATE TABLE IF NOT EXISTS notification_push_outbox"));
    const triggerFunction = statements.findIndex((sql) => sql.includes("CREATE OR REPLACE FUNCTION wasla_enqueue_notification_push"));
    const trigger = statements.findIndex((sql) => sql.includes("CREATE TRIGGER notifications_enqueue_push"));

    expect(outboxTable).toBeGreaterThan(-1);
    expect(triggerFunction).toBeGreaterThan(outboxTable);
    expect(trigger).toBeGreaterThan(triggerFunction);
    expect(statements[outboxTable]).toContain("REFERENCES notifications(id) ON DELETE CASCADE");
    expect(statements[outboxTable]).toContain("CHECK (status IN ('pending', 'processing', 'delivered', 'dead'))");
    expect(statements[triggerFunction]).toContain("INSERT INTO notification_push_outbox (notification_id)");
    expect(statements[triggerFunction]).toContain("ON CONFLICT (notification_id) DO NOTHING");
    expect(statements[trigger]).toContain("AFTER INSERT ON notifications");
  });
});
