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
    const [accounts, stores, verification, users] = await Promise.all([
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
    ]);

    const sum = (rows: Array<{ total: number }>) => rows.reduce((value, row) => value + Number(row.total || 0), 0);
    reply(response, 200, {
      success: true,
      generatedAt: new Date().toISOString(),
      totals: {
        accounts: sum(accounts.rows),
        stores: sum(stores.rows),
        users: sum(users.rows),
      },
      accountsByType: accounts.rows,
      storesByStatus: stores.rows,
      businessVerification: verification.rows,
      usersByStatus: users.rows,
      availableModules: {
        stores: true,
        businessAccounts: true,
        orders: false,
        sales: false,
        ratings: false,
        inquiries: false,
        complaints: false,
        aiOperations: false,
        officialPlatformStore: false,
      },
      notes: {
        stores: "Counts represent member-owned stores in the stores table, not the future official WASLA Store.",
        unavailable: "Orders, sales, ratings, inquiries, complaints, AI activity, and the official WASLA Store do not yet have production data modules.",
      },
    });
  } catch (error) {
    console.error("WASLA platform overview error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Platform overview service error" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
