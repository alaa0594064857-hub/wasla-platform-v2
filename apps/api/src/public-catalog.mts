import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";

function respond(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

/** Public, read-only catalog endpoints. Only active stores and published products are exposed. */
export async function handlePublicCatalogRequest(
  request: IncomingMessage,
  response: ServerResponse,
  storeSlug?: string,
  productId?: string,
): Promise<void> {
  if (request.method !== "GET") {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  try {
    const db = getDatabasePool();
    if (productId) {
      if (!/^[0-9a-f-]{36}$/i.test(productId)) {
        respond(response, 404, { success: false, error: "Product not found" });
        return;
      }
      const result = await db.query(
        `SELECT p.id, p.title, p.description, p.price::text AS price,
                p.currency, p.image_url AS "imageUrl", p.video_url AS "videoUrl",
                p.seller_checkout_url AS "sellerCheckoutUrl",
                s.id AS "storeId", s.name AS "storeName", s.slug AS "storeSlug"
         FROM store_products p
         INNER JOIN stores s ON s.id = p.store_id AND s.status = 'active'
         INNER JOIN accounts a ON a.id = s.account_id AND a.status = 'active'
         WHERE p.id = $1 AND p.status = 'active'
         LIMIT 1`,
        [productId],
      );
      if (!result.rowCount) {
        respond(response, 404, { success: false, error: "Product not found" });
        return;
      }
      respond(response, 200, { success: true, product: result.rows[0] });
      return;
    }

    if (!storeSlug || storeSlug.length > 120) {
      respond(response, 404, { success: false, error: "Store not found" });
      return;
    }
    const store = await db.query(
      `SELECT s.id, s.name, s.slug, a.display_name AS "businessName",
              bp.description AS "businessDescription", bp.website
       FROM stores s
       INNER JOIN accounts a ON a.id = s.account_id AND a.status = 'active'
       LEFT JOIN business_profiles bp ON bp.account_id = a.id
       WHERE s.slug = $1 AND s.status = 'active'
       LIMIT 1`,
      [storeSlug],
    );
    if (!store.rowCount) {
      respond(response, 404, { success: false, error: "Store not found" });
      return;
    }
    const products = await db.query(
      `SELECT id, title, description, price::text AS price, currency,
              image_url AS "imageUrl", created_at AS "createdAt"
       FROM store_products
       WHERE store_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 100`,
      [store.rows[0].id],
    );
    respond(response, 200, { success: true, store: store.rows[0], products: products.rows });
  } catch (error) {
    console.error("WASLA public catalog API error:", error);
    respond(response, 500, { success: false, error: "Could not load public catalog" });
  }
}
