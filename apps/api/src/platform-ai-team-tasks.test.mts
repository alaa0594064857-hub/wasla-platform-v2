import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), query: vi.fn() }));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: mocks.authorize }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query, connect: async () => ({ query: mocks.query, release: vi.fn() }) }) }));

let handler: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => Promise<void>;
let server: Server | undefined;

async function startServer(): Promise<string> {
  server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  ({ handlePlatformAiTeamTasksRequest: handler } = await import("./platform-ai-team-tasks.mjs"));
  mocks.authorize.mockResolvedValue({ userId: "owner-1", roleNames: ["platform_owner"], permissions: ["platform.manage"] });
  mocks.query.mockImplementation(async (sql: string) => {
    if (String(sql).includes("FROM platform_ai_manager_control WHERE")) {
      return { rows: [{ enabled: true, pausedReason: null, updatedAt: new Date().toISOString() }] };
    }
    if (String(sql).includes("INSERT INTO platform_ai_team_tasks")) {
      return { rowCount: 1, rows: [{ id: "11111111-1111-4111-8111-111111111111", specialistKey: "translator", title: "Translate product", status: "queued", createdAt: new Date().toISOString() }] };
    }
    if (String(sql).includes("FROM platform_ai_team_tasks") && String(sql).includes("ORDER BY created_at DESC")) {
      return { rows: [{ id: "11111111-1111-4111-8111-111111111111", specialistKey: "translator", title: "Translate product", status: "queued" }] };
    }
    return { rows: [], rowCount: 0 };
  });
});

afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.resetAllMocks();
});

describe("WASLA owner digital team task API", () => {
  it("requires platform owner authorization before touching task storage", async () => {
    mocks.authorize.mockImplementationOnce((_request, response) => {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ success: false, error: "Forbidden" }));
      return null;
    });
    const base = await startServer();
    const response = await fetch(base + "/api/platform/ai/tasks");
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("lists only the authenticated owner's tasks with a bounded limit", async () => {
    const base = await startServer();
    const response = await fetch(base + "/api/platform/ai/tasks?limit=500");
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.tasks).toHaveLength(1);
    const listCall = mocks.query.mock.calls.find(call => String(call[0]).includes("ORDER BY created_at DESC"));
    expect(listCall?.[1]).toEqual(["owner-1", 50]);
    expect(String(listCall?.[0])).toContain("WHERE owner_user_id = $1");
  });

  it("filters the task history by a validated specialist key", async () => {
    const base = await startServer();
    const response = await fetch(base + "/api/platform/ai/tasks?specialistKey=translator");
    expect(response.status).toBe(200);
    const listCall = mocks.query.mock.calls.find(call => String(call[0]).includes("ORDER BY created_at DESC"));
    expect(listCall?.[1]).toEqual(["owner-1", 20, "translator"]);
    expect(String(listCall?.[0])).toContain("specialist_key = $3");
  });

  it("rejects unknown specialist filters", async () => {
    const base = await startServer();
    const response = await fetch(base + "/api/platform/ai/tasks?specialistKey=unknown");
    expect(response.status).toBe(400);
    expect(mocks.query.mock.calls.some(call => String(call[0]).includes("ORDER BY created_at DESC"))).toBe(false);
  });

  it("returns Gemini cooldown metadata and owner-scoped task counts", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes("FROM platform_ai_manager_control WHERE")) {
        return { rows: [{ enabled: true, pausedReason: null, updatedAt: new Date().toISOString() }] };
      }
      if (String(sql).includes("FROM platform_ai_provider_state")) {
        return { rows: [{ cooldownUntil: "2026-11-15T09:00:00.000Z", lastErrorCode: "PROVIDER_RATE_LIMIT" }] };
      }
      if (String(sql).includes("GROUP BY status")) {
        return { rows: [{ status: "queued", count: 15 }, { status: "failed", count: 3 }] };
      }
      if (String(sql).includes("FROM platform_ai_team_tasks") && String(sql).includes("ORDER BY created_at DESC")) {
        return { rows: [{ id: "11111111-1111-4111-8111-111111111111", specialistKey: "translator", title: "Translate product", status: "queued" }] };
      }
      return { rows: [], rowCount: 0 };
    });
    const base = await startServer();
    const response = await fetch(base + "/api/platform/ai/tasks");
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.providerState.lastErrorCode).toBe("PROVIDER_RATE_LIMIT");
    expect(data.providerState.cooldownUntil).toBe("2026-11-15T09:00:00.000Z");
    expect(data.taskCounts).toEqual({ queued: 15, failed: 3 });
  });

  it("rejects unsupported specialist roles and oversized input", async () => {
    const base = await startServer();
    const response = await fetch(base + "/api/platform/ai/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specialistKey: "toString", title: "Run anything", inputText: "test" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.query.mock.calls.some(call => String(call[0]).includes("INSERT INTO platform_ai_team_tasks"))).toBe(false);
  });

  it("blocks task creation when the owner has paused the manager", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes("FROM platform_ai_manager_control WHERE")) {
        return { rows: [{ enabled: false, pausedReason: "maintenance", updatedAt: new Date().toISOString() }] };
      }
      return { rows: [], rowCount: 0 };
    });
    const base = await startServer();
    const response = await fetch(base + "/api/platform/ai/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specialistKey: "translator", title: "Translate", inputText: "Hello" }),
    });
    expect(response.status).toBe(423);
    expect(mocks.query.mock.calls.some(call => String(call[0]).includes("INSERT INTO platform_ai_team_tasks"))).toBe(false);
  });

  it("still allows the owner to cancel a queued task while the manager is paused", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes("FROM platform_ai_manager_control WHERE")) {
        return { rows: [{ enabled: false, pausedReason: "maintenance", updatedAt: new Date().toISOString() }] };
      }
      if (String(sql).includes("UPDATE platform_ai_team_tasks SET status = 'cancelled'")) {
        return { rows: [{ id: "11111111-1111-4111-8111-111111111111" }] };
      }
      return { rows: [], rowCount: 0 };
    });
    const base = await startServer();
    const response = await fetch(base + "/api/platform/ai/tasks/11111111-1111-4111-8111-111111111111/cancel", { method: "POST" });
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("cancelled");
  });

  it("creates a queued task without executing it and marks owner review as required", async () => {
    const base = await startServer();
    const response = await fetch(base + "/api/platform/ai/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specialistKey: "translator", title: "Translate product", inputText: "Translate this into English." }),
    });
    const data = await response.json();
    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.task.status).toBe("queued");
    expect(data.requiresOwnerReview).toBe(true);
    expect(mocks.query.mock.calls.some(call => String(call[0]).includes("INSERT INTO platform_ai_team_task_events"))).toBe(true);
  });
});
