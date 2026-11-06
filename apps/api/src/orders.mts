import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

type AddressSnapshot = {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  region?: string;
  postalCode?: string;
  countryCode: string;
};

type CheckoutLine = { productId: string; quantity: number };

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
    if (size > 32_000) throw new Error("Request body too large");
    body += chunk.toString();
  }
  return JSON.parse(body);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanAddress(value: unknown): AddressSnapshot | null {
  if (!isObject(value)) return null;
  const required = ["fullName", "phone", "addressLine1", "city", "countryCode"] as const;
  for (const key of required) {
    if (typeof value[key] !== "string" || !(value[key] as string).trim()) return null;
  }
  const optional = ["addressLine2", "region", "postalCode"] as const;
  for (const key of optional) {
    if (value[key] !== undefined && typeof value[key] !== "string") return null;
  }
  const result: AddressSnapshot = {
    fullName: (value.fullName as string).trim(),
    phone: (value.phone as string).trim(),
    addressLine1: (value.addressLine1 as string).trim(),
    city: (value.city as string).trim(),
    countryCode: (value.countryCode as string).trim().toUpperCase(),
  };
  for (const key of optional) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim()) result[key] = entry.trim();
  }
  if (result.fullName.length > 120 || result.phone.length > 40 ||
      result.addressLine1.length > 180 || result.city.length > 100 ||
      !/^[A-Z]{2}$/.test(result.countryCode) ||
      (result.addressLine2?.length ?? 0) > 180 ||
      (result.region?.length ?? 0) > 100 ||
      (result.postalCode?.length ?? 0) > 24) return null;
  return result;
}

function moneyToCents(value: unknown): bigint | null {
  const text = String(value);
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}

