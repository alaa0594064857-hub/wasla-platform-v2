import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

type ProductStatus = "draft" | "active" | "archived";
const statuses = new Set<ProductStatus>(["draft", "active", "archived"]);

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
    if (size > 20_000) throw new Error("Request body too large");
    body += chunk.toString();
  }
  return JSON.parse(body);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validOptionalUrl(value: unknown): value is string | null | undefined {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
function hasStoreProductPermissionSql(permissionKeys: readonly string[]) {
  const allowed = permissionKeys.map((key) => `'${key}'`).join(", ");
  return `(
    EXISTS (
      SELECT 1 FROM account_members am
      INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
      INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
      INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
      WHERE am.account_id = s.account_id AND am.user_id = $2
        AND am.status = 'active' AND p.permission_key IN (${allowed})
    )
    OR EXISTS (
      SELECT 1 FROM store_members sm
      INNER JOIN roles sr ON sr.id = sm.role_id AND sr.scope_type = sm.role_scope
      INNER JOIN role_permissions rp ON rp.role_id = sr.id AND rp.scope_type = sr.scope_type
      INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
      WHERE sm.store_id = s.id AND sm.user_id = $2
        AND sm.status = 'active' AND p.permission_key IN (${allowed})
    )
  )`;
}

export async function handleStoreProductsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  slug: string,
): Promise<void> {
  if (!["GET", "POST"].includes(request.method ?? "")) {
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
    const requiredPermissions = request.method === "GET"
      ? ["account.product.read", "store.product.read"]
      : ["account.product.create", "store.product.create"];
    const permission = await pool.query(
      `SELECT s.id, s.account_id FROM stores s
       WHERE s.slug = $1 AND s.status = 'active'
         AND ${hasStoreProductPermissionSql(requiredPermissions)}
       LIMIT 1`,
      [slug, session.user.id],
    );
    if (permission.rowCount !== 1) {
      respond(response, 404, { success: false, error: "Store not found or access denied" });
      return;
    }
    const store = permission.rows[0];

    if (request.method === "GET") {
      const result = await pool.query(
        `SELECT id, store_id AS "storeId", title, description, sku,
                price::text AS price, currency, stock_quantity AS "stockQuantity",
                image_url AS "imageUrl", video_url AS "videoUrl", seller_checkout_url AS "sellerCheckoutUrl", status,
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM store_products WHERE store_id = $1
         ORDER BY created_at DESC`,
        [store.id],
      );
      respond(response, 200, { success: true, products: result.rows });
      return;
    }

    let body: unknown;
    try { body = await readBody(request); }
    catch {
      respond(response, 400, { success: false, error: "Invalid request body" });
      return;
    }
    if (!isObject(body)) {
      respond(response, 400, { success: false, error: "Invalid product data" });
      return;
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const sku = typeof body.sku === "string" ? body.sku.trim() : "";
    const price = typeof body.price === "string" || typeof body.price === "number" ? String(body.price) : "";
    const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "USD";
    const stock = body.stockQuantity;
    const status = body.status === undefined ? "draft" : body.status;
    if (title.length < 2 || title.length > 180 || description.length > 5000 ||
        sku.length > 80 || !/^\d{1,10}(\.\d{1,2})?$/.test(price) ||
        !/^[A-Z]{3}$/.test(currency) || !Number.isSafeInteger(stock) ||
        (stock as number) < 0 || !statuses.has(status as ProductStatus) ||
        !validOptionalUrl(body.imageUrl) || !validOptionalUrl(body.videoUrl) || !validOptionalUrl(body.sellerCheckoutUrl)) {
      respond(response, 400, { success: false, error: "Check product name, price, currency, stock, status, and secure media URLs" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO store_products
          (store_id, title, description, sku, price, currency, stock_quantity, image_url, video_url, seller_checkout_url, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, store_id AS "storeId", title, description, sku,
           price::text AS price, currency, stock_quantity AS "stockQuantity",
           image_url AS "imageUrl", video_url AS "videoUrl", seller_checkout_url AS "sellerCheckoutUrl", status,
           created_at AS "createdAt", updated_at AS "updatedAt"`,
        [store.id, title, description || null, sku || null, price, currency,
         stock, body.imageUrl || null, body.videoUrl || null, body.sellerCheckoutUrl || null, status],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, store_id, metadata)
         VALUES ($1, 'product.created', 'product', $2, $3, $4, $5)`,
        [session.user.id, result.rows[0].id, store.account_id, store.id,
         JSON.stringify({ title, status })],
      );
      await client.query("COMMIT");
      respond(response, 201, { success: true, product: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA store products API error:", error);
    respond(response, 500, { success: false, error: "Could not process product request" });
  }
}

export async function handleStoreProductDetailRequest(
  request: IncomingMessage,
  response: ServerResponse,
  slug: string,
  productId: string,
): Promise<void> {
  if (request.method !== "PATCH") {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      respond(response, 401, { success: false, error: "Authentication required" });
      return;
    }
    let body: unknown;
    try { body = await readBody(request); }
    catch {
      respond(response, 400, { success: false, error: "Invalid request body" });
      return;
    }
    if (!isObject(body)) {
      respond(response, 400, { success: false, error: "Invalid product data" });
      return;
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      fields.push(`${column} = ${values.length + 3}`);
    };
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length < 2 || body.title.trim().length > 180) {
        respond(response, 400, { success: false, error: "Invalid product title" }); return;
      }
      add("title", body.title.trim());
    }
    if (body.description !== undefined) {
      if (typeof body.description !== "string" || body.description.length > 5000) {
        respond(response, 400, { success: false, error: "Invalid description" }); return;
      }
      add("description", body.description.trim() || null);
    }
    if (body.price !== undefined) {
      const price = String(body.price);
      if (!/^\d{1,10}(\.\d{1,2})?$/.test(price)) {
        respond(response, 400, { success: false, error: "Invalid price" }); return;
      }
      add("price", price);
    }
    if (body.currency !== undefined) {
      if (typeof body.currency !== "string" || !/^[A-Za-z]{3}$/.test(body.currency)) {
        respond(response, 400, { success: false, error: "Invalid currency" }); return;
      }
      add("currency", body.currency.toUpperCase());
    }
    if (body.stockQuantity !== undefined) {
      if (!Number.isSafeInteger(body.stockQuantity) || (body.stockQuantity as number) < 0) {
        respond(response, 400, { success: false, error: "Invalid stock quantity" }); return;
      }
      add("stock_quantity", body.stockQuantity);
    }
    for (const [key, column] of [["imageUrl", "image_url"], ["videoUrl", "video_url"], ["sellerCheckoutUrl", "seller_checkout_url"]] as const) {
      if (body[key] !== undefined) {
        if (!validOptionalUrl(body[key])) {
          respond(response, 400, { success: false, error: "Media must use a secure HTTPS URL" }); return;
        }
        add(column, body[key] || null);
      }
    }
    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !statuses.has(body.status as ProductStatus)) {
        respond(response, 400, { success: false, error: "Invalid product status" }); return;
      }
      add("status", body.status);
    }
    if (fields.length === 0) {
      respond(response, 400, { success: false, error: "No product changes supplied" }); return;
    }
    const pool = getDatabasePool();
    const queryValues = [slug, session.user.id, productId, ...values];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE store_products p SET ${fields.join(", ")}, updated_at = NOW()
         FROM stores s
         WHERE p.id = $3 AND p.store_id = s.id AND s.slug = $1
           AND s.status = 'active' AND ${hasStoreProductPermissionSql(["account.product.update", "store.product.update"])}
         RETURNING p.id, p.store_id AS "storeId", p.title, p.description, p.sku,
           p.price::text AS price, p.currency, p.stock_quantity AS "stockQuantity",
           p.image_url AS "imageUrl", p.video_url AS "videoUrl", p.seller_checkout_url AS "sellerCheckoutUrl", p.status,
           p.created_at AS "createdAt", p.updated_at AS "updatedAt"`,
        queryValues,
      );
      if (result.rowCount !== 1) {
        await client.query("ROLLBACK");
        respond(response, 404, { success: false, error: "Product not found or access denied" });
        return;
      }
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, store_id, metadata)
         SELECT $1, 'product.updated', 'product', $2, s.account_id, s.id, $3::jsonb
         FROM stores s WHERE s.id = $4`,
        [session.user.id, result.rows[0].id, JSON.stringify({ changed_fields: Object.keys(body), status: result.rows[0].status }), result.rows[0].storeId],
      );
      await client.query("COMMIT");
      respond(response, 200, { success: true, product: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA store product update API error:", error);
    respond(response, 500, { success: false, error: "Could not update product" });
  }
}
