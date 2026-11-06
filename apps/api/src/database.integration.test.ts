import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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


describe("WASLA commerce PostgreSQL transaction guarantees", () => {
  const fixture = { userId: randomUUID(), accountId: randomUUID(), storeId: randomUUID(), productId: randomUUID() };

  beforeAll(async () => {
    await pool.query("INSERT INTO users (id, name, email, status) VALUES ($1, $2, $3, 'active')", [fixture.userId, "Commerce Integration Buyer", "commerce-" + fixture.userId + "@example.test"]);
    await pool.query("INSERT INTO accounts (id, account_type, legal_name, display_name, status) VALUES ($1, 'company', $2, $3, 'active')", [fixture.accountId, "Commerce Integration LLC", "Commerce Integration"]);
    await pool.query("INSERT INTO stores (id, account_id, name, slug, status) VALUES ($1, $2, $3, $4, 'active')", [fixture.storeId, fixture.accountId, "Commerce Integration Store", "commerce-" + fixture.storeId]);
    await pool.query("INSERT INTO store_products (id, store_id, title, sku, price, currency, stock_quantity, status) VALUES ($1, $2, $3, $4, 10.00, 'USD', 5, 'active')", [fixture.productId, fixture.storeId, "Concurrency Test Product", "SKU-" + fixture.productId]);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM stores WHERE id = $1", [fixture.storeId]);
    await pool.query("DELETE FROM accounts WHERE id = $1", [fixture.accountId]);
    await pool.query("DELETE FROM users WHERE id = $1", [fixture.userId]);
  });

  it("serializes concurrent stock reservations", async () => {
    await pool.query("UPDATE store_products SET stock_quantity = 5 WHERE id = $1", [fixture.productId]);
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query("BEGIN");
      const firstRead = await first.query("SELECT stock_quantity FROM store_products WHERE id = $1 FOR UPDATE", [fixture.productId]);
      expect(firstRead.rows[0].stock_quantity).toBe(5);
      await second.query("BEGIN");
      const secondReadPromise = second.query("SELECT stock_quantity FROM store_products WHERE id = $1 FOR UPDATE", [fixture.productId]);
      await first.query("UPDATE store_products SET stock_quantity = stock_quantity - 4 WHERE id = $1", [fixture.productId]);
      await first.query("COMMIT");
      const secondRead = await secondReadPromise;
      expect(secondRead.rows[0].stock_quantity).toBe(1);
      expect(Number(secondRead.rows[0].stock_quantity) >= 4).toBe(false);
      await second.query("ROLLBACK");
      const finalStock = await pool.query("SELECT stock_quantity FROM store_products WHERE id = $1", [fixture.productId]);
      expect(finalStock.rows[0].stock_quantity).toBe(1);
    } catch (error) {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      first.release();
      second.release();
    }
  });

  it("enforces buyer-scoped checkout idempotency", async () => {
    const orderId = randomUUID();
    const orderNumber = "WSL-" + orderId.replace(/-/g, "").slice(0, 20).toUpperCase();
    const key = "integration-" + randomUUID();
    try {
      await pool.query("INSERT INTO orders (id, order_number, buyer_user_id, store_id, status, currency, subtotal, discount_total, shipping_total, tax_total, grand_total, shipping_address_snapshot, idempotency_key) VALUES ($1,$2,$3,$4,'placed','USD',10,0,0,0,10,$5,$6)", [orderId, orderNumber, fixture.userId, fixture.storeId, JSON.stringify({ fullName: "Integration Buyer", countryCode: "US" }), key]);
      await expect(pool.query("INSERT INTO orders (order_number, buyer_user_id, store_id, status, currency, subtotal, discount_total, shipping_total, tax_total, grand_total, shipping_address_snapshot, idempotency_key) VALUES ($1,$2,$3,'placed','USD',10,0,0,0,10,$4,$5)", ["WSL-" + randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase(), fixture.userId, fixture.storeId, JSON.stringify({ fullName: "Integration Buyer", countryCode: "US" }), key])).rejects.toThrow();
    } finally {
      await pool.query("DELETE FROM orders WHERE id = $1", [orderId]);
    }
  });
});

afterAll(async () => {
  await pool.end();
});
