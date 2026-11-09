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
}
