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

    await client.query(`
      ALTER TABLE official_store_products
        ADD COLUMN IF NOT EXISTS source_platform varchar(60),
        ADD COLUMN IF NOT EXISTS source_product_url text,
        ADD COLUMN IF NOT EXISTS supplier_dropship_confirmed boolean NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS supplier_minimum_quantity integer,
        ADD COLUMN IF NOT EXISTS supplier_quote_valid_until timestamptz,
        ADD COLUMN IF NOT EXISTS shipping_countries jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS estimated_shipping_days_min integer,
        ADD COLUMN IF NOT EXISTS estimated_shipping_days_max integer,
        ADD COLUMN IF NOT EXISTS landed_cost numeric(12,2),
        ADD COLUMN IF NOT EXISTS landed_cost_currency varchar(3)
    `);

    await client.query(`
      ALTER TABLE official_store_sourcing_candidates
        ADD COLUMN IF NOT EXISTS source_platform varchar(60),
        ADD COLUMN IF NOT EXISTS source_product_url text,
        ADD COLUMN IF NOT EXISTS supplier_dropship_confirmed boolean NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS minimum_order_quantity integer,
        ADD COLUMN IF NOT EXISTS shipping_countries jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS shipping_cost numeric(12,2),
        ADD COLUMN IF NOT EXISTS shipping_currency varchar(3),
        ADD COLUMN IF NOT EXISTS estimated_shipping_days_min integer,
        ADD COLUMN IF NOT EXISTS estimated_shipping_days_max integer,
        ADD COLUMN IF NOT EXISTS quote_valid_until timestamptz
    `);

    await client.query(`
      ALTER TABLE official_store_orders
        ADD COLUMN IF NOT EXISTS source_platform varchar(60),
        ADD COLUMN IF NOT EXISTS supplier_purchase_reference varchar(240),
        ADD COLUMN IF NOT EXISTS supplier_purchase_status varchar(20) NOT NULL DEFAULT 'not_placed'
          CHECK (supplier_purchase_status IN ('not_placed', 'pending', 'placed', 'accepted', 'rejected', 'cancelled', 'refunded')),
        ADD COLUMN IF NOT EXISTS supplier_unit_cost numeric(12,2),
        ADD COLUMN IF NOT EXISTS supplier_shipping_cost numeric(12,2),
        ADD COLUMN IF NOT EXISTS supplier_cost_currency varchar(3),
        ADD COLUMN IF NOT EXISTS supplier_order_url text,
        ADD COLUMN IF NOT EXISTS supplier_tracking_url text
    `);

    await client.query(`
      ALTER TABLE official_store_sourcing_candidates
        ADD COLUMN IF NOT EXISTS supplier_identity_verified boolean NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS specifications_verified boolean NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS sample_inspected boolean NOT NULL DEFAULT FALSE
    `);

    await client.query(`
      ALTER TABLE official_store_products
        ADD COLUMN IF NOT EXISTS canonical_gtin varchar(32),
        ADD COLUMN IF NOT EXISTS manufacturer_part_number varchar(120),
        ADD COLUMN IF NOT EXISTS brand_name varchar(180),
        ADD COLUMN IF NOT EXISTS model_name varchar(180),
        ADD COLUMN IF NOT EXISTS variant_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS normalized_specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS content_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS image_rights_status varchar(24) NOT NULL DEFAULT 'unreviewed'
          CHECK (image_rights_status IN ('unreviewed', 'authorized', 'original', 'restricted', 'rejected'))
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_products_gtin_idx
      ON official_store_products (canonical_gtin)
      WHERE canonical_gtin IS NOT NULL
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_products_mpn_brand_idx
      ON official_store_products (brand_name, manufacturer_part_number)
      WHERE manufacturer_part_number IS NOT NULL
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS official_store_product_source_offers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id uuid NOT NULL REFERENCES official_store_products(id) ON DELETE CASCADE,
        sourcing_candidate_id uuid REFERENCES official_store_sourcing_candidates(id) ON DELETE SET NULL,
        source_platform varchar(80) NOT NULL,
        source_product_url text NOT NULL,
        supplier_name varchar(180) NOT NULL,
        supplier_reference varchar(180),
        variant_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
        supplier_price numeric(12,2) NOT NULL CHECK (supplier_price >= 0),
        supplier_currency varchar(3) NOT NULL CHECK (supplier_currency ~ '^[A-Z]{3}
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
),
        shipping_cost numeric(12,2) CHECK (shipping_cost IS NULL OR shipping_cost >= 0),
        shipping_currency varchar(3) CHECK (shipping_currency IS NULL OR shipping_currency ~ '^[A-Z]{3}
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
),
        minimum_order_quantity integer CHECK (minimum_order_quantity IS NULL OR minimum_order_quantity >= 1),
        ships_to_countries jsonb NOT NULL DEFAULT '[]'::jsonb,
        direct_to_customer_confirmed boolean NOT NULL DEFAULT FALSE,
        availability_status varchar(24) NOT NULL DEFAULT 'needs_confirmation'
          CHECK (availability_status IN ('available', 'limited', 'unavailable', 'needs_confirmation', 'expired')),
        estimated_shipping_days_min integer CHECK (estimated_shipping_days_min IS NULL OR estimated_shipping_days_min >= 0),
        estimated_shipping_days_max integer CHECK (estimated_shipping_days_max IS NULL OR estimated_shipping_days_max >= 0),
        quote_valid_until timestamptz,
        last_verified_at timestamptz,
        supplier_identity_verified boolean NOT NULL DEFAULT FALSE,
        specifications_verified boolean NOT NULL DEFAULT FALSE,
        evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
        offer_status varchar(20) NOT NULL DEFAULT 'draft'
          CHECK (offer_status IN ('draft', 'needs_review', 'approved', 'paused', 'rejected', 'expired')),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT official_store_source_offer_url_https CHECK (source_product_url ~* '^https://'),
        CONSTRAINT official_store_source_offer_shipping_days_check CHECK (
          estimated_shipping_days_min IS NULL OR estimated_shipping_days_max IS NULL
          OR estimated_shipping_days_max >= estimated_shipping_days_min
        )
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS official_store_source_offer_url_unique
      ON official_store_product_source_offers (source_product_url)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_source_offer_product_status_idx
      ON official_store_product_source_offers (product_id, offer_status, updated_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_source_offer_supplier_idx
      ON official_store_product_source_offers (supplier_name, updated_at DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS official_store_product_media (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id uuid NOT NULL REFERENCES official_store_products(id) ON DELETE CASCADE,
        media_url text NOT NULL,
        media_type varchar(16) NOT NULL DEFAULT 'image'
          CHECK (media_type IN ('image', 'video')),
        source_url text,
        rights_status varchar(24) NOT NULL DEFAULT 'unreviewed'
          CHECK (rights_status IN ('unreviewed', 'authorized', 'original', 'restricted', 'rejected')),
        authorization_evidence_url text,
        attribution_text text,
        is_primary boolean NOT NULL DEFAULT FALSE,
        review_status varchar(16) NOT NULL DEFAULT 'pending'
          CHECK (review_status IN ('pending', 'approved', 'rejected')),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT official_store_product_media_https CHECK (media_url ~* '^https://')
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS official_store_product_media_product_idx
      ON official_store_product_media (product_id, is_primary DESC, created_at ASC)
    `);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
