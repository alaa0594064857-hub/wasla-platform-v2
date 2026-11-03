import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for integration tests");
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 2,
});

describe("WASLA database role permission scope integrity", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("allows a role and permission with the same scope", async () => {
    const roleId = randomUUID();
    const permissionId = randomUUID();

    try {
      await pool.query(
        `INSERT INTO roles (id, name, scope_type)
         VALUES ($1, $2, 'account')`,
        [roleId, `test_role_${roleId}`],
      );

      await pool.query(
        `INSERT INTO permissions (id, permission_key, scope_type)
         VALUES ($1, $2, 'account')`,
        [permissionId, `test.permission.${permissionId}`],
      );

      await pool.query(
        `INSERT INTO role_permissions (role_id, permission_id, scope_type)
         VALUES ($1, $2, 'account')`,
        [roleId, permissionId],
      );

      const result = await pool.query(
        `SELECT role_id
         FROM role_permissions
         WHERE role_id = $1 AND permission_id = $2`,
        [roleId, permissionId],
      );

      expect(result.rowCount).toBe(1);
    } finally {
      await pool.query("DELETE FROM roles WHERE id = $1", [roleId]);
      await pool.query("DELETE FROM permissions WHERE id = $1", [permissionId]);
    }
  });

  it("rejects a role and permission with different scopes", async () => {
    const roleId = randomUUID();
    const permissionId = randomUUID();

    try {
      await pool.query(
        `INSERT INTO roles (id, name, scope_type)
         VALUES ($1, $2, 'platform')`,
        [roleId, `test_role_${roleId}`],
      );

      await pool.query(
        `INSERT INTO permissions (id, permission_key, scope_type)
         VALUES ($1, $2, 'account')`,
        [permissionId, `test.permission.${permissionId}`],
      );

      await expect(
        pool.query(
          `INSERT INTO role_permissions (role_id, permission_id, scope_type)
           VALUES ($1, $2, 'platform')`,
          [roleId, permissionId],
        ),
      ).rejects.toThrow();
    } finally {
      await pool.query("DELETE FROM roles WHERE id = $1", [roleId]);
      await pool.query("DELETE FROM permissions WHERE id = $1", [permissionId]);
    }
  });
});
