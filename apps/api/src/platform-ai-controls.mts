import { getDatabasePool } from "./database.js";

export type PlatformAiManagerControl = {
  enabled: boolean;
  pausedReason: string | null;
  updatedAt: string;
};

export async function ensurePlatformAiManagerControlTables(): Promise<void> {
  const db = getDatabasePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS platform_ai_manager_control (
      singleton_id boolean PRIMARY KEY DEFAULT TRUE CHECK (singleton_id = TRUE),
      manager_enabled boolean NOT NULL DEFAULT TRUE,
      paused_reason varchar(500),
      updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    INSERT INTO platform_ai_manager_control (singleton_id)
    VALUES (TRUE)
    ON CONFLICT (singleton_id) DO NOTHING
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS platform_ai_manager_control_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      manager_enabled boolean NOT NULL,
      reason varchar(500),
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getPlatformAiManagerControl(): Promise<PlatformAiManagerControl> {
  await ensurePlatformAiManagerControlTables();
  const result = await getDatabasePool().query(
    `SELECT manager_enabled AS enabled, paused_reason AS "pausedReason",
            updated_at AS "updatedAt"
     FROM platform_ai_manager_control WHERE singleton_id = TRUE`,
  );
  const row = result.rows[0];
  return {
    enabled: row?.enabled !== false,
    pausedReason: typeof row?.pausedReason === "string" ? row.pausedReason : null,
    updatedAt: row?.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row?.updatedAt ?? ""),
  };
}

export async function setPlatformAiManagerControl(
  enabled: boolean,
  actorUserId: string,
  reason: string | null,
): Promise<PlatformAiManagerControl> {
  await ensurePlatformAiManagerControlTables();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE platform_ai_manager_control
       SET manager_enabled = $1, paused_reason = $2,
           updated_by_user_id = $3, updated_at = NOW()
       WHERE singleton_id = TRUE`,
      [enabled, enabled ? null : reason, actorUserId],
    );
    await client.query(
      `INSERT INTO platform_ai_manager_control_events (actor_user_id, manager_enabled, reason)
       VALUES ($1, $2, $3)`,
      [actorUserId, enabled, reason],
    );
    await client.query("COMMIT");
    return await getPlatformAiManagerControl();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
