import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { closeDatabaseConnection } from "./database.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: databaseUrl, max: 2 });

describe("WASLA database role permission scope integrity", () => {
  afterAll(async () => {
    await pool.end();
    await closeDatabaseConnection();
  });

  it("allows a role and permission with the same scope", async () => {
    const roleId = randomUUID();
    const permissionId = randomUUID();
    try {
      await pool.query(
        `INSERT INTO roles (id, name, scope_type) VALUES ($1, $2, 'account')`,
        [roleId, `test_role_${roleId}`],
      );
      await pool.query(
        `INSERT INTO permissions (id, permission_key, scope_type) VALUES ($1, $2, 'account')`,
        [permissionId, `test.permission.${permissionId}`],
      );
      await pool.query(
        `INSERT INTO role_permissions (role_id, permission_id, scope_type) VALUES ($1, $2, 'account')`,
        [roleId, permissionId],
      );
      const result = await pool.query(
        `SELECT role_id FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
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
        `INSERT INTO roles (id, name, scope_type) VALUES ($1, $2, 'platform')`,
        [roleId, `test_role_${roleId}`],
      );
      await pool.query(
        `INSERT INTO permissions (id, permission_key, scope_type) VALUES ($1, $2, 'account')`,
        [permissionId, `test.permission.${permissionId}`],
      );
      await expect(
        pool.query(
          `INSERT INTO role_permissions (role_id, permission_id, scope_type) VALUES ($1, $2, 'platform')`,
          [roleId, permissionId],
        ),
      ).rejects.toThrow();
    } finally {
      await pool.query("DELETE FROM roles WHERE id = $1", [roleId]);
      await pool.query("DELETE FROM permissions WHERE id = $1", [permissionId]);
    }
  });

  it("bootstraps the full account/store role matrix idempotently", async () => {
    const { ensureAuthorizationRoles } = await import("./authorization-bootstrap.mjs");
    await ensureAuthorizationRoles();
    await ensureAuthorizationRoles();
    const result = await pool.query(
      `SELECT r.name AS role, p.permission_key
       FROM roles r
       INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
       INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
       WHERE (r.scope_type = 'account' AND r.name IN ('account_owner', 'account_admin', 'account_manager', 'account_employee', 'account_viewer'))
          OR (r.scope_type = 'store' AND r.name IN ('store_owner', 'store_admin', 'store_manager', 'store_employee'))`,
    );
    const grants = new Set(result.rows.map((row) => `${row.role}:${row.permission_key}`));
    expect(grants.has("account_employee:account.product.create")).toBe(true);
    expect(grants.has("account_viewer:account.product.read")).toBe(true);
    expect(grants.has("store_manager:store.product.create")).toBe(true);
    expect(grants.has("store_employee:store.product.read")).toBe(true);
    expect(grants.has("store_employee:store.product.create")).toBe(false);
  });
});
