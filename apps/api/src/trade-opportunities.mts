import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

type OpportunityType = "buyer_request" | "supplier_offer";
type ReviewStatus = "pending_review" | "approved" | "rejected" | "closed";

function reply(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk.toString();
    if (Buffer.byteLength(raw) > 30_000) throw new Error("BODY_TOO_LARGE");
  }
  const value: unknown = JSON.parse(raw || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_BODY");
  return value as Record<string, unknown>;
}

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 999999999999;

async function canCreate(client: any, accountId: string, userId: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM account_members am
     INNER JOIN accounts a ON a.id = am.account_id AND a.status = 'active'
     INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
     INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
     INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
     WHERE am.account_id = $1 AND am.user_id = $2 AND am.status = 'active'
       AND p.permission_key = 'account.trade.create' LIMIT 1`,
    [accountId, userId],
  );
  return Boolean(result.rowCount);
}

/** Private B2B intake for buyer demand and supplier capabilities. Owner approval is required before matching. */
export async function ensureTradeOpportunityTables(): Promise<void> {
  const db = getDatabasePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS trade_opportunities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      opportunity_type varchar(24) NOT NULL CHECK (opportunity_type IN ('buyer_request','supplier_offer')),
      title varchar(180) NOT NULL,
      description text NOT NULL,
      product_category varchar(120),
      quantity numeric(16,3) CHECK (quantity IS NULL OR quantity > 0),
      quantity_unit varchar(40),
      target_country varchar(2),
      destination_country varchar(2),
      currency char(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
      target_unit_price numeric(14,2) CHECK (target_unit_price IS NULL OR target_unit_price >= 0),
      minimum_order_quantity numeric(16,3) CHECK (minimum_order_quantity IS NULL OR minimum_order_quantity > 0),
      delivery_terms varchar(40),
      evidence_url text,
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      review_status varchar(24) NOT NULL DEFAULT 'pending_review'
        CHECK (review_status IN ('pending_review','approved','rejected','closed')),
      reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at timestamptz,
      expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS trade_opportunities_account_created_idx ON trade_opportunities (account_id, created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS trade_opportunities_review_created_idx ON trade_opportunities (review_status, created_at DESC)`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS trade_opportunity_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      opportunity_id uuid NOT NULL REFERENCES trade_opportunities(id) ON DELETE CASCADE,
      actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      event_type varchar(32) NOT NULL CHECK (event_type IN ('submitted','approved','rejected','closed')),
      note text,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
}

type MatchOpportunity = {
  id: string; account_id: string; account_name?: string; opportunity_type: OpportunityType;
  title: string; product_category: string | null; quantity: string | number | null;
  quantity_unit: string | null; target_country: string | null; destination_country: string | null;
  currency: string | null; target_unit_price: string | number | null;
  minimum_order_quantity: string | number | null; review_status: ReviewStatus; expires_at: string | null;
};

export function buildTradeOpportunityMatches(rows: MatchOpportunity[]) {
  const buyers = rows.filter(row => row.opportunity_type === "buyer_request");
  const suppliers = rows.filter(row => row.opportunity_type === "supplier_offer");
  const matches: Array<Record<string, unknown>> = [];
  for (const buyer of buyers) for (const supplier of suppliers) {
    if (buyer.account_id === supplier.account_id) continue;
    const reasons: string[] = [];
    const warnings: string[] = [];
    let score = 0;
    const buyerCategory = (buyer.product_category ?? "").trim().toLocaleLowerCase();
    const supplierCategory = (supplier.product_category ?? "").trim().toLocaleLowerCase();
    if (!buyerCategory || !supplierCategory || buyerCategory !== supplierCategory) continue;
    score += 35; reasons.push("Exact product category");
    if (buyer.target_country && supplier.target_country) {
      if (buyer.target_country !== supplier.target_country) continue;
      score += 15; reasons.push("Origin country matches");
    } else warnings.push("Origin country needs confirmation");
    if (buyer.destination_country && supplier.destination_country) {
      if (buyer.destination_country !== supplier.destination_country) continue;
      score += 20; reasons.push("Delivery destination matches");
    } else warnings.push("Delivery destination needs confirmation");
    if (buyer.quantity !== null && buyer.quantity !== undefined && supplier.minimum_order_quantity !== null && supplier.minimum_order_quantity !== undefined) {
      const required = Number(buyer.quantity);
      const minimum = Number(supplier.minimum_order_quantity);
      if (!Number.isFinite(required) || !Number.isFinite(minimum) || minimum > required) continue;
      if (supplier.quantity !== null && supplier.quantity !== undefined) {
        if (!Number.isFinite(Number(supplier.quantity)) || Number(supplier.quantity) < required) continue;
        score += 15; reasons.push("Quantity fits supplier minimum and stated capacity");
      } else warnings.push("Supplier capacity needs confirmation");
    } else warnings.push("Quantity or supplier minimum needs confirmation");
    if (buyer.currency && supplier.currency) {
      if (buyer.currency !== supplier.currency) continue;
      score += 5; reasons.push("Currency matches");
    } else warnings.push("Comparable currency quote is missing");
    if (buyer.target_unit_price !== null && buyer.target_unit_price !== undefined && supplier.target_unit_price !== null && supplier.target_unit_price !== undefined) {
      if (Number(supplier.target_unit_price) > Number(buyer.target_unit_price)) continue;
      score += 10; reasons.push("Supplier indicative unit price is within buyer target");
    } else warnings.push("Comparable price evidence is missing");
    matches.push({
      buyer: { id: buyer.id, accountId: buyer.account_id, accountName: buyer.account_name, title: buyer.title },
      supplier: { id: supplier.id, accountId: supplier.account_id, accountName: supplier.account_name, title: supplier.title },
      score, reasons, warnings,
      readiness: warnings.length === 0 ? "review_ready" : "needs_information",
    });
  }
  return matches.sort((a, b) => Number(b.score) - Number(a.score));
}

