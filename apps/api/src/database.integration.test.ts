import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { closeDatabaseConnection, ensureMemberStoreOrderTables, ensureStoreProductsTable, ensureVerifiedReviewTables } from "./database.js";
import { ensureMemberStoreReturnPolicyTables } from "./member-store-return-policy-schema.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: databaseUrl, max: 2 });

afterAll(async () => {
  await pool.end();
  await closeDatabaseConnection();
});

describe("WASLA database role permission scope integrity", () => {
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


describe("WASLA member-store order lifecycle schema", () => {
  beforeAll(async () => {
    await ensureStoreProductsTable();
    await ensureMemberStoreOrderTables();
    await ensureMemberStoreReturnPolicyTables();
    await ensureVerifiedReviewTables();
    // Startup bootstraps must remain safe when repeated after a restart.
    await ensureMemberStoreOrderTables();
    await ensureMemberStoreReturnPolicyTables();
    await ensureVerifiedReviewTables();
  });

  it("creates the event, review and return-policy schema idempotently", async () => {
    const tables = await pool.query(
      `SELECT
        to_regclass('public.member_store_order_events') IS NOT NULL AS events,
        to_regclass('public.member_store_shipments') IS NOT NULL AS shipments,
        to_regclass('public.member_store_delivery_evidence') IS NOT NULL AS delivery_evidence,
        to_regclass('public.verified_product_reviews') IS NOT NULL AS verified_reviews,
        to_regclass('public.member_store_return_requests') IS NOT NULL AS return_requests,
        to_regclass('public.member_store_return_policy_versions') IS NOT NULL AS return_policy_versions,
        to_regclass('public.member_store_return_escalations') IS NOT NULL AS return_escalations`,
    );
    expect(tables.rows[0]).toMatchObject({
      events: true,
      shipments: true,
      delivery_evidence: true,
      verified_reviews: true,
      return_requests: true,
      return_policy_versions: true,
      return_escalations: true,
    });

    const triggers = await pool.query(
      `SELECT c.relname AS table_name, t.tgname AS trigger_name
       FROM pg_trigger t
       JOIN pg_class c ON c.oid=t.tgrelid
       WHERE NOT t.tgisinternal
         AND (c.relname,t.tgname) IN (
           ('member_store_orders','member_store_orders_capture_events'),
           ('member_store_order_events','member_store_order_events_immutable'),
           ('member_store_delivery_evidence','member_store_delivery_evidence_immutable')
         )`,
    );
    const triggerNames = new Set(triggers.rows.map((row) => `${row.table_name}:${row.trigger_name}`));
    expect(triggerNames.has("member_store_orders:member_store_orders_capture_events")).toBe(true);
    expect(triggerNames.has("member_store_order_events:member_store_order_events_immutable")).toBe(true);
    expect(triggerNames.has("member_store_delivery_evidence:member_store_delivery_evidence_immutable")).toBe(true);
    expect(triggers.rowCount).toBe(3);

    const indexes = await pool.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname='public'
         AND tablename='member_store_return_requests'
         AND indexname='member_store_return_requests_one_active_idx'`,
    );
    expect(indexes.rowCount).toBe(1);

    const statusConstraint = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid='public.member_store_orders'::regclass
         AND conname='member_store_orders_status_check'`,
    );
    expect(statusConstraint.rowCount).toBe(1);
    expect(statusConstraint.rows[0].definition).toContain("'shipped'");
    expect(statusConstraint.rows[0].definition).toContain("'completed'");

    const policyColumns = await pool.query(
      `SELECT table_name,column_name FROM information_schema.columns
       WHERE table_schema='public'
         AND ((table_name='stores' AND column_name IN ('return_policy','return_policy_version'))
           OR (table_name='member_store_orders' AND column_name IN ('return_policy_snapshot','return_policy_version')))`,
    );
    const columns = new Set(policyColumns.rows.map((row) => `${row.table_name}:${row.column_name}`));
    expect(columns.has("stores:return_policy")).toBe(true);
    expect(columns.has("stores:return_policy_version")).toBe(true);
    expect(columns.has("member_store_orders:return_policy_snapshot")).toBe(true);
    expect(columns.has("member_store_orders:return_policy_version")).toBe(true);
  });
});
