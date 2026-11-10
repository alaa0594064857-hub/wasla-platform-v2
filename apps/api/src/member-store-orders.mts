import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

type OrderLine = { productId: string; quantity: number };

function currencyFractionDigits(currency: string): number | null {
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
    return Number.isInteger(digits) ? digits ?? null : null;
  } catch {
    return null;
  }
}

function decimalToMinorUnits(value: string, fractionDigits: number): bigint | null {
  if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > fractionDigits) return null;
  return BigInt(whole) * (10n ** BigInt(fractionDigits)) +
    BigInt((fraction + "0".repeat(fractionDigits)).slice(0, fractionDigits) || "0");
}

function minorUnitsToDecimal(value: bigint, fractionDigits: number): string {
  if (fractionDigits === 0) return value.toString();
  const scale = 10n ** BigInt(fractionDigits);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(fractionDigits, "0");
  return `${whole}.${fraction}`;
}
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
    if (orderId) {
      const owned = await pool.query(
        `SELECT o.id
         FROM member_store_orders o
         INNER JOIN stores s ON s.id = o.store_id
         WHERE o.id = $1 AND s.slug = $2 AND s.status = 'active'
           AND (o.buyer_user_id = $3 OR ${merchantPermission(3, 4)})
         LIMIT 1`,
        [orderId, slug, session.user.id, ["store.order.read", "account.order.read"]],
      );
      if (!owned.rowCount) {
        respond(response, 404, { success: false, error: "Order not found" });
        return;
      }
      const events = await pool.query(
        `SELECT id, event_type AS "eventType", from_status AS "fromStatus",
                to_status AS "toStatus", source, reason_code AS "reasonCode",
                created_at AS "createdAt"
         FROM (
           SELECT id, event_type, from_status, to_status, source, reason_code, created_at
           FROM member_store_order_events
           WHERE order_id = $1
           ORDER BY created_at DESC, id DESC
           LIMIT 200
         ) recent_events
         ORDER BY created_at ASC, id ASC`,
        [orderId],
      );
      const safeEvents = events.rows.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        source: event.source,
        reasonCode: event.reasonCode,
        createdAt: event.createdAt,
      }));
      respond(response, 200, { success: true, events: safeEvents });
      return;
    }
    const result = await pool.query(
      `SELECT o.id, o.order_number AS "orderNumber", o.store_id AS "storeId",
              o.buyer_user_id AS "buyerUserId", o.status, o.currency, o.items,
              o.subtotal::text AS subtotal, o.buyer_note AS "buyerNote",
              o.return_policy_snapshot AS "returnPolicySnapshot", o.return_policy_version AS "returnPolicyVersion",
              CASE WHEN o.buyer_user_id = $2 THEN NULL ELSE o.merchant_note END AS "merchantNote",
              o.carrier_name AS "carrierName", o.tracking_number AS "trackingNumber",
              o.tracking_url AS "trackingUrl", o.shipped_at AS "shippedAt",
              o.delivery_confirmed_at AS "deliveryConfirmedAt",
              d.id AS "disputeId", d.reason AS "disputeReason", d.details AS "disputeDetails",
              d.status AS "disputeStatus", d.merchant_response AS "merchantResponse",
              d.moderator_note AS "moderatorNote",
              rr.id AS "returnRequestId", rr.requested_resolution AS "returnResolution",
              rr.reason AS "returnReason", rr.details AS "returnDetails",
              rr.status AS "returnStatus", rr.merchant_response AS "returnMerchantResponse",
              rr.created_at AS "returnCreatedAt", rr.item_received_at AS "returnItemReceivedAt",
              o.created_at AS "createdAt", o.updated_at AS "updatedAt"
       FROM member_store_orders o
       INNER JOIN stores s ON s.id = o.store_id
       LEFT JOIN LATERAL (
         SELECT id, reason, details, status, merchant_response, moderator_note
         FROM member_store_order_disputes d
         WHERE d.order_id = o.id AND d.status <> 'closed'
         ORDER BY d.created_at DESC LIMIT 1
       ) d ON TRUE
       LEFT JOIN LATERAL (
         SELECT id, requested_resolution, reason, details, status, merchant_response, created_at, item_received_at
         FROM member_store_return_requests r
         WHERE r.order_id = o.id AND r.status <> 'closed'
         ORDER BY r.created_at DESC LIMIT 1
       ) rr ON TRUE
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
        "SELECT id, account_id AS \"accountId\", return_policy AS \"returnPolicy\", return_policy_version AS \"returnPolicyVersion\" FROM stores WHERE slug = $1 AND status = 'active' FOR SHARE",
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
      const currency = snapshots[0].currency;
      const fractionDigits = currencyFractionDigits(currency);
      if (fractionDigits === null) {
        await client.query("ROLLBACK");
        respond(response, 400, { success: false, error: "Unsupported order currency" });
        return;
      }
      const subtotalMinorUnits = snapshots.reduce<bigint | null>((sum, item) => {
        const unitMinorUnits = decimalToMinorUnits(item.unitPrice, fractionDigits);
        if (sum === null || unitMinorUnits === null) return null;
        return sum + unitMinorUnits * BigInt(item.quantity);
      }, 0n);
      if (subtotalMinorUnits === null || subtotalMinorUnits > 999999999999n * (10n ** BigInt(fractionDigits))) {
        await client.query("ROLLBACK");
        respond(response, 400, { success: false, error: "Order total or currency precision is invalid" });
        return;
      }
      const subtotal = minorUnitsToDecimal(subtotalMinorUnits, fractionDigits);
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
        `WITH actor_context AS MATERIALIZED (SELECT set_config('wasla.actor_user_id', $11, true))
         INSERT INTO member_store_orders
          (order_number, store_id, buyer_user_id, currency, items, subtotal, buyer_note, idempotency_key,
           return_policy_snapshot, return_policy_version)
         SELECT $1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10 FROM actor_context
         RETURNING id, order_number AS "orderNumber", status, currency,
                   items, subtotal::text AS subtotal, created_at AS "createdAt"`,
        [orderNumber, store.rows[0].id, session.user.id, snapshots[0].currency,
          JSON.stringify(snapshots), subtotal, note || null, idempotencyKey ?? null,
          JSON.stringify(store.rows[0].returnPolicy && typeof store.rows[0].returnPolicy === "object" ? store.rows[0].returnPolicy : { status: "not_provided" }),
          Number(store.rows[0].returnPolicyVersion) > 0 ? store.rows[0].returnPolicyVersion : null,
          session.user.id],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, store_id, metadata)
         VALUES ($1, 'member_store.order_requested', 'member_store_order', $2, $3, $4::jsonb)`,
        [session.user.id, created.rows[0].id, store.rows[0].id,
          JSON.stringify({ orderNumber, itemCount: snapshots.length, subtotal, currency })],
      );
      // Notify active account/store members with order permissions; never expose this alert to the buyer.
      await client.query(
        `INSERT INTO notifications
           (user_id, type, title_ar, title_en, body_ar, body_en, action_url, resource_id, metadata)
         SELECT DISTINCT recipients.user_id, 'member_store_order',
                'طلب جديد في متجرك', 'New order request for your store',
                'لديك طلب جديد رقم ' || $6, 'You received a new order request ' || $6,
                '/store/' || $1 || '/orders', $2,
                jsonb_build_object('orderNumber', $6, 'storeSlug', $1)
         FROM (
           SELECT am.user_id
           FROM account_members am
           JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
           JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
           JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
           WHERE am.account_id = $3 AND am.status = 'active'
             AND p.permission_key = ANY($4::text[])
           UNION
           SELECT sm.user_id
           FROM store_members sm
           JOIN roles r ON r.id = sm.role_id AND r.scope_type = sm.role_scope
           JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
           JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
           WHERE sm.store_id = $5 AND sm.status = 'active'
             AND p.permission_key = ANY($4::text[])
         ) recipients
         WHERE recipients.user_id <> $7`,
        [slug, created.rows[0].id, store.rows[0].accountId,
          ["store.order.read", "store.order.manage", "account.order.read", "account.order.manage"],
          store.rows[0].id, orderNumber, session.user.id],
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
  if (!isObject(body) || !["accepted", "rejected", "cancelled", "shipped", "completed"].includes(String(body.status))) {
    respond(response, 400, { success: false, error: "Invalid order status" });
    return;
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const carrierName = typeof body.carrierName === "string" ? body.carrierName.trim() : "";
  const trackingNumber = typeof body.trackingNumber === "string" ? body.trackingNumber.trim() : "";
  const trackingUrl = typeof body.trackingUrl === "string" ? body.trackingUrl.trim() : "";
  let parsedTrackingUrl: URL | undefined;
  if (body.status === "shipped") {
    try { parsedTrackingUrl = new URL(trackingUrl); } catch { /* validated below */ }
  }
  if (body.status === "shipped" &&
      (carrierName.length < 2 || carrierName.length > 100 ||
       trackingNumber.length < 3 || trackingNumber.length > 120 ||
       !parsedTrackingUrl || parsedTrackingUrl.protocol !== "https:" ||
       !parsedTrackingUrl.hostname || parsedTrackingUrl.username || parsedTrackingUrl.password ||
       trackingUrl.length > 1000)) {
    respond(response, 400, { success: false, error: "Shipping requires a carrier, tracking number, and secure tracking URL" });
    return;
  }
  if (body.status !== "shipped" &&
      (body.carrierName !== undefined || body.trackingNumber !== undefined || body.trackingUrl !== undefined)) {
    respond(response, 400, { success: false, error: "Shipping details are accepted only when marking an order as shipped" });
    return;
  }
  if (note.length > 2000) {
    respond(response, 400, { success: false, error: "Order note is too long" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let acceptedCancellation: { items: unknown; storeId: string } | null = null;
    if (body.status === "cancelled") {
      const priorOrder = await client.query(
        `SELECT o.status, o.items, o.store_id AS "storeId", o.inventory_committed_at AS "inventoryCommittedAt"
         FROM member_store_orders o
         INNER JOIN stores s ON s.id = o.store_id
         WHERE o.id = $1 AND s.slug = $2 AND s.status = 'active'
         FOR UPDATE OF o`,
        [orderId, slug],
      );
      if (priorOrder.rowCount === 1 && priorOrder.rows[0].status === "accepted" && priorOrder.rows[0].inventoryCommittedAt) {
        acceptedCancellation = { items: priorOrder.rows[0].items, storeId: priorOrder.rows[0].storeId };
      }
    }
    let releasedInventory: Array<{ productId: string; quantity: number }> = [];
    const result = await client.query(
    `WITH actor_context AS MATERIALIZED (SELECT set_config('wasla.actor_user_id', $10, true))
     UPDATE member_store_orders o
     SET status = $1,
         merchant_note = CASE WHEN $1 IN ('cancelled', 'completed') THEN merchant_note ELSE COALESCE(NULLIF($2, ''), merchant_note) END,
         carrier_name = CASE WHEN $1 = 'shipped' THEN $7 ELSE carrier_name END,
         tracking_number = CASE WHEN $1 = 'shipped' THEN $8 ELSE tracking_number END,
         tracking_url = CASE WHEN $1 = 'shipped' THEN $9 ELSE tracking_url END,
         shipped_at = CASE WHEN $1 = 'shipped' THEN COALESCE(shipped_at, NOW()) ELSE shipped_at END,
         delivery_confirmed_at = CASE WHEN $1 = 'completed' THEN COALESCE(delivery_confirmed_at, NOW()) ELSE delivery_confirmed_at END,
         inventory_committed_at = CASE WHEN $1 = 'accepted' THEN COALESCE(inventory_committed_at, NOW()) ELSE inventory_committed_at END,
         updated_at = NOW()
     FROM stores s, actor_context
     WHERE o.id = $3 AND o.store_id = s.id AND s.slug = $4 AND s.status = 'active'
       AND (
         ($1 = 'cancelled' AND o.buyer_user_id = $5 AND o.status IN ('pending_merchant_review', 'accepted')) OR
         ($1 IN ('accepted', 'rejected') AND o.status = 'pending_merchant_review' AND ${merchantPermission(5, 6)}) OR
         ($1 = 'shipped' AND o.status = 'accepted' AND ${merchantPermission(5, 6)}) OR
         ($1 = 'completed' AND o.buyer_user_id = $5 AND o.status = 'shipped'
         AND NOT EXISTS (
           SELECT 1 FROM member_store_order_disputes d
           WHERE d.order_id = o.id AND d.status IN ('open', 'merchant_responded')
         ))
       )
     RETURNING o.id, o.order_number AS "orderNumber", o.buyer_user_id AS "buyerUserId",
               o.status, o.carrier_name AS "carrierName", o.tracking_number AS "trackingNumber",
               o.tracking_url AS "trackingUrl", o.shipped_at AS "shippedAt",
               o.delivery_confirmed_at AS "deliveryConfirmedAt", o.updated_at AS "updatedAt",
               o.items, o.store_id AS "storeId"`,
    [body.status, note, orderId, slug, session.user.id, ["store.order.manage", "account.order.manage"],
      carrierName || null, trackingNumber || null, trackingUrl || null, session.user.id],
    );
  if (result.rowCount !== 1) {
    await client.query("ROLLBACK");
    respond(response, 404, { success: false, error: "Order not found, access denied, or transition not allowed" });
    return;
  }
  if (body.status === "cancelled" && acceptedCancellation) {
    if (!Array.isArray(acceptedCancellation.items) || acceptedCancellation.items.length === 0) {
      await client.query("ROLLBACK");
      respond(response, 409, { success: false, error: "Order items are unavailable for inventory restoration" });
      return;
    }
    const inventoryLines = [...acceptedCancellation.items].sort((left, right) =>
      String(left?.productId ?? "").localeCompare(String(right?.productId ?? "")),
    );
    for (const item of inventoryLines) {
      if (!isObject(item) || typeof item.productId !== "string" || !uuidPattern.test(item.productId) ||
          !Number.isSafeInteger(item.quantity) || (item.quantity as number) < 1) {
        await client.query("ROLLBACK");
        respond(response, 409, { success: false, error: "Order contains invalid inventory details" });
        return;
      }
      const restored = await client.query(
        `UPDATE store_products
         SET stock_quantity = stock_quantity + $3, updated_at = NOW()
         WHERE id = $1 AND store_id = $2 AND stock_quantity <= 2147483647 - $3
         RETURNING id`,
        [item.productId, acceptedCancellation.storeId, item.quantity],
      );
      if (restored.rowCount !== 1) {
        await client.query("ROLLBACK");
        respond(response, 409, {
          success: false,
          error: "Could not restore inventory for this order. Contact platform support.",
        });
        return;
      }
      releasedInventory.push({ productId: item.productId, quantity: item.quantity as number });
    }
  }
  if (body.status === "accepted") {
    const orderItems = result.rows[0].items;
    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      await client.query("ROLLBACK");
      respond(response, 409, { success: false, error: "Order items are unavailable for stock commitment" });
      return;
    }
    const inventoryLines = [...orderItems].sort((left, right) =>
      String(left?.productId ?? "").localeCompare(String(right?.productId ?? "")),
    );
    for (const item of inventoryLines) {
      if (!isObject(item) || typeof item.productId !== "string" || !uuidPattern.test(item.productId) ||
          !Number.isSafeInteger(item.quantity) || (item.quantity as number) < 1) {
        await client.query("ROLLBACK");
        respond(response, 409, { success: false, error: "Order contains invalid inventory details" });
        return;
      }
      const committed = await client.query(
        `UPDATE store_products
         SET stock_quantity = stock_quantity - $3, updated_at = NOW()
         WHERE id = $1 AND store_id = $2 AND stock_quantity >= $3
         RETURNING id`,
        [item.productId, result.rows[0].storeId, item.quantity],
      );
      if (committed.rowCount !== 1) {
        await client.query("ROLLBACK");
        respond(response, 409, {
          success: false,
          error: "Insufficient stock to accept this order. Update inventory or contact the buyer.",
        });
        return;
      }
    }
  }
  await client.query(
    `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, metadata)
     VALUES ($1, 'member_store.order_status_changed', 'member_store_order', $2, $3::jsonb)`,
    [session.user.id, orderId, JSON.stringify({
      status: body.status,
      note: note || null,
      ...(releasedInventory.length ? { inventoryReleased: releasedInventory } : {}),
    })],
  );
  if (body.status === "accepted" || body.status === "rejected" || body.status === "shipped") {
    await client.query(
      `INSERT INTO notifications
         (user_id, type, title_ar, title_en, body_ar, body_en, action_url, resource_id, metadata)
       VALUES ($1, 'member_store_order',
         CASE WHEN $2 = 'accepted' THEN 'تم قبول طلبك'
              WHEN $2 = 'shipped' THEN 'تم شحن طلبك' ELSE 'تم رفض طلبك' END,
         CASE WHEN $2 = 'accepted' THEN 'Your order request was accepted'
              WHEN $2 = 'shipped' THEN 'Your order has shipped' ELSE 'Your order request was declined' END,
         CASE WHEN $2 = 'accepted' THEN 'وافق التاجر على طلبك.'
              WHEN $2 = 'shipped' THEN 'تم إرسال طلبك مع معلومات التتبع.' ELSE 'لم يتمكن التاجر من قبول طلبك.' END,
         CASE WHEN $2 = 'accepted' THEN 'The merchant accepted your request.'
              WHEN $2 = 'shipped' THEN 'The merchant shipped your order and added tracking details.' ELSE 'The merchant could not accept your request.' END,
         '/store/' || $3 || '/orders', $4, jsonb_build_object('orderNumber', $5, 'status', $2))`,
      [result.rows[0].buyerUserId, body.status, slug, orderId, result.rows[0].orderNumber],
    );
  } else if (body.status === "cancelled") {
    await client.query(
      `INSERT INTO notifications
         (user_id, type, title_ar, title_en, body_ar, body_en, action_url, resource_id, metadata)
       SELECT DISTINCT recipients.user_id, 'member_store_order',
              'ألغى العميل طلبه', 'A buyer cancelled an order request',
              'تم إلغاء الطلب رقم ' || $5, 'Order request ' || $5 || ' was cancelled',
              '/store/' || $1 || '/orders', $2,
              jsonb_build_object('orderNumber', $5, 'status', 'cancelled')
       FROM (
         SELECT am.user_id
         FROM account_members am
         JOIN stores s ON s.account_id = am.account_id
         JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
         JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
         JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
         WHERE s.slug = $1 AND s.status = 'active' AND am.status = 'active'
           AND p.permission_key = ANY($3::text[])
         UNION
         SELECT sm.user_id
         FROM store_members sm
         JOIN stores s ON s.id = sm.store_id
         JOIN roles r ON r.id = sm.role_id AND r.scope_type = sm.role_scope
         JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
         JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
         WHERE s.slug = $1 AND s.status = 'active' AND sm.status = 'active'
           AND p.permission_key = ANY($3::text[])
       ) recipients
       WHERE recipients.user_id <> $4`,
      [slug, orderId, ["store.order.read", "store.order.manage", "account.order.read", "account.order.manage"],
        session.user.id, result.rows[0].orderNumber],
    );
  } else if (body.status === "completed") {
    await client.query(
      `INSERT INTO notifications
         (user_id, type, title_ar, title_en, body_ar, body_en, action_url, resource_id, metadata)
       SELECT DISTINCT recipients.user_id, 'member_store_order',
              'أكد العميل استلام الطلب', 'Buyer confirmed delivery',
              'أكد العميل استلام الطلب رقم ' || $5, 'The buyer confirmed delivery for order ' || $5,
              '/store/' || $1 || '/orders', $2,
              jsonb_build_object('orderNumber', $5, 'status', 'completed')
       FROM (
         SELECT am.user_id
         FROM account_members am
         JOIN stores s ON s.account_id = am.account_id
         JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
         JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
         JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
         WHERE s.slug = $1 AND s.status = 'active' AND am.status = 'active'
           AND p.permission_key = ANY($3::text[])
         UNION
         SELECT sm.user_id
         FROM store_members sm
         JOIN stores s ON s.id = sm.store_id
         JOIN roles r ON r.id = sm.role_id AND r.scope_type = sm.role_scope
         JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
         JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
         WHERE s.slug = $1 AND s.status = 'active' AND sm.status = 'active'
           AND p.permission_key = ANY($3::text[])
       ) recipients
       WHERE recipients.user_id <> $4`,
      [slug, orderId, ["store.order.read", "store.order.manage", "account.order.read", "account.order.manage"],
        session.user.id, result.rows[0].orderNumber],
    );
  }
  await client.query("COMMIT");
  respond(response, 200, { success: true, order: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