export async function handleTradeOpportunitiesRequest(
  request: IncomingMessage,
  response: ServerResponse,
  opportunityId?: string,
): Promise<void> {
  if (!["GET", "POST", "PATCH"].includes(request.method ?? "")) {
    reply(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) { reply(response, 401, { success: false, error: "Authentication required" }); return; }
    const userId = session.user.id;
    const db = getDatabasePool();

    if (request.method === "GET" && opportunityId === "matches") {
      const owner = await authorizePlatformPermission(request, response, "platform.manage");
      if (!owner) return;
      const result = await db.query(
        `SELECT o.id, o.account_id, a.display_name AS account_name, o.opportunity_type, o.title,
                o.product_category, o.quantity::text AS quantity, o.quantity_unit,
                o.target_country, o.destination_country, o.currency,
                o.target_unit_price::text AS target_unit_price,
                o.minimum_order_quantity::text AS minimum_order_quantity,
                o.review_status, o.expires_at
         FROM trade_opportunities o
         INNER JOIN accounts a ON a.id=o.account_id
         WHERE o.review_status='approved' AND (o.expires_at IS NULL OR o.expires_at > NOW())
         ORDER BY o.updated_at DESC LIMIT 500`
      );
      const matches = buildTradeOpportunityMatches(result.rows as MatchOpportunity[]);
      reply(response, 200, { success: true, matches, sourceCount: result.rowCount ?? result.rows.length, generatedAt: new Date().toISOString(), note: "Indicative internal matches only. Verify identity, specifications, capacity, quote and shipping before introduction." });
      return;
    }

    if (request.method === "GET") {
      if (opportunityId === "review") {
        const owner = await authorizePlatformPermission(request, response, "platform.manage");
        if (!owner) return;
        const result = await db.query(`SELECT o.*, a.display_name AS account_name
          FROM trade_opportunities o INNER JOIN accounts a ON a.id=o.account_id
          WHERE o.review_status='pending_review' ORDER BY o.created_at ASC LIMIT 200`);
        reply(response, 200, { success: true, opportunities: result.rows });
        return;
      }
      if (opportunityId) {
        const owner = await authorizePlatformPermission(request, response, "platform.manage");
        if (!owner) return;
        const result = await db.query(`SELECT o.*, a.display_name AS account_name FROM trade_opportunities o INNER JOIN accounts a ON a.id=o.account_id WHERE o.id=$1 LIMIT 1`, [opportunityId]);
        if (!result.rowCount) { reply(response, 404, { success: false, error: "Opportunity not found" }); return; }
        reply(response, 200, { success: true, opportunity: result.rows[0] });
        return;
      }
      const result = await db.query(
        `SELECT o.id, o.opportunity_type, o.title, o.description, o.product_category,
                o.quantity::text AS quantity, o.quantity_unit, o.target_country, o.destination_country,
                o.currency, o.target_unit_price::text AS target_unit_price,
                o.minimum_order_quantity::text AS minimum_order_quantity, o.delivery_terms,
                o.review_status, o.expires_at, o.created_at, o.updated_at
         FROM trade_opportunities o
         INNER JOIN accounts a ON a.id=o.account_id AND a.status='active'
         WHERE EXISTS (
           SELECT 1 FROM account_members am
           INNER JOIN roles r ON r.id=am.role_id AND r.scope_type=am.role_scope
           INNER JOIN role_permissions rp ON rp.role_id=r.id AND rp.scope_type=r.scope_type
           INNER JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
           WHERE am.account_id=o.account_id AND am.user_id=$1 AND am.status='active'
             AND p.permission_key='account.trade.read'
         )
         ORDER BY o.created_at DESC LIMIT 100`,
        [userId],
      );
      reply(response, 200, { success: true, opportunities: result.rows });
      return;
    }

    if (request.method === "POST") {
      let body: Record<string, unknown>;
      try { body = await readBody(request); } catch (error) {
        reply(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      const accountId = body.accountId;
      const type = body.opportunityType as OpportunityType;
      const title = text(body.title, 180);
      const description = text(body.description, 8000);
      const category = text(body.productCategory, 120);
      const quantity = body.quantity === undefined || body.quantity === null || body.quantity === "" ? null : Number(body.quantity);
      const currency = text(body.currency, 3).toUpperCase();
      const unitPrice = body.targetUnitPrice === undefined || body.targetUnitPrice === null || body.targetUnitPrice === "" ? null : Number(body.targetUnitPrice);
      const moq = body.minimumOrderQuantity === undefined || body.minimumOrderQuantity === null || body.minimumOrderQuantity === "" ? null : Number(body.minimumOrderQuantity);
      const country = text(body.targetCountry, 2).toUpperCase();
      const destination = text(body.destinationCountry, 2).toUpperCase();
      const evidenceUrl = text(body.evidenceUrl, 2000);
      const expiresAt = body.expiresAt;
      const details = body.details && typeof body.details === "object" && !Array.isArray(body.details) ? body.details : {};
      if (!uuid(accountId) || !["buyer_request", "supplier_offer"].includes(type) ||
          title.length < 3 || description.length < 10 ||
          (quantity !== null && !positive(quantity)) ||
          (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 999999999999)) ||
          (moq !== null && !positive(moq)) ||
          (currency && !/^[A-Z]{3}$/.test(currency)) ||
          (country && !/^[A-Z]{2}$/.test(country)) || (destination && !/^[A-Z]{2}$/.test(destination)) ||
          (evidenceUrl && !/^https:\/\//i.test(evidenceUrl)) ||
          (expiresAt !== undefined && expiresAt !== null && (typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()))) {
        reply(response, 400, { success: false, error: "Invalid opportunity details. Check type, title, description, quantities, currency, country codes and expiry." });
        return;
      }
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        if (!(await canCreate(client, accountId, userId))) {
          await client.query("ROLLBACK");
          reply(response, 403, { success: false, error: "Trade creation permission required for this business account" });
          return;
        }
        const inserted = await client.query(
          `INSERT INTO trade_opportunities
            (account_id, created_by_user_id, opportunity_type, title, description, product_category,
             quantity, quantity_unit, target_country, destination_country, currency, target_unit_price,
             minimum_order_quantity, delivery_terms, evidence_url, details, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)
           RETURNING id, opportunity_type, title, review_status, created_at`,
          [accountId, userId, type, title, description, category || null, quantity,
            text(body.quantityUnit, 40) || null, country || null, destination || null,
            currency || null, unitPrice, moq, text(body.deliveryTerms, 40) || null,
            evidenceUrl || null, JSON.stringify(details), expiresAt ?? null],
        );
        await client.query(
          `INSERT INTO trade_opportunity_events (opportunity_id, actor_user_id, event_type, note)
           VALUES ($1,$2,'submitted','Submitted for platform review')`,
          [inserted.rows[0].id, userId],
        );
        await client.query("COMMIT");
        reply(response, 201, { success: true, opportunity: inserted.rows[0], message: "Submitted privately for platform review. It is not yet visible for matching." });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
      return;
    }

    if (!opportunityId || !uuid(opportunityId)) { reply(response, 400, { success: false, error: "A valid opportunity ID is required" }); return; }
    const owner = await authorizePlatformPermission(request, response, "platform.manage");
    if (!owner) return;
    let body: Record<string, unknown>;
    try { body = await readBody(request); } catch {
      reply(response, 400, { success: false, error: "Invalid JSON body" }); return;
    }
    const status = text(body.reviewStatus, 24) as ReviewStatus;
    const note = text(body.note, 1000);
    if (!["approved", "rejected", "closed"].includes(status)) {
      reply(response, 400, { success: false, error: "Review status must be approved, rejected or closed" });
      return;
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE trade_opportunities SET review_status=$2, reviewed_by_user_id=$3, reviewed_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND review_status IN ('pending_review','approved') RETURNING id, review_status`,
        [opportunityId, status, userId],
      );
      if (!updated.rowCount) {
        await client.query("ROLLBACK");
        reply(response, 404, { success: false, error: "Opportunity not found or no longer reviewable" });
        return;
      }
      await client.query(
        `INSERT INTO trade_opportunity_events (opportunity_id, actor_user_id, event_type, note)
         VALUES ($1,$2,$3,$4)`,
        [opportunityId, userId, status, note || null],
      );
      await client.query("COMMIT");
      reply(response, 200, { success: true, opportunity: updated.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  } catch (error) {
    console.error("WASLA trade opportunity error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Trade opportunity request failed" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
