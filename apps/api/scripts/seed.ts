import { Pool } from "pg";

import {
  PERMISSIONS,
  PERMISSION_SCOPES,
  ROLE_DEFINITIONS,
} from "../../../packages/shared/src/index.ts";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const pool = new Pool({
    connectionString,
    application_name: "wasla-authorization-seed",
    connectionTimeoutMillis: 5000,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: true }
        : undefined,
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const permissionIds = new Map<string, string>();

    for (const permission of PERMISSIONS) {
      const scope = PERMISSION_SCOPES[permission];

      const result = await client.query<{ id: string }>(
        `
          INSERT INTO permissions (
            permission_key,
            description,
            scope_type
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (permission_key)
          DO UPDATE SET
            description = EXCLUDED.description
          WHERE permissions.scope_type = EXCLUDED.scope_type
          RETURNING id
        `,
        [
          permission,
          `WASLA system permission: ${permission}`,
          scope,
        ],
      );

      if (result.rows.length !== 1) {
        throw new Error(
          `Permission scope conflict or seed failure: ${permission}`,
        );
      }

      permissionIds.set(permission, result.rows[0].id);
    }

    let permissionGrantCount = 0;

    for (const role of ROLE_DEFINITIONS) {
      const roleResult = await client.query<{ id: string }>(
        `
          INSERT INTO roles (
            name,
            scope_type,
            description,
            is_system_role
          )
          VALUES ($1, $2, $3, TRUE)
          ON CONFLICT (scope_type, name)
          DO UPDATE SET
            description = EXCLUDED.description,
            is_system_role = TRUE,
            updated_at = NOW()
          RETURNING id
        `,
        [
          role.name,
          role.scope,
          `WASLA system role: ${role.name} (${role.scope})`,
        ],
      );

      if (roleResult.rows.length !== 1) {
        throw new Error(`Could not create or update role: ${role.name}`);
      }

      const roleId = roleResult.rows[0].id;

      // Replace only this system role's permission links.
      // User memberships and platform assignments are never modified.
      await client.query(
        `DELETE FROM role_permissions WHERE role_id = $1`,
        [roleId],
      );

      for (const permission of role.permissions) {
        const permissionId = permissionIds.get(permission);

        if (!permissionId) {
          throw new Error(
            `Unknown permission "${permission}" in role "${role.name}"`,
          );
        }

        const grantResult = await client.query(
          `
            INSERT INTO role_permissions (
              role_id,
              permission_id,
              scope_type
            )
            VALUES ($1, $2, $3)
            ON CONFLICT (role_id, permission_id) DO NOTHING
            RETURNING permission_id
          `,
          [roleId, permissionId, role.scope],
        );

        if (grantResult.rows.length === 1) {
          permissionGrantCount += 1;
        }
      }
    }

    await client.query("COMMIT");

    console.log("WASLA authorization seed completed.");
    console.log(`Permissions processed: ${PERMISSIONS.length}`);
    console.log(`System roles processed: ${ROLE_DEFINITIONS.length}`);
    console.log(`Permission links inserted: ${permissionGrantCount}`);
    console.log("No users or memberships were assigned roles.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("WASLA authorization seed failed:", error);
  process.exitCode = 1;
});
