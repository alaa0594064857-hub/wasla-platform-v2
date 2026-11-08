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
        seller_checkout_url text,
        status varchar(16) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'active', 'archived')),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT store_products_store_sku_unique UNIQUE (store_id, sku)
      )
    `);
    await client.query(`ALTER TABLE store_products ADD COLUMN IF NOT EXISTS seller_checkout_url text`);
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


/**
 * Bootstrap the single, explicitly configured WASLA platform owner.
 * This never creates a user and never grants ownership to a registration.
 */
export async function ensurePlatformOwnerRole(): Promise<void> {
  const ownerEmail = "alaa0594064857@gmail.com";
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");

    const ownerResult = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = lower($1) AND status = 'active' AND email_verified = TRUE FOR UPDATE`,
      [ownerEmail],
    );

    const roleResult = await client.query<{ id: string }>(
      `INSERT INTO roles (name, scope_type, description, is_system_role)
       VALUES ('platform_owner', 'platform', 'Original WASLA platform owner with highest platform authority', TRUE)
       ON CONFLICT (scope_type, name)
       DO UPDATE SET description = EXCLUDED.description, is_system_role = TRUE
       RETURNING id`,
    );

    const permissions = [
      ["platform.manage", "Manage platform-wide operations"],
      ["platform.users.read", "View platform users"],
      ["platform.users.manage", "Manage platform user accounts"],
      ["platform.roles.read", "View platform roles and assignments"],
      ["platform.roles.manage", "Manage platform roles and assignments"],
      ["platform.settings.manage", "Manage global platform settings"],
      ["platform.reports.read", "View global platform reports"],
      ["platform.security.read", "View platform security information"],
      ["platform.security.manage", "Manage platform security controls"],
      ["platform.audit.read", "View platform audit records"],
    ] as const;

    for (const [key, description] of permissions) {
      const permissionResult = await client.query<{ id: string }>(
        `INSERT INTO permissions (permission_key, description, scope_type)
         VALUES ($1, $2, 'platform')
         ON CONFLICT (permission_key)
         DO UPDATE SET description = EXCLUDED.description, scope_type = EXCLUDED.scope_type
         RETURNING id`,
        [key, description],
      );
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id, scope_type)
         VALUES ($1, $2, 'platform')
         ON CONFLICT (role_id, permission_id)
         DO UPDATE SET scope_type = EXCLUDED.scope_type`,
        [roleResult.rows[0].id, permissionResult.rows[0].id],
      );
    }

    if (ownerResult.rows[0]) {
      const ownerId = ownerResult.rows[0].id;
      const assignment = await client.query(
        `INSERT INTO platform_role_assignments (user_id, role_id, role_scope, status, assigned_by)
         VALUES ($1, $2, 'platform', 'active', $1)
         ON CONFLICT (user_id, role_id)
         DO UPDATE SET status = 'active', role_scope = 'platform'
         WHERE platform_role_assignments.status <> 'active'
            OR platform_role_assignments.role_scope <> 'platform'
         RETURNING id`,
        [ownerId, roleResult.rows[0].id],
      );

      if (assignment.rowCount) {
        await client.query(
          `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, metadata)
           VALUES ($1, 'platform.owner.bootstrap', 'platform_role_assignment', $2,
                   jsonb_build_object('owner_email', $3::text, 'role', 'platform_owner'))`,
          [ownerId, assignment.rows[0].id, ownerEmail],
        );
      }
    } else {
      console.warn("WASLA platform owner account is not yet verified and active; role assignment is deferred.");
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
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


/** Verified-purchase product reviews; creation is tied to a completed member-store order line. */
export async function ensureVerifiedReviewTables(): Promise<void> {
  const db = getDatabasePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS verified_product_reviews (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES member_store_orders(id) ON DELETE RESTRICT,
      product_id uuid NOT NULL REFERENCES store_products(id) ON DELETE RESTRICT,
      store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      buyer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
      title varchar(120),
      body varchar(2000) NOT NULL CHECK (length(trim(body)) BETWEEN 10 AND 2000),
      status varchar(24) NOT NULL DEFAULT 'pending_moderation'
        CHECK (status IN ('pending_moderation', 'published', 'rejected', 'hidden')),
      moderated_by uuid REFERENCES users(id) ON DELETE SET NULL,
      moderation_note varchar(1000),
      moderated_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, product_id)
    )
  `);
  await db.query(`
    ALTER TABLE verified_product_reviews
      ADD COLUMN IF NOT EXISTS moderated_by uuid REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS moderation_note varchar(1000),
      ADD COLUMN IF NOT EXISTS moderated_at timestamptz
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS verified_product_review_edits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      review_id uuid NOT NULL REFERENCES verified_product_reviews(id) ON DELETE RESTRICT,
      editor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      previous_rating smallint NOT NULL CHECK (previous_rating BETWEEN 1 AND 5),
      previous_title varchar(120),
      previous_body varchar(2000) NOT NULL,
      previous_status varchar(24) NOT NULL,
      changed_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS verified_product_review_edits_review_idx ON verified_product_review_edits (review_id, changed_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS verified_product_reviews_public_idx ON verified_product_reviews (product_id, created_at DESC) WHERE status = 'published'`);
  await db.query(`CREATE INDEX IF NOT EXISTS verified_product_reviews_buyer_idx ON verified_product_reviews (buyer_user_id, created_at DESC)`);
}

