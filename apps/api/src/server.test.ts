
import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createWaslaServer } from "./server";

let server: Server | undefined;

async function startTestServer(): Promise<string> {
  server = createWaslaServer();

  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Could not determine test server address");
  }

  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  server = undefined;
});

describe("WASLA API", () => {
  it("returns healthy status from GET /health", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      service: "WASLA API",
      status: "healthy",
    });
  });

  it("rejects unsupported methods on /health", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/health`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({
      success: false,
      error: "Method not allowed",
    });
  });

  it("responds to the Better Auth health endpoint", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/auth/ok`);

    expect(response.status).toBe(200);
  });

  it("returns 404 for unknown routes", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/unknown`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Route not found",
    });
  });
});