function centsToMoney(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

async function loadOrder(client: { query: (sql: string, values?: unknown[]) => Promise<any> }, orderId: string) {
  const result = await client.query(
    `SELECT id, order_number AS "orderNumber", store_id AS "storeId",
            status, currency, subtotal::text AS subtotal,
            discount_total::text AS "discountTotal",
            shipping_total::text AS "shippingTotal", tax_total::text AS "taxTotal",
            grand_total::text AS "grandTotal",
            shipping_address_snapshot AS "shippingAddress",
            buyer_note AS "buyerNote", created_at AS "createdAt",
            updated_at AS "updatedAt", cancelled_at AS "cancelledAt"
     FROM orders WHERE id = $1`,
    [orderId],
  );
  if (result.rowCount !== 1) return null;
  const items = await client.query(
    `SELECT id, product_id AS "productId",
            product_title_snapshot AS "productTitle",
            sku_snapshot AS sku,
            unit_price_snapshot::text AS "unitPrice",
            quantity, line_subtotal::text AS "lineSubtotal"
     FROM order_items WHERE order_id = $1 ORDER BY created_at, id`,
    [orderId],
  );
  return { ...result.rows[0], items: items.rows };
}

export async function handleOrdersRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      respond(response, 401, { success: false, error: "Authentication required" });
      return;
    }
    const pool = getDatabasePool();

    if (request.method === "GET") {
      const result = await pool.query(
        `SELECT id, order_number AS "orderNumber", store_id AS "storeId",
                status, currency, subtotal::text AS subtotal,
                grand_total::text AS "grandTotal", created_at AS "createdAt"
         FROM orders WHERE buyer_user_id = $1
         ORDER BY created_at DESC, id DESC LIMIT 100`,
        [session.user.id],
      );
      respond(response, 200, { success: true, orders: result.rows });
      return;
    }

    let body: unknown;
    try { body = await readBody(request); }
    catch {
      respond(response, 400, { success: false, error: "Invalid request body" });
      return;
    }
    if (!isObject(body)) {
      respond(response, 400, { success: false, error: "Invalid checkout data" });
      return;
    }
    const storeSlug = typeof body.storeSlug === "string" ? body.storeSlug.trim() : "";
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const buyerNote = body.buyerNote === undefined ? null :
      typeof body.buyerNote === "string" ? body.buyerNote.trim() : undefined;
    const address = cleanAddress(body.shippingAddress);
    const lines: CheckoutLine[] = [];
    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        if (!isObject(item) || typeof item.productId !== "string" ||
            !/^[0-9a-f-]{36}$/i.test(item.productId) ||
            !Number.isSafeInteger(item.quantity) || (item.quantity as number) < 1 ||
            (item.quantity as number) > 2_147_483_647) {
          respond(response, 400, { success: false, error: "Each item needs a valid product ID and positive quantity" });
          return;
        }
        lines.push({ productId: item.productId, quantity: item.quantity as number });
      }
    }
    const uniqueIds = new Set(lines.map((line) => line.productId));
    if (!storeSlug || storeSlug.length > 100 ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(idempotencyKey) ||
        buyerNote === undefined || (buyerNote !== null && buyerNote.length > 1000) ||
        !address || lines.length < 1 || lines.length > 50 || uniqueIds.size !== lines.length) {
      respond(response, 400, { success: false, error: "Check store, unique items, delivery address, note, and idempotency key" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${session.user.id}:${idempotencyKey}`,
      ]);
      const existing = await client.query(
        "SELECT id FROM orders WHERE buyer_user_id = $1 AND idempotency_key = $2",
        [session.user.id, idempotencyKey],
      );
      if (existing.rowCount === 1) {
        const order = await loadOrder(client, existing.rows[0].id);
        await client.query("COMMIT");
        respond(response, 200, { success: true, replayed: true, order });
        return;
      }

      const storeResult = await client.query(
        "SELECT id FROM stores WHERE slug = $1 AND status = 'active' LIMIT 1",
        [storeSlug],
      );
      if (storeResult.rowCount !== 1) {
        await client.query("ROLLBACK");
        respond(response, 404, { success: false, error: "Store not found" });
        return;
      }
      const storeId = storeResult.rows[0].id;
      const productIds = lines.map((line) => line.productId).sort();
      const productResult = await client.query(
        `SELECT id, title, sku, price::text AS price, currency,
                stock_quantity AS "stockQuantity", status
         FROM store_products
         WHERE store_id = $1 AND id = ANY($2::uuid[])
         ORDER BY id
         FOR UPDATE`,
        [storeId, productIds],
      );
      if (productResult.rowCount !== lines.length) {
        await client.query("ROLLBACK");
        respond(response, 409, { success: false, error: "One or more products are unavailable in this store" });
        return;
      }
      const products = new Map<string, any>(productResult.rows.map((product: any) => [product.id, product]));
      const currencies = new Set<string>();
      let subtotalCents = 0n;
      for (const line of lines) {
        const product = products.get(line.productId);
        if (!product || product.status !== "active") {
          await client.query("ROLLBACK");
          respond(response, 409, { success: false, error: "One or more products are not available for purchase" });
          return;
        }
        if (!Number.isSafeInteger(Number(product.stockQuantity)) || Number(product.stockQuantity) < line.quantity) {
          await client.query("ROLLBACK");
          respond(response, 409, { success: false, error: "Insufficient stock for one or more products" });
          return;
        }
        const price = moneyToCents(product.price);
        if (price === null) throw new Error("Invalid catalog price stored in database");
        currencies.add(String(product.currency));
        subtotalCents += price * BigInt(line.quantity);
      }
      if (currencies.size !== 1) {
        await client.query("ROLLBACK");
        respond(response, 409, { success: false, error: "Products in one order must use the same currency" });
        return;
      }
      const currency = [...currencies][0];
      const subtotal = centsToMoney(subtotalCents);
      const orderNumber = `WSL-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
      const orderInsert = await client.query(
        `INSERT INTO orders
          (order_number, buyer_user_id, store_id, status, currency,
           subtotal, discount_total, shipping_total, tax_total, grand_total,
           shipping_address_snapshot, buyer_note, idempotency_key)
         VALUES ($1,$2,$3,'placed',$4,$5,0,0,0,$5,$6,$7,$8)
         RETURNING id`,
        [orderNumber, session.user.id, storeId, currency, subtotal, JSON.stringify(address), buyerNote, idempotencyKey],
      );
      const orderId = orderInsert.rows[0].id;
      await client.query(
        `INSERT INTO order_status_history (order_id, previous_status, new_status, actor_user_id, reason)
         VALUES ($1, NULL, 'placed', $2, 'Order placed by buyer')`,
        [orderId, session.user.id],
      );

      for (const line of lines) {
        const product = products.get(line.productId);
        const before = Number(product.stockQuantity);
        const after = before - line.quantity;
        const unitCents = moneyToCents(product.price)!;
        const lineSubtotal = centsToMoney(unitCents * BigInt(line.quantity));
        await client.query(
          `INSERT INTO order_items
            (order_id, product_id, product_title_snapshot, sku_snapshot,
             unit_price_snapshot, quantity, line_subtotal)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [orderId, product.id, product.title, product.sku, product.price, line.quantity, lineSubtotal],
        );
        const updated = await client.query(
          `UPDATE store_products SET stock_quantity = $1, updated_at = NOW()
           WHERE id = $2 AND stock_quantity = $3 RETURNING id`,
          [after, product.id, before],
        );
        if (updated.rowCount !== 1) throw new Error("Stock changed unexpectedly during checkout");
        const movement = await client.query(
          `INSERT INTO store_inventory_movements
            (store_id, product_id, actor_user_id, movement_type, quantity_delta,
             quantity_before, quantity_after, reason, reference_code)
           VALUES ($1,$2,$3,'outbound',$4,$5,$6,'Stock reserved for customer order',$7)
           RETURNING id`,
          [storeId, product.id, session.user.id, -line.quantity, before, after, orderNumber],
        );
        await client.query(
          `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, store_id, metadata)
           VALUES ($1, 'inventory.movement.created', 'inventory_movement', $2, $3, $4)`,
          [session.user.id, movement.rows[0].id, storeId,
           JSON.stringify({ orderId, orderNumber, productId: product.id, quantityDelta: -line.quantity })],
        );
      }
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, store_id, metadata)
         VALUES ($1, 'order.placed', 'order', $2, $3, $4)`,
        [session.user.id, orderId, storeId, JSON.stringify({ orderNumber, currency, subtotal, itemCount: lines.length })],
      );
      const order = await loadOrder(client, orderId);
      await client.query("COMMIT");
      respond(response, 201, { success: true, replayed: false, order });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA orders API error:", error);
    respond(response, 500, { success: false, error: "Could not process order request" });
  }
}

export async function handleOrderDetailRequest(
  request: IncomingMessage,
  response: ServerResponse,
  orderId: string,
): Promise<void> {
  if (request.method !== "GET") {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      respond(response, 401, { success: false, error: "Authentication required" });
      return;
    }
    const pool = getDatabasePool();
    const result = await pool.query(
      "SELECT id FROM orders WHERE id = $1 AND buyer_user_id = $2",
      [orderId, session.user.id],
    );
    if (result.rowCount !== 1) {
      respond(response, 404, { success: false, error: "Order not found" });
      return;
    }
    const order = await loadOrder(pool, orderId);
    respond(response, 200, { success: true, order });
  } catch (error) {
    console.error("WASLA order detail API error:", error);
    respond(response, 500, { success: false, error: "Could not load order" });
  }
}
