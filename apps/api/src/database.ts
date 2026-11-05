import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./db/schema.js";

function getDatabaseConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL environment variable is required",
    );
  }

  return {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    application_name: "wasla-api",

    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: true }
        : undefined,
  };
}

let pool: Pool | undefined;

export function getDatabasePool(): Pool {
  if (!pool) {
    pool = new Pool(getDatabaseConfig());

    pool.on("error", (error) => {
      console.error("WASLA database pool error:", error);
    });
  }

  return pool;
}

export function getDrizzleDatabase() {
  return drizzle({
    client: getDatabasePool(),
    schema,
  });
}

export async function ensureRegistrationTypeColumn(): Promise<void> {
  const client = await getDatabasePool().connect();

  try {
    await client.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "registration_type" varchar(32)',
    );
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection(): Promise<boolean> {
  const client = await getDatabasePool().connect();

  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    client.release();
  }
}

export async function closeDatabaseConnection(): Promise<void> {
  if (pool) {
    const currentPool = pool;
    pool = undefined;
    await currentPool.end();
  }
}
