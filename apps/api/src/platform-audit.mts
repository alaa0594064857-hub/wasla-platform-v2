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
      `WITH events AS (
        SELECT al.id::text AS id, al.created_at AS "createdAt",
               'platform'::text AS source, al.action AS event,
               al.resource_type AS "resourceType", al.resource_id::text AS "resourceId",
               u.email AS "actorEmail",
               COALESCE(a.display_name, s.name) AS context,
               al.metadata AS details
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        LEFT JOIN accounts a ON a.id = al.account_id
        LEFT JOIN stores s ON s.id = al.store_id

        UNION ALL
        SELECT oe.id::text, oe.created_at, 'trade_opportunity',
               oe.event_type, 'trade_opportunity', oe.opportunity_id::text,
               u.email, a.display_name,
               jsonb_build_object('note', oe.note)
        FROM trade_opportunity_events oe
        JOIN trade_opportunities o ON o.id = oe.opportunity_id
        LEFT JOIN accounts a ON a.id = o.account_id
        LEFT JOIN users u ON u.id = oe.actor_user_id

        UNION ALL
        SELECT ge.id::text, ge.created_at, 'trade_brokerage_agreement',
               ge.event_type, 'brokerage_agreement', ge.agreement_id::text,
               u.email,
               concat_ws(' / ', ba.display_name, sa.display_name),
               jsonb_build_object('note', ge.note, 'actorAccountId', ge.actor_account_id)
        FROM trade_brokerage_agreement_events ge
        JOIN trade_brokerage_agreements g ON g.id = ge.agreement_id
        LEFT JOIN accounts ba ON ba.id = g.buyer_account_id
        LEFT JOIN accounts sa ON sa.id = g.supplier_account_id
        LEFT JOIN users u ON u.id = ge.actor_user_id

        UNION ALL
        SELECT ce.id::text, ce.created_at, 'trade_commission',
               ce.event_type, 'commission_entry', ce.entry_id::text,
               u.email, concat_ws(' / ', ba.display_name, sa.display_name),
               jsonb_build_object('fromStatus', ce.from_status, 'toStatus', ce.to_status, 'note', ce.note)
        FROM trade_brokerage_commission_events ce
        JOIN trade_brokerage_commission_entries e ON e.id = ce.entry_id
        JOIN trade_brokerage_agreements g ON g.id = e.agreement_id
        LEFT JOIN accounts ba ON ba.id = g.buyer_account_id
        LEFT JOIN accounts sa ON sa.id = g.supplier_account_id
        LEFT JOIN users u ON u.id = ce.actor_user_id

        UNION ALL
        SELECT ie.id::text, ie.created_at, 'trade_commission_invoice',
               CASE WHEN ie.from_status IS NULL THEN 'invoice_created' ELSE 'invoice_status_changed' END,
               'commission_invoice', ie.invoice_id::text,
               u.email, concat_ws(' / ', ba.display_name, sa.display_name),
               jsonb_build_object('fromStatus', ie.from_status, 'toStatus', ie.to_status,
                                  'invoiceNumber', i.invoice_number, 'note', ie.note)
        FROM trade_brokerage_commission_invoice_events ie
        JOIN trade_brokerage_commission_invoices i ON i.id = ie.invoice_id
        JOIN trade_brokerage_commission_entries e ON e.id = i.commission_entry_id
        JOIN trade_brokerage_agreements g ON g.id = e.agreement_id
        LEFT JOIN accounts ba ON ba.id = g.buyer_account_id
        LEFT JOIN accounts sa ON sa.id = g.supplier_account_id
        LEFT JOIN users u ON u.id = ie.actor_user_id
      )
      SELECT id, "createdAt", source, event, "resourceType", "resourceId",
             "actorEmail", context, details
      FROM events
      ORDER BY "createdAt" DESC
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
