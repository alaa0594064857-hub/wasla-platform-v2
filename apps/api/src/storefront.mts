import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";

function respond(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

/** Public storefront data is limited to active stores, active businesses and published products. */
export async function handlePublicStorefrontRequest(
  request: IncomingMessage,
  response: ServerResponse,
  slug: string,
): Promise<void> {
  if (request.method !== "GET") {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  if (!slug || slug.length > 180) {
    respond(response, 400, { success: false, error: "Invalid store address" });
    return;
  }
  try {
    const db = getDatabasePool();
    const storeResult = await db.query(
      `SELECT s.id, s.name, s.slug, a.display_name AS "businessName",
              a.country_code AS "countryCode", bp.description AS "businessDescription",
              bp.website
       FROM stores s
       INNER JOIN accounts a ON a.id = s.account_id
       LEFT JOIN business_profiles bp ON bp.account_id = a.id
       WHERE s.slug = $1 AND s.status = 'active' AND a.status = 'active'
       LIMIT 1`,
      [slug],
    );
    if (storeResult.rowCount !== 1) {
      respond(response, 404, { success: false, error: "Store not found" });
      return;
    }
    const store = storeResult.rows[0];
    const products = await db.query(
      `SELECT id, title, description, sku, price::text AS price, currency,
              stock_quantity AS "stockQuantity", image_url AS "imageUrl",
              video_url AS "videoUrl"
       FROM store_products
       WHERE store_id = $1 AND status = 'active'
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [store.id],
    );
    respond(response, 200, { success: true, store, products: products.rows });
  } catch (error) {
    console.error("WASLA public storefront error:", error);
    respond(response, 500, { success: false, error: "Storefront is temporarily unavailable" });
  }
}
