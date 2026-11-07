import type { IncomingMessage, ServerResponse } from "node:http";
import { authorizePlatformPermission } from "./platform-security.mjs";
import { getDatabasePool } from "./database.js";

function respond(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  response.end(JSON.stringify(data));
}

export async function handlePlatformAuditRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "GET") {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  try {
    const access = await authorizePlatformPermission(request, response, "platform.audit.read");
    if (!access) return;

    const url = new URL(request.url ?? "/api/platform/audit", "http://localhost");
    const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
    const result = await getDatabasePool().query(
      `SELECT al.id, al.actor_user_id AS "actorUserId",
              u.email AS "actorEmail", al.action, al.resource_type AS "resourceType",
              al.resource_id AS "resourceId", al.account_id AS "accountId",
              a.display_name AS "accountName", al.store_id AS "storeId",
              s.name AS "storeName", al.metadata, al.created_at AS "createdAt"
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_user_id
       LEFT JOIN accounts a ON a.id = al.account_id
       LEFT JOIN stores s ON s.id = al.store_id
       ORDER BY al.created_at DESC
       LIMIT $1`,
      [limit],
    );
    respond(response, 200, { success: true, entries: result.rows });
  } catch (error) {
    console.error("WASLA platform audit API error:", error);
    if (!response.headersSent) respond(response, 500, { success: false, error: "Platform audit service error" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
