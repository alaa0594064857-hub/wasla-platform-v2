import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";

type SearchRow = Record<string, unknown>;

function respond(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

/** Public discovery only returns active, publicly discoverable records and never exposes private contact data. */
export async function handleSearchRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "GET") {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }

  const url = new URL(request.url ?? "/api/search", "http://localhost");
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (query.length < 2) {
    respond(response, 200, {
      success: true,
      query,
      results: { products: [], stores: [], businesses: [], people: [] },
      counts: { products: 0, stores: 0, businesses: 0, people: 0 },
    });
    return;
  }

  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  try {
    const db = getDatabasePool();
    const [products, stores, businesses, people] = await Promise.all([
      db.query<SearchRow>(
        `SELECT p.id, p.title, p.description, p.price::text AS price, p.currency,
                p.image_url, s.name AS store_name, s.slug AS store_slug,
                a.display_name AS business_name
         FROM store_products p
         INNER JOIN stores s ON s.id = p.store_id
         INNER JOIN accounts a ON a.id = s.account_id
         WHERE p.status = 'active' AND s.status = 'active' AND a.status = 'active'
           AND (p.title ILIKE $1 ESCAPE E'\\\\' OR COALESCE(p.description, '') ILIKE $1 ESCAPE E'\\\\'
             OR s.name ILIKE $1 ESCAPE E'\\\\' OR a.display_name ILIKE $1 ESCAPE E'\\\\')
         ORDER BY p.created_at DESC LIMIT 8`,
        [pattern],
      ),
      db.query<SearchRow>(
        `SELECT s.id, s.name, s.slug, a.display_name AS business_name, a.country_code
         FROM stores s
         INNER JOIN accounts a ON a.id = s.account_id
         WHERE s.status = 'active' AND a.status = 'active'
           AND (s.name ILIKE $1 ESCAPE E'\\\\' OR a.display_name ILIKE $1 ESCAPE E'\\\\')
         ORDER BY s.created_at DESC LIMIT 8`,
        [pattern],
      ),
      db.query<SearchRow>(
        `SELECT a.id, a.display_name, a.account_type, a.country_code,
                bp.description, bp.website
         FROM accounts a
         LEFT JOIN business_profiles bp ON bp.account_id = a.id
         WHERE a.status = 'active'
           AND (a.display_name ILIKE $1 ESCAPE E'\\\\'
             OR COALESCE(bp.description, '') ILIKE $1 ESCAPE E'\\\\')
         ORDER BY a.created_at DESC LIMIT 8`,
        [pattern],
      ),
      db.query<SearchRow>(
        `SELECT u.id, COALESCE(p.display_name, u.name) AS display_name,
                COALESCE(p.avatar_reference, u.image) AS avatar_reference,
                p.bio
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         WHERE u.status = 'active'
           AND (COALESCE(p.display_name, u.name) ILIKE $1 ESCAPE E'\\\\'
             OR COALESCE(p.bio, '') ILIKE $1 ESCAPE E'\\\\')
         ORDER BY u.created_at DESC LIMIT 8`,
        [pattern],
      ),
    ]);

    const results = {
      products: products.rows,
      stores: stores.rows,
      businesses: businesses.rows,
      people: people.rows,
    };
    respond(response, 200, {
      success: true,
      query,
      results,
      counts: {
        products: products.rowCount ?? 0,
        stores: stores.rowCount ?? 0,
        businesses: businesses.rowCount ?? 0,
        people: people.rowCount ?? 0,
      },
    });
  } catch (error) {
    console.error("WASLA search API error:", error);
    respond(response, 500, { success: false, error: "Search is temporarily unavailable" });
  }
}
