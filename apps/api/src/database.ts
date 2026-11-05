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

/**
 * Bootstrap the account-owner authorization records required
 * for account listing, member listing, and team invitations.
 * Every statement is idempotent and safe on every service start.
 */
export async function ensureAccountOwnerRole(): Promise<void> {
  const client = await getDatabasePool().connect();

  try {
    await client.query("BEGIN");

    const roleResult = await client.query<{ id: string }>(
      `INSERT INTO roles (
         name,
         scope_type,
         description,
         is_system_role
       )
       VALUES (
         'account_owner',
         'account',
         'Owner of a business account',
         TRUE
       )
       ON CONFLICT (scope_type, name)
       DO UPDATE SET
         description = EXCLUDED.description,
         is_system_role = TRUE
       RETURNING id`,
    );

    const permissions = [
      {
        key: "account.read",
        description: "View business account details",
      },
      {
        key: "account.member.read",
        description: "View business account members",
      },
      {
        key: "account.member.invite",
        description: "Invite members to a business account",
      },
    ];

    for (const permission of permissions) {
      const permissionResult = await client.query<{ id: string }>(
        `INSERT INTO permissions (
           permission_key,
           description,
           scope_type
         )
         VALUES ($1, $2, 'account')
         ON CONFLICT (permission_key)
         DO UPDATE SET
           description = EXCLUDED.description,
           scope_type = EXCLUDED.scope_type
         RETURNING id`,
        [permission.key, permission.description],
      );

      await client.query(
        `INSERT INTO role_permissions (
           role_id,
           permission_id,
           scope_type
         )
         VALUES ($1, $2, 'account')
         ON CONFLICT (role_id, permission_id)
         DO UPDATE SET scope_type = EXCLUDED.scope_type`,
        [roleResult.rows[0].id, permissionResult.rows[0].id],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Persist each signed-in user's appearance choice independently for every WASLA world. */
export async function ensurePersonalThemesTable(): Promise<void> {
  const client = await getDatabasePool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_world_themes (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        world_key varchar(50) NOT NULL,
        theme_key varchar(32) NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, world_key),
        CONSTRAINT user_world_themes_world_check
          CHECK (world_key IN ('global', 'store', 'shops', 'business', 'trade', 'messages', 'ai', 'command', 'profile')),
        CONSTRAINT user_world_themes_theme_check
          CHECK (theme_key IN ('default', 'midnight', 'ocean', 'gold', 'light', 'graphite'))
      )
    `);
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

/** Ensure the store-owner role exists before store endpoints accept requests. */
export async function ensureStoreOwnerRole(): Promise<void> {
  const client = await getDatabasePool().connect();
  try {
    await client.query(
      `INSERT INTO roles (name, scope_type, description, is_system_role)
       VALUES ('store_owner', 'store', 'Owner of a member store', TRUE)
       ON CONFLICT (scope_type, name)
       DO UPDATE SET description = EXCLUDED.description, is_system_role = TRUE`,
    );
  } finally {
    client.release();
  }
}
