import { afterEach, describe, expect, it, vi } from "vitest";

describe("WASLA database configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("requires DATABASE_URL before creating a connection pool", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const database = await import("./database.js");

    expect(() => database.getDatabasePool()).toThrow(
      "DATABASE_URL environment variable is required",
    );
  });

  it("creates a pool when DATABASE_URL is configured", async () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://test:test@localhost:5432/wasla_test",
    );

    const database = await import("./database.js");

    const pool = database.getDatabasePool();

    expect(pool).toBeDefined();

    await database.closeDatabaseConnection();
  });
});
