import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function send(res: ServerResponse, status: number, data: Record<string, unknown>) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

export async function handleSourcingMatches(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") { send(res, 405, { success: false, error: "Method not allowed" }); return; }
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    const userId = session?.user?.id;
    if (!userId) { send(res, 401, { success: false, error: "Authentication required" }); return; }
    let raw = "";
    for await (const chunk of req) {
      raw += chunk.toString();
      if (Buffer.byteLength(raw) > 8000) { send(res, 413, { success: false, error: "Request body is too large" }); return; }
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    const requestId = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).requestId : null;
    if (typeof requestId !== "string" || !UUID.test(requestId)) {
      send(res, 400, { success: false, error: "A valid sourcing request ID is required" }); return;
    }
    const db = getDatabasePool();
    const owned = await db.query("SELECT id, quantity, destination_country_code, requested_currency, status FROM sourcing_requests WHERE id = $1 AND buyer_user_id = $2", [requestId, userId]);
    if (!owned.rows.length) { send(res, 404, { success: false, error: "Sourcing request not found" }); return; }
    const request = owned.rows[0];
    if (!["submitted", "searching", "offers_available"].includes(request.status)) {
      send(res, 409, { success: false, error: "This sourcing request is not open for matching" }); return;
    }
    const found = await db.query(
      "SELECT o.id, o.supplier_account_id, a.display_name AS supplier_name, o.origin_country_code, sr.destination_country_code, sr.quantity AS requested_quantity, o.offered_quantity, o.unit_price::text AS unit_price, o.currency, sr.requested_currency, o.shipping_amount::text AS shipping_amount, o.lead_time_days, o.availability_confirmed_at, o.availability_valid_until, o.quote_valid_until FROM supplier_offers o JOIN sourcing_requests sr ON sr.id = o.request_id JOIN accounts a ON a.id = o.supplier_account_id WHERE o.request_id = $1 AND o.status = 'available' AND a.status = 'active' AND a.account_type IN ('supplier','manufacturer') AND EXISTS (SELECT 1 FROM account_members am WHERE am.account_id = a.id AND am.user_id = o.submitted_by_user_id AND am.status = 'active') AND o.availability_confirmed_at IS NOT NULL AND (o.availability_valid_until IS NULL OR o.availability_valid_until > NOW()) AND (o.quote_valid_until IS NULL OR o.quote_valid_until > NOW()) AND o.offered_quantity >= sr.quantity AND (sr.requested_currency IS NULL OR o.currency = sr.requested_currency) ORDER BY o.created_at ASC LIMIT 100",
      [requestId],
    );
    const matches = found.rows.map((offer: Record<string, any>) => {
      const local = offer.origin_country_code === offer.destination_country_code;
      const currency = Boolean(offer.requested_currency) && offer.currency === offer.requested_currency;
      const exact = Number(offer.offered_quantity) === Number(offer.requested_quantity);
      const score = (local ? 40 : 20) + (exact ? 20 : 10) + (currency ? 15 : 0) +
        (offer.lead_time_days == null ? 0 : Math.max(0, 10 - Math.min(10, Number(offer.lead_time_days))));
      return { offer, local, currency, exact, score };
    }).sort((a: any, b: any) => {
      if (a.local !== b.local) return a.local ? -1 : 1;
      if (a.currency !== b.currency) return a.currency ? -1 : 1;
      if (a.offer.currency === b.offer.currency) {
        const av = Number(a.offer.unit_price) * Number(a.offer.requested_quantity) + Number(a.offer.shipping_amount);
        const bv = Number(b.offer.unit_price) * Number(b.offer.requested_quantity) + Number(b.offer.shipping_amount);
        if (av !== bv) return av - bv;
      }
      return (a.offer.lead_time_days ?? 999999) - (b.offer.lead_time_days ?? 999999);
    }).map((item: any, index: number) => ({
      rank: index + 1, score: item.score, matchType: item.local ? "local" : "cross_border",
      reasons: [item.local ? "local_supplier" : "cross_border_supplier", item.exact ? "exact_quantity" : "quantity_covers_request", item.currency ? "requested_currency_match" : "currency_differs_or_unspecified", "supplier_confirmed_availability"],
      offer: item.offer,
    }));
    send(res, 200, { success: true, engine: "deterministic-v1", requestId, count: matches.length, matches, notice: "Ranking is decision support only; reconfirm supplier terms before acceptance." });
  } catch (error) {
    console.error("WASLA sourcing matches error:", error);
    send(res, 500, { success: false, error: "Could not calculate sourcing matches" });
  }
}
