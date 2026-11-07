import { getDatabasePool } from "./database.js";

/**
 * Platform-owned WASLA Store foundation.
 * Deliberately separate from member stores/products and does not create
 * inventory quantities, payment flows, orders, or an AI user account.
 */
export async function ensureOfficialStoreTables(): Promise<void> {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS official_store_settings (
        singleton_id boolean PRIMARY KEY DEFAULT TRUE CHECK (singleton_id = TRUE),
        name_ar varchar(160) NOT NULL DEFAULT 'متجر WASLA الرسمي',
        name_en varchar(160) NOT NULL DEFAULT 'Official WASLA Store',
        description_ar text,
        description_en text,
        status varchar(16) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'active', 'suspended')),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      INSERT INTO official_store_settings (singleton_id)
      VALUES (TRUE)
      ON CONFLICT (singleton_id) DO NOTHING
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS official_store_products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        store_singleton_id boolean NOT NULL DEFAULT TRUE
          CHECK (store_singleton_id = TRUE)
          REFERENCES official_store_settings(singleton_id) ON DELETE RESTRICT,
        title_ar varchar(180) NOT NULL,
        title_en varchar(180) NOT NULL,
        description_ar text,
        description_en text,
        price numeric(12,2) NOT NULL CHECK (price >= 0),
        currency varchar(3) NOT NULL DEFAULT 'USD',
        supplier_name varchar(180),
        supplier_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
        supplier_contact_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        supplier_product_reference varchar(160),
        availability_status varchar(20) NOT NULL DEFAULT 'needs_confirmation'
          CHECK (availability_status IN ('available', 'limited', 'unavailable', 'needs_confirmation')),
        fulfillment_notes text,
        image_url text,
        status varchar(16) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'published', 'archived')),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_products_status_created_idx
      ON official_store_products (status, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_products_supplier_account_idx
      ON official_store_products (supplier_account_id)
      WHERE supplier_account_id IS NOT NULL
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS official_store_inquiries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        product_id uuid REFERENCES official_store_products(id) ON DELETE SET NULL,
        subject varchar(200),
        status varchar(24) NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'assigned', 'awaiting_customer', 'escalated', 'resolved', 'closed')),
        assigned_ai_agent_key varchar(100) NOT NULL DEFAULT 'wasla-official-store-ai',
        assigned_human_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        escalation_reason text,
        resolved_at timestamptz,
        closed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_inquiries_customer_created_idx
      ON official_store_inquiries (customer_user_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_inquiries_status_updated_idx
      ON official_store_inquiries (status, updated_at DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS official_store_inquiry_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        inquiry_id uuid NOT NULL REFERENCES official_store_inquiries(id) ON DELETE CASCADE,
        sender_type varchar(16) NOT NULL
          CHECK (sender_type IN ('customer', 'ai', 'human', 'system')),
        sender_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
        body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT official_store_message_sender_check CHECK (
          (sender_type IN ('customer', 'human') AND sender_user_id IS NOT NULL)
          OR (sender_type IN ('ai', 'system') AND sender_user_id IS NULL)
        )
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_inquiry_messages_thread_idx
      ON official_store_inquiry_messages (inquiry_id, created_at ASC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS official_store_activity_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        inquiry_id uuid REFERENCES official_store_inquiries(id) ON DELETE SET NULL,
        product_id uuid REFERENCES official_store_products(id) ON DELETE SET NULL,
        actor_type varchar(16) NOT NULL
          CHECK (actor_type IN ('system', 'ai', 'human', 'customer')),
        actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
        action varchar(120) NOT NULL,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT official_store_activity_actor_check CHECK (
          (actor_type IN ('human', 'customer') AND actor_user_id IS NOT NULL)
          OR (actor_type IN ('system', 'ai') AND actor_user_id IS NULL)
        )
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_activity_created_idx
      ON official_store_activity_log (created_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS official_store_sourcing_candidates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id uuid REFERENCES official_store_products(id) ON DELETE SET NULL,
        supplier_name varchar(180) NOT NULL,
        supplier_website text,
        supplier_contact text,
        supplier_product_reference varchar(180),
        proposed_title text,
        proposed_description text,
        proposed_price numeric(12,2) CHECK (proposed_price IS NULL OR proposed_price >= 0),
        currency varchar(3),
        availability_claim text,
        fulfilment_claim text,
        evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
        verification_status varchar(20) NOT NULL DEFAULT 'unverified'
          CHECK (verification_status IN ('unverified', 'awaiting_supplier', 'partially_verified', 'verified', 'rejected')),
        review_status varchar(20) NOT NULL DEFAULT 'draft'
          CHECK (review_status IN ('draft', 'needs_owner_review', 'approved', 'rejected', 'converted')),
        reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_sourcing_review_created_idx
      ON official_store_sourcing_candidates (review_status, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_sourcing_verification_idx
      ON official_store_sourcing_candidates (verification_status, updated_at DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS official_store_orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number varchar(32) NOT NULL UNIQUE,
        customer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        product_id uuid REFERENCES official_store_products(id) ON DELETE SET NULL,
        product_title_snapshot varchar(360) NOT NULL,
        quantity integer NOT NULL CHECK (quantity > 0 AND quantity <= 100000),
        unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
        currency varchar(3) NOT NULL,
        supplier_name_snapshot varchar(180),
        supplier_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
        supplier_contact_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        supplier_confirmation_status varchar(20) NOT NULL DEFAULT 'pending'
          CHECK (supplier_confirmation_status IN ('pending', 'accepted', 'rejected', 'expired')),
        order_status varchar(24) NOT NULL DEFAULT 'awaiting_supplier'
          CHECK (order_status IN ('draft', 'awaiting_supplier', 'awaiting_payment', 'paid', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded', 'exception')),
        payment_status varchar(20) NOT NULL DEFAULT 'not_enabled'
          CHECK (payment_status IN ('not_enabled', 'pending', 'paid', 'failed', 'refunded')),
        payment_provider_reference varchar(240),
        shipping_carrier varchar(120),
        tracking_reference varchar(180),
        shipping_status varchar(24) NOT NULL DEFAULT 'not_shipped'
          CHECK (shipping_status IN ('not_shipped', 'preparing', 'shipped', 'in_transit', 'delivered', 'exception')),
        shipping_address jsonb,
        customer_note text,
        owner_review_required boolean NOT NULL DEFAULT FALSE,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_orders_customer_created_idx
      ON official_store_orders (customer_user_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_orders_status_updated_idx
      ON official_store_orders (order_status, updated_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_orders_supplier_idx
      ON official_store_orders (supplier_account_id, created_at DESC)
      WHERE supplier_account_id IS NOT NULL
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS official_store_order_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES official_store_orders(id) ON DELETE RESTRICT,
        actor_type varchar(16) NOT NULL
          CHECK (actor_type IN ('system', 'ai', 'human', 'customer', 'supplier')),
        actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
        event_type varchar(120) NOT NULL,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT official_store_order_event_actor_check CHECK (
          (actor_type IN ('human', 'customer', 'supplier') AND actor_user_id IS NOT NULL)
          OR (actor_type IN ('system', 'ai') AND actor_user_id IS NULL)
        )
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_order_events_order_created_idx
      ON official_store_order_events (order_id, created_at ASC)
    `);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
