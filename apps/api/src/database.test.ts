import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

describe("WASLA database configuration", () => {
  afterEach(async () => {
    vi.unstubAllEnvs();

    const database = await import("./database.js");

    await database.closeDatabaseConnection();

    vi.resetModules();
  });

  it("requires DATABASE_URL before creating a connection pool", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const database = await import("./database.js");

    expect(() => database.getDatabasePool()).toThrow(
      "DATABASE_URL environment variable is required",
    );
  });

  it("creates a PostgreSQL pool when DATABASE_URL is configured", async () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://test:test@localhost:5432/wasla_test",
    );

    const database = await import("./database.js");

    const pool = database.getDatabasePool();

    expect(pool).toBeDefined();

    await database.closeDatabaseConnection();
  });

  it("creates a typed Drizzle database client without connecting", async () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://test:test@localhost:5432/wasla_test",
    );

    const database = await import("./database.js");

    const client = database.getDrizzleDatabase();

    expect(client).toBeDefined();

    await database.closeDatabaseConnection();
  });
});
