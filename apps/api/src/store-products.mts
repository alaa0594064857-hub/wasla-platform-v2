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
  return value === undefined || value === null ||
    (typeof value === "string" && value.length <= 2048 &&
      /^https:\/\/(?!\s)/i.test(value));
}
function canManageSql() {
  return `(
    EXISTS (
      SELECT 1 FROM account_members am
      INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
      WHERE am.account_id = s.account_id AND am.user_id = $2
        AND am.status = 'active'
        AND r.name IN ('account_owner', 'account_manager')
    )
    OR EXISTS (
      SELECT 1 FROM store_members sm
      INNER JOIN roles sr ON sr.id = sm.role_id AND sr.scope_type = sm.role_scope
      WHERE sm.store_id = s.id AND sm.user_id = $2
        AND sm.status = 'active' AND sr.name IN ('store_owner', 'store_manager')
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
    const permission = await pool.query(
      `SELECT s.id, s.account_id FROM stores s
       WHERE s.slug = $1 AND s.status = 'active'
         AND ${canManageSql()}
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
                image_url AS "imageUrl", video_url AS "videoUrl", status,
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
        !validOptionalUrl(body.imageUrl) || !validOptionalUrl(body.videoUrl)) {
      respond(response, 400, { success: false, error: "Check product name, price, currency, stock, status, and secure media URLs" });
      return;
    }
    const client = await pool.connect();
    let product: Record<string, unknown>;
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO store_products
          (store_id, title, description, sku, price, currency, stock_quantity, image_url, video_url, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, store_id AS "storeId", title, description, sku,
           price::text AS price, currency, stock_quantity AS "stockQuantity",
           image_url AS "imageUrl", video_url AS "videoUrl", status,
           created_at AS "createdAt", updated_at AS "updatedAt"`,
        [store.id, title, description || null, sku || null, price, currency,
         stock, body.imageUrl || null, body.videoUrl || null, status],
      );
      product = result.rows[0];
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, store_id, metadata)
         VALUES ($1, 'product.created', 'product', $2, $3, $4, $5)`,
        [session.user.id, product.id, store.account_id, store.id,
         JSON.stringify({ title, status })],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    respond(response, 201, { success: true, product });
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
    if (Object.prototype.hasOwnProperty.call(body, "stockQuantity")) {
      respond(response, 400, { success: false, error: "Use inventory movements to change stock quantity" });
      return;
    }
    for (const [key, column] of [["imageUrl", "image_url"], ["videoUrl", "video_url"]] as const) {
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
    const client = await pool.connect();
    const queryValues = [slug, session.user.id, productId, ...values];
    let product: Record<string, unknown>;
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE store_products p SET ${fields.join(", ")}, updated_at = NOW()
         FROM stores s
         WHERE p.id = $3 AND p.store_id = s.id AND s.slug = $1
           AND s.status = 'active' AND ${canManageSql()}
         RETURNING p.id, p.store_id AS "storeId", p.title, p.description, p.sku,
           p.price::text AS price, p.currency, p.stock_quantity AS "stockQuantity",
           p.image_url AS "imageUrl", p.video_url AS "videoUrl", p.status,
           p.created_at AS "createdAt", p.updated_at AS "updatedAt",
           s.account_id AS "accountId"`,
        queryValues,
      );
      if (result.rowCount !== 1) {
        await client.query("ROLLBACK");
        respond(response, 404, { success: false, error: "Product not found or access denied" });
        return;
      }
      product = result.rows[0];
      const changedFields = Object.keys(body).filter((key) =>
        ["title", "description", "sku", "price", "currency", "imageUrl", "videoUrl", "status"].includes(key),
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, store_id, metadata)
         VALUES ($1, 'product.updated', 'product', $2, $3, $4, $5)`,
        [session.user.id, product.id, product.accountId, product.storeId,
         JSON.stringify({ changedFields })],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const { accountId: _accountId, ...publicProduct } = product;
    respond(response, 200, { success: true, product: publicProduct });
  } catch (error) {
    console.error("WASLA store product update API error:", error);
    respond(response, 500, { success: false, error: "Could not update product" });
  }
}
