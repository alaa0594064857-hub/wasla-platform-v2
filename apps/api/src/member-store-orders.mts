import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

type OrderLine = { productId: string; quantity: number };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function respond(response: ServerResponse, status: number, data: Record<string, unknown>) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}
async function readBody(request: IncomingMessage): Promise<unknown> {
  let body = "";
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 16_000) throw new Error("Request body too large");
    body += chunk.toString();
  }
  return JSON.parse(body);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function merchantPermission(userPlaceholder: number, permissionsPlaceholder: number) {
  return `(
    EXISTS (
      SELECT 1 FROM account_members am
      INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
      INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
      INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
      WHERE am.account_id = s.account_id AND am.user_id = ${userPlaceholder}
        AND am.status = 'active' AND p.permission_key = ANY(${permissionsPlaceholder}::text[])
    )
    OR EXISTS (
      SELECT 1 FROM store_members sm
      INNER JOIN roles r ON r.id = sm.role_id AND r.scope_type = sm.role_scope
      INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
      INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
      WHERE sm.store_id = s.id AND sm.user_id = ${userPlaceholder}
        AND sm.status = 'active' AND p.permission_key = ANY(${permissionsPlaceholder}::text[])
    )
  )`;
}

export async function handleMemberStoreOrdersRequest(
  request: IncomingMessage,
  response: ServerResponse,
  slug: string,
  orderId?: string,
): Promise<void> {
  if (!["GET", "POST", "PATCH"].includes(request.method ?? "")) {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  if (orderId && !uuidPattern.test(orderId)) {
    respond(response, 400, { success: false, error: "Invalid order id" });
    return;
  }
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) {
    respond(response, 401, { success: false, error: "Authentication required" });
    return;
  }
  const pool = getDatabasePool();

  if (request.method === "GET") {
    const result = await pool.query(
      `SELECT o.id, o.order_number AS "orderNumber", o.store_id AS "storeId",
              o.buyer_user_id AS "buyerUserId", o.status, o.currency, o.items,
              o.subtotal::text AS subtotal, o.buyer_note AS "buyerNote",
              o.merchant_note AS "merchantNote", o.created_at AS "createdAt",
              o.updated_at AS "updatedAt"
       FROM member_store_orders o
       INNER JOIN stores s ON s.id = o.store_id
       WHERE s.slug = $1 AND s.status = 'active'
         AND (o.buyer_user_id = $2 OR ${merchantPermission(2, 3)})
       ORDER BY o.created_at DESC LIMIT 100`,
      [slug, session.user.id, ["store.order.read", "account.order.read"]],
    );
    respond(response, 200, { success: true, orders: result.rows });
    return;
  }

  if (request.method === "POST") {
    if (orderId) {
      respond(response, 405, { success: false, error: "Method not allowed" });
      return;
    }
    let body: unknown;
    try { body = await readBody(request); } catch {
      respond(response, 400, { success: false, error: "Invalid request body" });
      return;
    }
    if (!isObject(body) || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) {
      respond(response, 400, { success: false, error: "Add between 1 and 50 order items" });
      return;
    }
    const lines: OrderLine[] = [];
    for (const item of body.items) {
      if (!isObject(item) || typeof item.productId !== "string" || !uuidPattern.test(item.productId) ||
          !Number.isSafeInteger(item.quantity) || (item.quantity as number) < 1 || (item.quantity as number) > 10000) {
        respond(response, 400, { success: false, error: "Each item needs a valid product and quantity" });
        return;
      }
      if (lines.some((line) => line.productId === item.productId)) {
        respond(response, 400, { success: false, error: "Each product may appear only once" });
        return;
      }
      lines.push({ productId: item.productId, quantity: item.quantity as number });
    }
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > 2000) {
      respond(response, 400, { success: false, error: "Order note is too long" });
      return;
    }
    const idempotencyKey = request.headers["idempotency-key"];
    if (idempotencyKey !== undefined &&
        (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 100)) {
      respond(response, 400, { success: false, error: "Invalid idempotency key" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const store = await client.query(
        "SELECT id FROM stores WHERE slug = $1 AND status = 'active' FOR SHARE",
        [slug],
      );
      if (store.rowCount !== 1) {
        await client.query("ROLLBACK");
        respond(response, 404, { success: false, error: "Store not found" });
        return;
      }
      const products = await client.query(
        `SELECT id, title, sku, price::text AS price, currency, stock_quantity AS "stockQuantity"
         FROM store_products
         WHERE store_id = $1 AND status = 'active' AND id = ANY($2::uuid[])
         ORDER BY id FOR SHARE`,
        [store.rows[0].id, lines.map((line) => line.productId)],
      );
      if (products.rowCount !== lines.length) {
        await client.query("ROLLBACK");
        respond(response, 409, { success: false, error: "One or more products are unavailable" });
        return;
      }
      const byId = new Map(products.rows.map((product) => [product.id, product]));
      const snapshots = lines.map((line) => {
        const product = byId.get(line.productId)!;
        return {
          productId: product.id,
          title: product.title,
          sku: product.sku,
          unitPrice: product.price,
          currency: product.currency,
          quantity: line.quantity,
          availabilityAtRequest: product.stockQuantity,
        };
      });
      const currencies = new Set(snapshots.map((item) => item.currency));
      if (currencies.size !== 1) {
        await client.query("ROLLBACK");
        respond(response, 409, { success: false, error: "Products in one order must use the same currency" });
        return;
      }
      const subtotal = snapshots.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
      if (!Number.isFinite(subtotal) || subtotal > 999999999999) {
        await client.query("ROLLBACK");
        respond(response, 400, { success: false, error: "Order total is outside the supported range" });
        return;
      }
      const existing = idempotencyKey
        ? await client.query(
            `SELECT id, order_number AS "orderNumber", status FROM member_store_orders
             WHERE store_id = $1 AND buyer_user_id = $2 AND idempotency_key = $3`,
            [store.rows[0].id, session.user.id, idempotencyKey],
          )
        : { rowCount: 0, rows: [] };
      if (existing.rowCount) {
        await client.query("COMMIT");
        respond(response, 200, { success: true, order: existing.rows[0], reused: true });
        return;
      }
      const orderNumber = `WS-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const created = await client.query(
        `INSERT INTO member_store_orders
          (order_number, store_id, buyer_user_id, currency, items, subtotal, buyer_note, idempotency_key)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
         RETURNING id, order_number AS "orderNumber", status, currency,
                   items, subtotal::text AS subtotal, created_at AS "createdAt"`,
        [orderNumber, store.rows[0].id, session.user.id, snapshots[0].currency,
          JSON.stringify(snapshots), subtotal.toFixed(2), note || null, idempotencyKey ?? null],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, store_id, metadata)
         VALUES ($1, 'member_store.order_requested', 'member_store_order', $2, $3, $4::jsonb)`,
        [session.user.id, created.rows[0].id, store.rows[0].id,
          JSON.stringify({ orderNumber, itemCount: snapshots.length, subtotal: subtotal.toFixed(2) })],
      );
      await client.query("COMMIT");
      respond(response, 201, { success: true, order: created.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string })?.code === "23505" && idempotencyKey) {
        const existing = await pool.query(
          `SELECT id, order_number AS "orderNumber", status FROM member_store_orders
           WHERE store_id = (SELECT id FROM stores WHERE slug = $1)
             AND buyer_user_id = $2 AND idempotency_key = $3`,
          [slug, session.user.id, idempotencyKey],
        );
        if (existing.rowCount) {
          respond(response, 200, { success: true, order: existing.rows[0], reused: true });
          return;
        }
      }
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  if (!orderId) {
    respond(response, 400, { success: false, error: "Order id is required" });
    return;
  }
  let body: unknown;
  try { body = await readBody(request); } catch {
    respond(response, 400, { success: false, error: "Invalid request body" });
    return;
  }
  if (!isObject(body) || !["accepted", "rejected", "cancelled"].includes(String(body.status))) {
    respond(response, 400, { success: false, error: "Invalid order status" });
    return;
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 2000) {
    respond(response, 400, { success: false, error: "Order note is too long" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
    `UPDATE member_store_orders o
     SET status = $1, merchant_note = CASE WHEN $1 = 'cancelled' THEN merchant_note ELSE COALESCE(NULLIF($2, ''), merchant_note) END, updated_at = NOW()
     FROM stores s
     WHERE o.id = $3 AND o.store_id = s.id AND s.slug = $4 AND s.status = 'active'
       AND (
         ($1 = 'cancelled' AND o.buyer_user_id = $5 AND o.status = 'pending_merchant_review') OR
         ($1 IN ('accepted', 'rejected') AND o.status = 'pending_merchant_review' AND ${merchantPermission(5, 6)} )
       )
     RETURNING o.id, o.order_number AS "orderNumber", o.status, o.updated_at AS "updatedAt"`,
    [body.status, note, orderId, slug, session.user.id, ["store.order.manage", "account.order.manage"]],
    );
  if (result.rowCount !== 1) {
    await client.query("ROLLBACK");
    respond(response, 404, { success: false, error: "Order not found, access denied, or transition not allowed" });
    return;
  }
  await client.query(
    `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, metadata)
     VALUES ($1, 'member_store.order_status_changed', 'member_store_order', $2, $3::jsonb)`,
    [session.user.id, orderId, JSON.stringify({ status: body.status, note: note || null })],
  );
  await client.query("COMMIT");
  respond(response, 200, { success: true, order: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
