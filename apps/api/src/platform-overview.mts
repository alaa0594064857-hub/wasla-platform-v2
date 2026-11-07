import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

function reply(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });
  response.end(JSON.stringify(data));
}

/** Live executive overview built only from records that currently exist in production. */
export async function handlePlatformOverviewRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET") {
    reply(response, 405, { success: false, error: "Method not allowed" });
    return;
  }

  try {
    const access = await authorizePlatformPermission(request, response, "platform.reports.read");
    if (!access) return;

    const db = getDatabasePool();
    const [accounts, stores, verification, users, officialOrders, officialProducts, sourceOffers] = await Promise.all([
      db.query<{ account_type: string; status: string; total: number }>(
        `SELECT account_type::text AS account_type, status::text AS status, COUNT(*)::int AS total
         FROM accounts GROUP BY account_type, status ORDER BY account_type, status`,
      ),
      db.query<{ status: string; total: number }>(
        `SELECT status::text AS status, COUNT(*)::int AS total
         FROM stores GROUP BY status ORDER BY status`,
      ),
      db.query<{ account_type: string; verification_status: string; total: number }>(
        `SELECT a.account_type::text AS account_type, bp.verification_status::text AS verification_status,
                COUNT(*)::int AS total
         FROM accounts a
         LEFT JOIN business_profiles bp ON bp.account_id = a.id
         GROUP BY a.account_type, bp.verification_status
         ORDER BY a.account_type, bp.verification_status`,
      ),
      db.query<{ status: string; total: number }>(
        `SELECT status::text AS status, COUNT(*)::int AS total
         FROM users GROUP BY status ORDER BY status`,
      ),
      db.query<{ total: number; needs_review: number }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE owner_review_required = TRUE OR order_status = 'exception')::int AS needs_review
         FROM official_store_orders`,
      ),
      db.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM official_store_products`,
      ),
      db.query<{ total: number; needs_review: number }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE offer_status = 'needs_review')::int AS needs_review
         FROM official_store_product_source_offers`,
      ),
    ]);

    const sum = (rows: Array<{ total: number }>) => rows.reduce((value, row) => value + Number(row.total || 0), 0);
    reply(response, 200, {
      success: true,
      generatedAt: new Date().toISOString(),
      totals: {
        accounts: sum(accounts.rows),
        stores: sum(stores.rows),
        users: sum(users.rows),
        officialStoreOrders: Number(officialOrders.rows[0]?.total ?? 0),
        officialStoreOrdersNeedingReview: Number(officialOrders.rows[0]?.needs_review ?? 0),
        officialStoreProducts: Number(officialProducts.rows[0]?.total ?? 0),
        supplierOffers: Number(sourceOffers.rows[0]?.total ?? 0),
        supplierOffersNeedingReview: Number(sourceOffers.rows[0]?.needs_review ?? 0),
      },
      accountsByType: accounts.rows,
      storesByStatus: stores.rows,
      businessVerification: verification.rows,
      usersByStatus: users.rows,
      availableModules: {
        stores: true,
        businessAccounts: true,
        orders: true,
        sales: false,
        ratings: false,
        inquiries: false,
        complaints: false,
        aiOperations: false,
        officialPlatformStore: true,
      },
      notes: {
        stores: "Counts represent member-owned stores in the stores table, not the future official WASLA Store.",
        unavailable: "Member-store orders, sales, ratings, complaints, and autonomous AI operations are not enabled. Official-store order and supplier-offer counts reflect their separate owner-only tables.",
      },
    });
  } catch (error) {
    console.error("WASLA platform overview error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Platform overview service error" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
