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
      const finalStock = await second.query("SELECT stock_quantity FROM store_products WHERE id = $1", [fixture.productId]);
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


describe("WASLA Trade buyer and supplier access integrity", () => {
  const fixture = {
    buyerId: randomUUID(),
    supplierUserId: randomUUID(),
    outsiderId: randomUUID(),
    supplierAccountId: randomUUID(),
    roleId: randomUUID(),
    requestId: randomUUID(),
    offerId: randomUUID(),
    orderId: randomUUID(),
    dealId: randomUUID(),
  };

  beforeAll(async () => {
    await pool.query(
      "INSERT INTO users (id, name, email, status) VALUES ($1,$2,$3,'active'),($4,$5,$6,'active'),($7,$8,$9,'active')",
      [fixture.buyerId, "Trade Integration Buyer", "trade-buyer-" + fixture.buyerId + "@example.test",
       fixture.supplierUserId, "Trade Integration Supplier", "trade-supplier-" + fixture.supplierUserId + "@example.test",
       fixture.outsiderId, "Trade Integration Outsider", "trade-outsider-" + fixture.outsiderId + "@example.test"],
    );
    await pool.query(
      "INSERT INTO accounts (id, account_type, legal_name, display_name, status, country_code) VALUES ($1,'supplier',$2,$3,'active','TR')",
      [fixture.supplierAccountId, "Trade Integration Supplier LLC", "Trade Integration Supplier"],
    );
    await pool.query(
      "INSERT INTO roles (id, name, scope_type) VALUES ($1,$2,'account')",
      [fixture.roleId, "trade_integration_" + fixture.roleId],
    );
    await pool.query(
      "INSERT INTO account_members (account_id,user_id,role_id,role_scope,status,joined_at) VALUES ($1,$2,$3,'account','active',NOW())",
      [fixture.supplierAccountId, fixture.supplierUserId, fixture.roleId],
    );
    await pool.query(
      "INSERT INTO sourcing_requests (id,buyer_user_id,item_name,quantity,unit,destination_country_code,destination_city,requested_currency,status,idempotency_key) VALUES ($1,$2,'Trade integration item',2,'pieces','TR','Istanbul','USD','buyer_selected',$3)",
      [fixture.requestId, fixture.buyerId, "trade-request-" + randomUUID()],
    );
    await pool.query(
      "INSERT INTO supplier_offers (id,request_id,supplier_account_id,submitted_by_user_id,origin_country_code,offered_quantity,unit_price,currency,shipping_amount,status,availability_confirmed_at) VALUES ($1,$2,$3,$4,'TR',2,20,'USD',5,'accepted',NOW())",
      [fixture.offerId, fixture.requestId, fixture.supplierAccountId, fixture.supplierUserId],
    );
    await pool.query(
      "INSERT INTO sourcing_orders (id,order_number,request_id,accepted_offer_id,buyer_user_id,supplier_account_id,status,currency,subtotal,shipping_total,grand_total,commercial_snapshot,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,'awaiting_payment','USD',40,5,45,'{\"integration\":true}'::jsonb,$7)",
      [fixture.orderId, "WS-TRADE-" + fixture.orderId.replace(/-/g, "").slice(0, 12).toUpperCase(),
       fixture.requestId, fixture.offerId, fixture.buyerId, fixture.supplierAccountId, "trade-order-" + randomUUID()],
    );
    await pool.query(
      "INSERT INTO trade_deals (id,deal_number,sourcing_order_id,buyer_user_id,supplier_account_id,status,terms_snapshot,proposed_by_user_id) VALUES ($1,$2,$3,$4,$5,'agreed','{\"delivery\":\"Istanbul\"}'::jsonb,$4)",
      [fixture.dealId, "WD-" + fixture.dealId.replace(/-/g, "").slice(0, 12).toUpperCase(),
       fixture.orderId, fixture.buyerId, fixture.supplierAccountId],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM trade_deal_events WHERE deal_id = $1", [fixture.dealId]);
    await pool.query("DELETE FROM trade_deal_amendments WHERE deal_id = $1", [fixture.dealId]);
    await pool.query("DELETE FROM trade_deal_milestones WHERE deal_id = $1", [fixture.dealId]);
    await pool.query("DELETE FROM trade_deals WHERE id = $1", [fixture.dealId]);
    await pool.query("DELETE FROM sourcing_orders WHERE id = $1", [fixture.orderId]);
    await pool.query("DELETE FROM supplier_offers WHERE id = $1", [fixture.offerId]);
    await pool.query("DELETE FROM sourcing_requests WHERE id = $1", [fixture.requestId]);
    await pool.query("DELETE FROM account_members WHERE account_id = $1 AND user_id = $2", [fixture.supplierAccountId, fixture.supplierUserId]);
    await pool.query("DELETE FROM roles WHERE id = $1", [fixture.roleId]);
    await pool.query("DELETE FROM accounts WHERE id = $1", [fixture.supplierAccountId]);
    await pool.query("DELETE FROM users WHERE id IN ($1,$2,$3)", [fixture.buyerId, fixture.supplierUserId, fixture.outsiderId]);
  });

  async function canAccess(userId: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT (
         d.buyer_user_id = $2 OR EXISTS (
           SELECT 1 FROM account_members am
           INNER JOIN accounts a ON a.id = am.account_id
           WHERE am.account_id = d.supplier_account_id
             AND am.user_id = $2 AND am.status = 'active' AND a.status = 'active'
         )
       ) AS allowed
       FROM trade_deals d WHERE d.id = $1`,
      [fixture.dealId, userId],
    );
    return result.rows[0]?.allowed === true;
  }

  it("grants deal visibility only to the buyer and active supplier members", async () => {
    expect(await canAccess(fixture.buyerId)).toBe(true);
    expect(await canAccess(fixture.supplierUserId)).toBe(true);
    expect(await canAccess(fixture.outsiderId)).toBe(false);

    await pool.query(
      "UPDATE account_members SET status = 'suspended' WHERE account_id = $1 AND user_id = $2",
      [fixture.supplierAccountId, fixture.supplierUserId],
    );
    expect(await canAccess(fixture.supplierUserId)).toBe(false);
    await pool.query(
      "UPDATE account_members SET status = 'active' WHERE account_id = $1 AND user_id = $2",
      [fixture.supplierAccountId, fixture.supplierUserId],
    );
  });

  it("records an agreed-to-in-progress-to-completed buyer confirmation trail", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query("SELECT status FROM trade_deals WHERE id = $1 FOR UPDATE", [fixture.dealId]);
      expect(current.rows[0].status).toBe("agreed");
      await client.query("UPDATE trade_deals SET status = 'in_progress' WHERE id = $1", [fixture.dealId]);
      await client.query(
        "INSERT INTO trade_deal_events (deal_id,actor_user_id,event_type,from_status,to_status,metadata) VALUES ($1,$2,'deal_started','agreed','in_progress','{}'::jsonb)",
        [fixture.dealId, fixture.supplierUserId],
      );
      await client.query("UPDATE trade_deals SET status = 'completed' WHERE id = $1 AND status = 'in_progress'", [fixture.dealId]);
      await client.query(
        "INSERT INTO trade_deal_events (deal_id,actor_user_id,event_type,from_status,to_status,metadata) VALUES ($1,$2,'deal_completed','in_progress','completed','{}'::jsonb)",
        [fixture.dealId, fixture.buyerId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    const result = await pool.query(
      "SELECT d.status, count(e.id)::int AS event_count, count(*) FILTER (WHERE e.actor_user_id = $2 AND e.event_type = 'deal_completed')::int AS buyer_completion_events FROM trade_deals d LEFT JOIN trade_deal_events e ON e.deal_id = d.id WHERE d.id = $1 GROUP BY d.id",
      [fixture.dealId, fixture.buyerId],
    );
    expect(result.rows[0]).toMatchObject({ status: "completed", event_count: 2, buyer_completion_events: 1 });
  });
});

afterAll(async () => {
  await pool.end();
});


describe("WASLA sourcing PostgreSQL concurrency constraints", () => {
  const fixture = {
    buyerId: randomUUID(),
    supplierUserId: randomUUID(),
    supplierAccountId: randomUUID(),
    requestId: randomUUID(),
    offerId: randomUUID(),
  };

  beforeAll(async () => {
    await pool.query(
      "INSERT INTO users (id, name, email, status) VALUES ($1, $2, $3, 'active')",
      [fixture.buyerId, "Sourcing Integration Buyer", "sourcing-buyer-" + fixture.buyerId + "@example.test"],
    );
    await pool.query(
      "INSERT INTO users (id, name, email, status) VALUES ($1, $2, $3, 'active')",
      [fixture.supplierUserId, "Sourcing Integration Supplier", "sourcing-supplier-" + fixture.supplierUserId + "@example.test"],
    );
    await pool.query(
      "INSERT INTO accounts (id, account_type, legal_name, display_name, status) VALUES ($1, 'supplier', $2, $3, 'active')",
      [fixture.supplierAccountId, "Sourcing Integration Supplier LLC", "Sourcing Integration Supplier"],
    );
    await pool.query(
      `INSERT INTO sourcing_requests
       (id, buyer_user_id, item_name, quantity, unit, destination_country_code,
        destination_city, requested_currency, status, idempotency_key)
       VALUES ($1,$2,'Concurrency sourcing item',3,'pieces','TR','Istanbul','USD','offers_available',$3)`,
      [fixture.requestId, fixture.buyerId, "integration-request-" + randomUUID()],
    );
    await pool.query(
      `INSERT INTO supplier_offers
       (id, request_id, supplier_account_id, submitted_by_user_id, origin_country_code,
        offered_quantity, unit_price, currency, shipping_amount, status, availability_confirmed_at)
       VALUES ($1,$2,$3,$4,'TR',3,12.50,'USD',5.00,'available',NOW())`,
      [fixture.offerId, fixture.requestId, fixture.supplierAccountId, fixture.supplierUserId],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM sourcing_order_events WHERE order_id IN (SELECT id FROM sourcing_orders WHERE request_id = $1)", [fixture.requestId]);
    await pool.query("DELETE FROM sourcing_orders WHERE request_id = $1", [fixture.requestId]);
    await pool.query("DELETE FROM sourcing_request_events WHERE request_id = $1", [fixture.requestId]);
    await pool.query("DELETE FROM supplier_offers WHERE request_id = $1", [fixture.requestId]);
    await pool.query("DELETE FROM sourcing_requests WHERE id = $1", [fixture.requestId]);
    await pool.query("DELETE FROM accounts WHERE id = $1", [fixture.supplierAccountId]);
    await pool.query("DELETE FROM users WHERE id IN ($1,$2)", [fixture.buyerId, fixture.supplierUserId]);
  });

  it("serializes the same buyer idempotency key across different acceptance transactions", async () => {
    const first = await pool.connect();
    const second = await pool.connect();
    const key = "sourcing-acceptance-" + randomUUID();
    const orderId = randomUUID();
    try {
      await first.query("BEGIN");
      await second.query("BEGIN");
      await first.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [fixture.buyerId + ":" + key],
      );
      const competingLock = second.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [fixture.buyerId + ":" + key],
      );
      await first.query(
        `INSERT INTO sourcing_orders
         (id, order_number, request_id, accepted_offer_id, buyer_user_id, supplier_account_id,
          status, currency, subtotal, shipping_total, grand_total, commercial_snapshot, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,'awaiting_payment','USD',37.50,5.00,42.50,'{"integration":true}'::jsonb,$7)`,
        [orderId, "WS-IDEMP-" + orderId.replace(/-/g, "").slice(0, 12).toUpperCase(),
         fixture.requestId, fixture.offerId, fixture.buyerId, fixture.supplierAccountId, key],
      );
      await first.query("COMMIT");
      await competingLock;
      const replay = await second.query(
        "SELECT id FROM sourcing_orders WHERE buyer_user_id = $1 AND idempotency_key = $2",
        [fixture.buyerId, key],
      );
      expect(replay.rows).toHaveLength(1);
      expect(replay.rows[0].id).toBe(orderId);
      await second.query("ROLLBACK");
      await first.query("DELETE FROM sourcing_orders WHERE id = $1", [orderId]);
    } catch (error) {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      first.release();
      second.release();
    }
  });

  it("serializes two buyer acceptance transactions on the sourcing request row", async () => {
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query("UPDATE sourcing_requests SET status = 'offers_available' WHERE id = $1", [fixture.requestId]);
      await first.query("BEGIN");
      await second.query("BEGIN");
      const locked = await first.query(
        "SELECT id, status FROM sourcing_requests WHERE id = $1 FOR UPDATE",
        [fixture.requestId],
      );
      expect(locked.rows[0].status).toBe("offers_available");

      const competingLock = second.query(
        "SELECT id, status FROM sourcing_requests WHERE id = $1 FOR UPDATE",
        [fixture.requestId],
      );
      await first.query(
        "UPDATE sourcing_requests SET status = 'buyer_selected' WHERE id = $1",
        [fixture.requestId],
      );
      await first.query("COMMIT");

      const secondView = await competingLock;
      expect(secondView.rows[0].status).toBe("buyer_selected");
      await second.query("ROLLBACK");
    } catch (error) {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      first.release();
      second.release();
    }
  });

  it("serializes duplicate delivery confirmations and records only one completion event", async () => {
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query(
        `INSERT INTO sourcing_orders
         (order_number, request_id, accepted_offer_id, buyer_user_id, supplier_account_id,
          status, currency, subtotal, shipping_total, grand_total, commercial_snapshot, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,'shipped','USD',37.50,5.00,42.50,'{"integration":true}'::jsonb,$6)`,
        ["WS-DELIVERY-" + randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase(),
         fixture.requestId, fixture.offerId, fixture.buyerId, fixture.supplierAccountId,
         "sourcing-delivery-" + randomUUID()],
      );
      await first.query("BEGIN");
      await second.query("BEGIN");
      const firstOrder = await first.query(
        "SELECT id, status FROM sourcing_orders WHERE request_id = $1 FOR UPDATE",
        [fixture.requestId],
      );
      expect(firstOrder.rows[0].status).toBe("shipped");
      const secondConfirmation = second.query(
        "SELECT id, status FROM sourcing_orders WHERE request_id = $1 FOR UPDATE",
        [fixture.requestId],
      );
      await first.query(
        "UPDATE sourcing_orders SET status = 'completed' WHERE request_id = $1",
        [fixture.requestId],
      );
      await first.query(
        `INSERT INTO sourcing_order_events
         (order_id, actor_user_id, event_type, from_status, to_status, metadata)
         SELECT id, $2, 'buyer.delivery_confirmed', 'shipped', 'completed', '{"integration":true}'::jsonb
         FROM sourcing_orders WHERE request_id = $1`,
        [fixture.requestId, fixture.buyerId],
      );
      await first.query("COMMIT");
      const secondView = await secondConfirmation;
      expect(secondView.rows[0].status).toBe("completed");
      await second.query("ROLLBACK");
      const events = await first.query(
        "SELECT count(*)::int AS count FROM sourcing_order_events WHERE order_id = $1 AND event_type = 'buyer.delivery_confirmed'",
        [firstOrder.rows[0].id],
      );
      expect(events.rows[0].count).toBe(1);
      await first.query("DELETE FROM sourcing_order_events WHERE order_id = $1", [firstOrder.rows[0].id]);
      await first.query("DELETE FROM sourcing_orders WHERE id = $1", [firstOrder.rows[0].id]);
    } catch (error) {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      first.release();
      second.release();
    }
  });

  it("serializes competing order inserts and allows only one order per sourcing request", async () => {
    const first = await pool.connect();
    const second = await pool.connect();
    const orderValues = (suffix: string) => [
      "WS-" + suffix + randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(),
      fixture.requestId,
      fixture.offerId,
      fixture.buyerId,
      fixture.supplierAccountId,
      "USD",
      "37.50",
      "5.00",
      "42.50",
      JSON.stringify({ integration: true }),
      "sourcing-concurrency-" + suffix + randomUUID(),
    ] as const;
    const insertOrder = (client: typeof first, values: readonly unknown[]) => client.query(
      `INSERT INTO sourcing_orders
       (order_number, request_id, accepted_offer_id, buyer_user_id, supplier_account_id,
        status, currency, subtotal, shipping_total, grand_total, commercial_snapshot, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,'awaiting_payment',$6,$7,$8,$9,$10::jsonb,$11)`,
      [...values],
    );

    try {
      await first.query("BEGIN");
      await second.query("BEGIN");
      await insertOrder(first, orderValues("A"));
      const competingInsert = insertOrder(second, orderValues("B"));
      await first.query("COMMIT");
      await expect(competingInsert).rejects.toThrow();
      await second.query("ROLLBACK");
      const persisted = await first.query(
        "SELECT count(*)::int AS count FROM sourcing_orders WHERE request_id = $1",
        [fixture.requestId],
      );
      expect(persisted.rows[0].count).toBe(1);
    } catch (error) {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      first.release();
      second.release();
    }
  });

  it("serializes duplicate supplier offer submissions for the same user idempotency key", async () => {
    const first = await pool.connect();
    const second = await pool.connect();
    const key = "supplier-offer-" + randomUUID();
    const offerId = randomUUID();
    try {
      await first.query("BEGIN");
      await second.query("BEGIN");
      await first.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [fixture.supplierUserId + ":" + key],
      );
      const competingLock = second.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [fixture.supplierUserId + ":" + key],
      );

      await first.query(
        `INSERT INTO supplier_offers
         (id, request_id, supplier_account_id, submitted_by_user_id, origin_country_code,
          offered_quantity, unit_price, currency, shipping_amount, status, terms_snapshot)
         VALUES ($1,$2,$3,$4,'TR',3,12.50,'USD',5.00,'availability_pending','{"integration":true}'::jsonb)`,
        [offerId, fixture.requestId, fixture.supplierAccountId, fixture.supplierUserId],
      );
      await first.query(
        `INSERT INTO sourcing_request_events (request_id, actor_user_id, event_type, metadata)
         VALUES ($1,$2,'supplier.offer_submitted',$3::jsonb)`,
        [fixture.requestId, fixture.supplierUserId, JSON.stringify({ offerId, idempotencyKey: key })],
      );
      await first.query("COMMIT");

      await competingLock;
      const replay = await second.query(
        `SELECT e.request_id, o.id
         FROM sourcing_request_events e
         INNER JOIN supplier_offers o ON o.id::text = e.metadata->>'offerId'
         WHERE e.actor_user_id = $1
           AND e.event_type = 'supplier.offer_submitted'
           AND e.metadata->>'idempotencyKey' = $2`,
        [fixture.supplierUserId, key],
      );
      expect(replay.rows).toHaveLength(1);
      expect(replay.rows[0].id).toBe(offerId);
      await second.query("ROLLBACK");
    } catch (error) {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      first.release();
      second.release();
      await pool.query(
        "DELETE FROM sourcing_request_events WHERE actor_user_id = $1 AND event_type = 'supplier.offer_submitted' AND metadata->>'idempotencyKey' = $2",
        [fixture.supplierUserId, key],
      );
      await pool.query("DELETE FROM supplier_offers WHERE id = $1", [offerId]);
    }
  });

});

describe("WASLA deterministic sourcing match eligibility and ranking", () => {
  const buyerId = randomUUID();
  const requestId = randomUUID();
  const suppliers = [
    { id: randomUUID(), userId: randomUUID(), roleId: randomUUID(), origin: "TR", price: 14, shipping: 4, quantity: 5, status: "active", confirmed: true, valid: true },
    { id: randomUUID(), userId: randomUUID(), roleId: randomUUID(), origin: "DE", price: 8, shipping: 8, quantity: 5, status: "active", confirmed: true, valid: true },
    { id: randomUUID(), userId: randomUUID(), roleId: randomUUID(), origin: "TR", price: 1, shipping: 1, quantity: 2, status: "active", confirmed: true, valid: true },
    { id: randomUUID(), userId: randomUUID(), roleId: randomUUID(), origin: "TR", price: 1, shipping: 1, quantity: 5, status: "active", confirmed: false, valid: true },
    { id: randomUUID(), userId: randomUUID(), roleId: randomUUID(), origin: "TR", price: 1, shipping: 1, quantity: 5, status: "suspended", confirmed: true, valid: true },
    { id: randomUUID(), userId: randomUUID(), roleId: randomUUID(), origin: "TR", price: 1, shipping: 1, quantity: 5, status: "active", confirmed: true, valid: false },
  ];
  const offerIds = suppliers.map(() => randomUUID());

  beforeAll(async () => {
    await pool.query("INSERT INTO users (id,name,email,status) VALUES ($1,'Match Test Buyer',$2,'active')",
      [buyerId, "match-buyer-" + buyerId + "@example.test"]);
    await pool.query("INSERT INTO sourcing_requests (id,buyer_user_id,item_name,quantity,unit,destination_country_code,destination_city,requested_currency,status,idempotency_key) VALUES ($1,$2,'Match test item',5,'pieces','TR','Istanbul','USD','offers_available',$3)",
      [requestId, buyerId, "match-request-" + requestId]);
    for (const [index, supplier] of suppliers.entries()) {
      await pool.query("INSERT INTO users (id,name,email,status) VALUES ($1,$2,$3,'active')",
        [supplier.userId, "Match Supplier " + index, "match-supplier-" + supplier.userId + "@example.test"]);
      await pool.query("INSERT INTO accounts (id,account_type,legal_name,display_name,status,country_code) VALUES ($1,'supplier',$2,$3,$4,$5)",
        [supplier.id, "Match Supplier LLC " + index, "Match Supplier " + index, supplier.status, supplier.origin]);
      await pool.query("INSERT INTO roles (id,name,scope_type) VALUES ($1,$2,'account')",
        [supplier.roleId, "match_role_" + supplier.roleId]);
      await pool.query("INSERT INTO account_members (account_id,user_id,role_id,role_scope,status,joined_at) VALUES ($1,$2,$3,'account','active',NOW())",
        [supplier.id, supplier.userId, supplier.roleId]);
      await pool.query(
        "INSERT INTO supplier_offers (id,request_id,supplier_account_id,submitted_by_user_id,origin_country_code,offered_quantity,unit_price,currency,shipping_amount,status,availability_confirmed_at,availability_valid_until,quote_valid_until) VALUES ($1,$2,$3,$4,$5,$6,$7,'USD',$8,'available',$9,$10,$11)",
        [offerIds[index], requestId, supplier.id, supplier.userId, supplier.origin, supplier.quantity, supplier.price, supplier.shipping,
          supplier.confirmed ? new Date(supplier.valid ? Date.now() : Date.now() - 172_800_000) : null,
          new Date(supplier.valid ? Date.now() + 86_400_000 : Date.now() - 86_400_000),
          new Date(supplier.valid ? Date.now() + 86_400_000 : Date.now() - 86_400_000)],
      );
    }
  });

  afterAll(async () => {
    await pool.query("DELETE FROM supplier_offers WHERE request_id = $1", [requestId]);
    await pool.query("DELETE FROM sourcing_requests WHERE id = $1", [requestId]);
    for (const supplier of suppliers) {
      await pool.query("DELETE FROM account_members WHERE account_id = $1", [supplier.id]);
      await pool.query("DELETE FROM roles WHERE id = $1", [supplier.roleId]);
      await pool.query("DELETE FROM accounts WHERE id = $1", [supplier.id]);
      await pool.query("DELETE FROM users WHERE id = $1", [supplier.userId]);
    }
    await pool.query("DELETE FROM users WHERE id = $1", [buyerId]);
  });

  it("keeps eligible local offers ahead of cross-border offers and excludes invalid offers", async () => {
    const before = await pool.query("SELECT id,status,availability_confirmed_at,offered_quantity FROM supplier_offers WHERE request_id = $1 ORDER BY id", [requestId]);
    const result = await pool.query(
      "SELECT o.id,o.origin_country_code,o.offered_quantity,o.unit_price::text AS unit_price,o.shipping_amount::text AS shipping_amount,o.lead_time_days,sr.quantity AS requested_quantity FROM supplier_offers o JOIN sourcing_requests sr ON sr.id=o.request_id JOIN accounts a ON a.id=o.supplier_account_id WHERE o.request_id=$1 AND o.status='available' AND a.status='active' AND a.account_type IN ('supplier','manufacturer') AND EXISTS (SELECT 1 FROM account_members am WHERE am.account_id=a.id AND am.user_id=o.submitted_by_user_id AND am.status='active') AND o.availability_confirmed_at IS NOT NULL AND (o.availability_valid_until IS NULL OR o.availability_valid_until>NOW()) AND (o.quote_valid_until IS NULL OR o.quote_valid_until>NOW()) AND o.offered_quantity>=sr.quantity AND (sr.requested_currency IS NULL OR o.currency=sr.requested_currency)",
      [requestId],
    );
    const ranked = result.rows.sort((a: any,b: any) => {
      const localA = a.origin_country_code === "TR";
      const localB = b.origin_country_code === "TR";
      if (localA !== localB) return localA ? -1 : 1;
      const totalA = Number(a.unit_price) * Number(a.requested_quantity) + Number(a.shipping_amount);
      const totalB = Number(b.unit_price) * Number(b.requested_quantity) + Number(b.shipping_amount);
      return totalA - totalB;
    });
    expect(ranked).toHaveLength(2);
    expect(ranked[0].id).toBe(offerIds[0]);
    expect(ranked[1].id).toBe(offerIds[1]);
    const includedIds = new Set(ranked.map((offer: any) => offer.id));
    for (const index of [2,3,4,5]) expect(includedIds.has(offerIds[index])).toBe(false);
    const after = await pool.query("SELECT id,status,availability_confirmed_at,offered_quantity FROM supplier_offers WHERE request_id = $1 ORDER BY id", [requestId]);
    expect(after.rows).toEqual(before.rows);
  });

  it("does not expose another buyer's sourcing request to this buyer", async () => {
    const outsiderId = randomUUID();
    await pool.query("INSERT INTO users (id,name,email,status) VALUES ($1,'Other Buyer',$2,'active')",
      [outsiderId, "match-outsider-" + outsiderId + "@example.test"]);
    try {
      const result = await pool.query("SELECT id FROM sourcing_requests WHERE id=$1 AND buyer_user_id=$2", [requestId, outsiderId]);
      expect(result.rows).toHaveLength(0);
    } finally {
      await pool.query("DELETE FROM users WHERE id=$1", [outsiderId]);
    }
  });
});