/** Separate inquiry records from private direct-message conversations. */
export async function ensureProductInquiryTables(): Promise<void> {
  const { ensureProductInquiryTables: createTables } = await import("./product-inquiries.mjs");
  await createTables();
}


/**
 * Provider-neutral billing records for WASLA subscriptions.
 * This creates empty structures only; it does not set prices,
 * create subscriptions, or enable payment collection.
 */
export async function ensureSubscriptionBillingTables(): Promise<void> {
  const client = await getDatabasePool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(80) NOT NULL UNIQUE,
        name_ar varchar(160) NOT NULL,
        name_en varchar(160) NOT NULL,
        description_ar text,
        description_en text,
        amount numeric(12,2) NOT NULL CHECK (amount >= 0),
        currency varchar(3) NOT NULL,
        billing_interval varchar(16) NOT NULL
          CHECK (billing_interval IN ('month', 'year', 'one_time')),
        interval_count integer NOT NULL DEFAULT 1 CHECK (interval_count > 0),
        trial_days integer NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
        entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
        is_active boolean NOT NULL DEFAULT false,
        is_public boolean NOT NULL DEFAULT false,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
        customer_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
        customer_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
        billing_contact_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        status varchar(24) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'expired')),
        payment_provider varchar(60),
        provider_customer_id varchar(255),
        provider_subscription_id varchar(255),
        provider_checkout_id varchar(255),
        current_period_start timestamptz,
        current_period_end timestamptz,
        trial_start timestamptz,
        trial_end timestamptz,
        cancel_at_period_end boolean NOT NULL DEFAULT false,
        canceled_at timestamptz,
        started_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT subscriptions_exactly_one_customer
          CHECK (num_nonnulls(customer_user_id, customer_account_id) = 1)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS subscriptions_user_status_idx
      ON subscriptions (customer_user_id, status, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS subscriptions_account_status_idx
      ON subscriptions (customer_account_id, status, created_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
        invoice_number varchar(100) NOT NULL UNIQUE,
        status varchar(20) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
        amount_due numeric(12,2) NOT NULL CHECK (amount_due >= 0),
        amount_paid numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
        currency varchar(3) NOT NULL,
        period_start timestamptz,
        period_end timestamptz,
        due_at timestamptz,
        paid_at timestamptz,
        payment_provider varchar(60),
        provider_invoice_id varchar(255),
        hosted_invoice_url text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT subscription_invoice_amount_paid_check
          CHECK (amount_paid <= amount_due)
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS subscription_invoices_provider_id_unique
      ON subscription_invoices (payment_provider, provider_invoice_id)
      WHERE provider_invoice_id IS NOT NULL
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_payment_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_provider varchar(60) NOT NULL,
        provider_event_id varchar(255) NOT NULL,
        event_type varchar(160) NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        processing_status varchar(16) NOT NULL DEFAULT 'received'
          CHECK (processing_status IN ('received', 'processed', 'failed')),
        processed_at timestamptz,
        failure_reason text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT subscription_payment_events_provider_event_unique
          UNIQUE (payment_provider, provider_event_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_admin_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
        actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        event_type varchar(32) NOT NULL CHECK (event_type IN ('created', 'status_changed')),
        from_status varchar(24),
        to_status varchar(24) NOT NULL,
        reason text NOT NULL CHECK (length(trim(reason)) >= 8),
        evidence_url text,
        created_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS subscription_admin_events_subscription_created_idx
      ON subscription_admin_events (subscription_id, created_at DESC)
    `);
  } finally {
    client.release();
  }
}


/** Member-owned store order requests; no payment capture or stock reservation occurs here. */
export async function ensureMemberStoreOrderTables(): Promise<void> {
  const client = await getDatabasePool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS member_store_orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number varchar(32) NOT NULL UNIQUE,
        store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
        buyer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        status varchar(32) NOT NULL DEFAULT 'pending_merchant_review'
          CHECK (status IN ('pending_merchant_review', 'accepted', 'rejected', 'cancelled', 'shipped', 'completed')),
        currency varchar(3) NOT NULL,
        items jsonb NOT NULL,
        subtotal numeric(14,2) NOT NULL CHECK (subtotal >= 0),
        buyer_note varchar(2000),
        merchant_note varchar(2000),
        idempotency_key varchar(100),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        UNIQUE (store_id, buyer_user_id, idempotency_key)
      )
    `);
    await client.query(`
      ALTER TABLE member_store_orders
        ADD COLUMN IF NOT EXISTS carrier_name varchar(100),
        ADD COLUMN IF NOT EXISTS tracking_number varchar(120),
        ADD COLUMN IF NOT EXISTS tracking_url text,
        ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
        ADD COLUMN IF NOT EXISTS delivery_confirmed_at timestamptz
    `);
    await client.query(`ALTER TABLE member_store_orders DROP CONSTRAINT IF EXISTS member_store_orders_status_check`);
    await client.query(`
      ALTER TABLE member_store_orders
      ADD CONSTRAINT member_store_orders_status_check
      CHECK (status IN ('pending_merchant_review', 'accepted', 'rejected', 'cancelled', 'shipped', 'completed'))
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS member_store_orders_store_created_idx
      ON member_store_orders (store_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS member_store_orders_buyer_created_idx
      ON member_store_orders (buyer_user_id, created_at DESC)
    `);
  } finally {
    client.release();
  }
}
