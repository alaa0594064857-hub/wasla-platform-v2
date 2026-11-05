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


/** Product catalog foundation for each merchant-owned store. */
export async function ensureStoreProductsTable(): Promise<void> {
  const client = await getDatabasePool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        title varchar(180) NOT NULL,
        description text,
        sku varchar(80),
        price numeric(12,2) NOT NULL CHECK (price >= 0),
        currency varchar(3) NOT NULL DEFAULT 'USD',
        stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
        image_url text,
        video_url text,
        status varchar(16) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'active', 'archived')),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT store_products_store_sku_unique UNIQUE (store_id, sku)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS store_products_store_status_created_idx
      ON store_products (store_id, status, created_at DESC)
    `);
  } finally {
    client.release();
  }
}

/** Create private member relationships and business follows for WASLA Network. */
export async function ensureNetworkTables(): Promise<void> {
  const { ensureNetworkTables: createTables } = await import("./network.mjs");
  await createTables();
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
