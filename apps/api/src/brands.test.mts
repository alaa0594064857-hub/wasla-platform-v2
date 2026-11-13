import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createWaslaServer } from "./server.js";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("./database.js", () => ({
  getDatabasePool: vi.fn(),
}));

let server: Server | undefined;
const query = vi.fn();

async function startServer(): Promise<string> {
  server = createWaslaServer();
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "11111111-1111-4111-8111-111111111111", name: "Brand Owner", email: "owner@example.com" },
  } as never);
  query.mockReset();
  query.mockResolvedValue({ rows: [], rowCount: 0 });
  vi.mocked(getDatabasePool).mockReturnValue({ query } as never);
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close(error => error ? reject(error) : resolve());
    });
  }
  server = undefined;
  vi.clearAllMocks();
});

describe("brand logo upload validation", () => {
  it("rejects SVG data URLs instead of storing un-sanitized active markup", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/brands`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: "22222222-2222-4222-8222-222222222222",
        logoReference: "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+",
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Use a valid PNG, JPEG or WebP logo under 3 MB",
    });
    // Only the idempotent schema check ran; no ownership or update query was reached.
    expect(query).toHaveBeenCalledOnce();
  });

  it("rejects HTTPS logo URLs containing embedded credentials", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/brands`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: "22222222-2222-4222-8222-222222222222",
        logoReference: "https://user:password@example.com/logo.png",
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false });
    expect(query).toHaveBeenCalledOnce();
  });
});
