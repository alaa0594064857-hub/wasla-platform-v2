import { getDatabasePool } from "./database.js";

/**
 * Store-owned return policy configuration and immutable order-time snapshots.
 * This bootstrap only creates schema; it does not alter production data or publish policies.
 */
export async function ensureMemberStoreReturnPolicyTables(): Promise<void> {
  const db = getDatabasePool();
  await db.query(`
    ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS return_policy jsonb,
      ADD COLUMN IF NOT EXISTS return_policy_version integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS return_policy_published_at timestamptz
  `);
  await db.query(`
    ALTER TABLE member_store_orders
      ADD COLUMN IF NOT EXISTS return_policy_snapshot jsonb,
      ADD COLUMN IF NOT EXISTS return_policy_version integer
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS member_store_return_policy_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      version integer NOT NULL CHECK (version > 0),
      policy jsonb NOT NULL,
      publication_status varchar(16) NOT NULL
        CHECK (publication_status IN ('draft','published','withdrawn')),
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      published_at timestamptz,
      UNIQUE (store_id, version)
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS member_store_return_policy_versions_store_idx
    ON member_store_return_policy_versions(store_id, version DESC)
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS member_store_return_escalations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      return_request_id uuid NOT NULL UNIQUE REFERENCES member_store_return_requests(id) ON DELETE RESTRICT,
      order_id uuid NOT NULL REFERENCES member_store_orders(id) ON DELETE RESTRICT,
      store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      buyer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      reason varchar(40) NOT NULL CHECK (reason IN ('legal_rights_claim','merchant_nonresponse','dispute')),
      details varchar(3000) NOT NULL CHECK (length(trim(details)) >= 10),
      status varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','closed')),
      support_note varchar(2000),
      handled_by uuid REFERENCES users(id) ON DELETE RESTRICT,
      handled_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS member_store_return_escalations_status_created_idx
    ON member_store_return_escalations(status, created_at ASC)
  `);
}
