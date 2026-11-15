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

async function startServer() {
  const currentServer = createWaslaServer();
  server = currentServer;
  await new Promise<void>((resolve, reject) => {
    currentServer.once("error", reject);
    currentServer.listen(0, "127.0.0.1", resolve);
  });
  const address = currentServer.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
  }
  server = undefined;
  vi.clearAllMocks();
});

describe("member store order authentication boundary", () => {
  it("rejects unauthenticated order lists, timelines, creation, and status changes before database access", async () => {
    const baseUrl = await startServer();
    const orderId = "22222222-2222-4222-8222-222222222222";

    const requests = [
      fetch(`${baseUrl}/api/stores/demo/orders`),
      fetch(`${baseUrl}/api/stores/demo/orders/${orderId}`),
      fetch(`${baseUrl}/api/stores/demo/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ productId: orderId, quantity: 1 }] }),
      }),
      fetch(`${baseUrl}/api/stores/demo/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      }),
    ];

    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
    for (const response of responses) {
      expect(await response.json()).toEqual({
        success: false,
        error: "Authentication required",
      });
    }

    expect(auth.api.getSession).toHaveBeenCalledTimes(4);
    expect(getDatabasePool).not.toHaveBeenCalled();
  });
});
