import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(res: ServerResponse, status: number, data: Record<string, unknown>): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}

async function currentUser(req: IncomingMessage): Promise<string | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  return session?.user?.id ?? null;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "";
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 24_000) throw new Error("BODY_TOO_LARGE");
    raw += chunk.toString();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonSize(value: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(value)); } catch { return Number.MAX_SAFE_INTEGER; }
}

function dealNumber(): string {
  return `WD-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

/** Trade workspace: only buyers and active supplier-account members can see a deal. */
export async function handleTradeDeals(req: IncomingMessage, res: ServerResponse, dealId?: string): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    reply(res, 405, { success: false, error: "Method not allowed" });
    return;
  }
  if (dealId && !UUID.test(dealId)) {
    reply(res, 400, { success: false, error: "Invalid deal ID" });
    return;
  }

  try {
    const userId = await currentUser(req);
    if (!userId) { reply(res, 401, { success: false, error: "Authentication required" }); return; }
    const db = getDatabasePool();

    if (req.method === "GET") {
      const result = await db.query(
        `SELECT d.id, d.deal_number, d.sourcing_order_id, d.buyer_user_id,
                d.supplier_account_id, a.display_name AS supplier_name,
                d.status, d.terms_version, d.terms_snapshot,
                d.proposed_by_user_id, (d.proposed_by_user_id <> $1) AS can_respond,
                d.accepted_by_user_id, d.accepted_at, d.created_at, d.updated_at
         FROM trade_deals d
         JOIN accounts a ON a.id = d.supplier_account_id
         WHERE (d.buyer_user_id = $1
            OR EXISTS (
              SELECT 1 FROM account_members am
              WHERE am.account_id = d.supplier_account_id
                AND am.user_id = $1 AND am.status = 'active'
            ))
           AND ($2::uuid IS NULL OR d.id = $2)
         ORDER BY d.updated_at DESC
         LIMIT 100`,
        [userId, dealId ?? null],
      );
      if (dealId && result.rows.length === 0) {
        reply(res, 404, { success: false, error: "Trade deal not found" });
        return;
      }
      if (dealId) {
        const [amendments, milestones, events] = await Promise.all([
          db.query(`SELECT id, version, proposed_by_user_id, (proposed_by_user_id <> $2) AS can_respond, responded_by_user_id, status, terms_snapshot, reason, responded_at, created_at FROM trade_deal_amendments WHERE deal_id = $1 ORDER BY version DESC`, [dealId, userId]),
          db.query(`SELECT id, title, description, due_at, status, completed_by_user_id, completed_at, created_by_user_id, created_at, updated_at FROM trade_deal_milestones WHERE deal_id = $1 ORDER BY due_at NULLS LAST, created_at`, [dealId]),
          db.query(`SELECT id, actor_user_id, event_type, from_status, to_status, metadata, created_at FROM trade_deal_events WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 100`, [dealId]),
        ]);
        reply(res, 200, { success: true, deal: result.rows[0], amendments: amendments.rows, milestones: milestones.rows, events: events.rows });
        return;
      }
      reply(res, 200, { success: true, deals: result.rows });
      return;
    }

    if (dealId) {
      reply(res, 405, { success: false, error: "Use the deal response endpoint" });
      return;
    }

    const body = await readBody(req);
    const orderId = body?.sourcingOrderId;
    const terms = body?.termsSnapshot;
    if (typeof orderId !== "string" || !UUID.test(orderId) || !isObject(terms) || jsonSize(terms) > 16_000) {
      reply(res, 400, { success: false, error: "Provide a valid sourcing order and terms snapshot (maximum 16 KB)" });
      return;
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const order = await client.query(
        `SELECT so.id, so.order_number, so.request_id, so.accepted_offer_id,
                so.buyer_user_id, so.supplier_account_id, so.status,
                so.currency, so.subtotal, so.shipping_total, so.grand_total,
                so.commercial_snapshot, a.status AS account_status
         FROM sourcing_orders so
         JOIN accounts a ON a.id = so.supplier_account_id
         WHERE so.id = $1
         FOR UPDATE OF so`,
        [orderId],
      );
      const source = order.rows[0];
      if (!source || source.buyer_user_id !== userId) {
        await client.query("ROLLBACK");
        reply(res, 404, { success: false, error: "Eligible sourcing order not found" });
        return;
      }
      if (source.account_status !== "active" || !["awaiting_payment", "payment_pending", "paid", "fulfilment_pending"].includes(source.status)) {
        await client.query("ROLLBACK");
        reply(res, 409, { success: false, error: "This order is not eligible for a trade deal" });
        return;
      }
      const existing = await client.query(
        `SELECT id FROM trade_deals WHERE sourcing_order_id = $1 LIMIT 1`,
        [orderId],
      );
      if (existing.rows.length) {
        await client.query("ROLLBACK");
        reply(res, 409, { success: false, error: "A trade deal already exists for this sourcing order", dealId: existing.rows[0].id });
        return;
      }
      const termsSnapshot = {
        orderNumber: source.order_number,
        currency: source.currency,
        subtotal: source.subtotal,
        shippingTotal: source.shipping_total,
        grandTotal: source.grand_total,
        commercialSnapshot: source.commercial_snapshot,
        proposedTerms: terms,
      };
      const inserted = await client.query(
        `INSERT INTO trade_deals
         (deal_number, sourcing_order_id, buyer_user_id, supplier_account_id,
          status, terms_version, terms_snapshot, proposed_by_user_id)
         VALUES ($1,$2,$3,$4,'proposed',1,$5::jsonb,$3)
         RETURNING id, deal_number, sourcing_order_id, buyer_user_id,
                   supplier_account_id, status, terms_version, terms_snapshot,
                   proposed_by_user_id, created_at, updated_at`,
        [dealNumber(), orderId, userId, source.supplier_account_id, JSON.stringify(termsSnapshot)],
      );
      const deal = inserted.rows[0];
      await client.query(
        `INSERT INTO trade_deal_events (deal_id, actor_user_id, event_type, to_status, metadata)
         VALUES ($1,$2,'deal_proposed','proposed',$3::jsonb)`,
        [deal.id, userId, JSON.stringify({ sourcingOrderId: orderId, termsVersion: 1 })],
      );
      await client.query("COMMIT");
      reply(res, 201, { success: true, deal });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if ((error as { code?: string })?.code === "23505") {
        reply(res, 409, { success: false, error: "A trade deal already exists for this sourcing order" });
        return;
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA trade deals error:", error);
    const tooLarge = error instanceof Error && error.message === "BODY_TOO_LARGE";
    reply(res, tooLarge ? 413 : 500, {
      success: false,
      error: tooLarge ? "Request body is too large" : "Could not process trade deal",
    });
  }
}

/** Only the other party may accept or decline a proposed deal. */
export async function handleTradeDealResponse(req: IncomingMessage, res: ServerResponse, dealId: string): Promise<void> {
  if (!UUID.test(dealId)) { reply(res, 400, { success: false, error: "Invalid deal ID" }); return; }
  if (req.method !== "POST") { reply(res, 405, { success: false, error: "Method not allowed" }); return; }
  try {
    const userId = await currentUser(req);
    if (!userId) { reply(res, 401, { success: false, error: "Authentication required" }); return; }
    const body = await readBody(req);
    const decision = body?.decision;
    if (decision !== "accept" && decision !== "decline") {
      reply(res, 400, { success: false, error: "Decision must be accept or decline" });
      return;
    }
    const db = getDatabasePool();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        `SELECT d.id, d.buyer_user_id, d.supplier_account_id, d.status,
                d.proposed_by_user_id
         FROM trade_deals d
         WHERE d.id = $1
           AND (d.buyer_user_id = $2 OR EXISTS (
             SELECT 1 FROM account_members am
             WHERE am.account_id = d.supplier_account_id
               AND am.user_id = $2 AND am.status = 'active'
           ))
         FOR UPDATE`,
        [dealId, userId],
      );
      const deal = found.rows[0];
      if (!deal) {
        await client.query("ROLLBACK");
        reply(res, 404, { success: false, error: "Trade deal not found" });
        return;
      }
      const supplierMember = await client.query(
        `SELECT 1 FROM account_members WHERE account_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1`,
        [deal.supplier_account_id, userId],
      );
      const isSupplierParty = supplierMember.rows.length > 0;
      if (deal.proposed_by_user_id === userId || (userId === deal.buyer_user_id && !isSupplierParty)) {
        await client.query("ROLLBACK");
        reply(res, 403, { success: false, error: "The proposing party cannot approve its own deal" });
        return;
      }
      if (deal.status !== "proposed") {
        await client.query("ROLLBACK");
        reply(res, 409, { success: false, error: "This deal is no longer awaiting a response" });
        return;
      }
      const nextStatus = decision === "accept" ? "agreed" : "cancelled";
      const updated = await client.query(
        `UPDATE trade_deals
         SET status = $2,
             accepted_by_user_id = CASE WHEN $2 = 'agreed' THEN $3 ELSE NULL END,
             accepted_at = CASE WHEN $2 = 'agreed' THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, deal_number, status, terms_version, accepted_by_user_id, accepted_at, updated_at`,
        [dealId, nextStatus, userId],
      );
      await client.query(
        `INSERT INTO trade_deal_events (deal_id, actor_user_id, event_type, from_status, to_status, metadata)
         VALUES ($1,$2,$3,'proposed',$4,$5::jsonb)`,
        [dealId, userId, decision === "accept" ? "deal_accepted" : "deal_declined", nextStatus, JSON.stringify({ decision })],
      );
      await client.query("COMMIT");
      reply(res, 200, { success: true, deal: updated.rows[0] });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA trade deal response error:", error);
    const tooLarge = error instanceof Error && error.message === "BODY_TOO_LARGE";
    reply(res, tooLarge ? 413 : 500, { success: false, error: tooLarge ? "Request body is too large" : "Could not respond to trade deal" });
  }
}


async function requireTradeParty(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> }, dealId: string, userId: string) {
  const result = await client.query(
    `SELECT d.id, d.buyer_user_id, d.supplier_account_id, d.status, d.terms_version, d.terms_snapshot,
            a.status AS account_status
     FROM trade_deals d
     JOIN accounts a ON a.id = d.supplier_account_id
     WHERE d.id = $1
       AND (d.buyer_user_id = $2 OR EXISTS (
         SELECT 1 FROM account_members am
         WHERE am.account_id = d.supplier_account_id
           AND am.user_id = $2 AND am.status = 'active'
       ))
     FOR UPDATE`,
    [dealId, userId],
  );
  return result.rows[0] ?? null;
}

export async function handleTradeAmendments(req: IncomingMessage, res: ServerResponse, dealId: string, amendmentId?: string): Promise<void> {
  if (!UUID.test(dealId) || (amendmentId && !UUID.test(amendmentId))) {
    reply(res, 400, { success: false, error: "Invalid deal or amendment ID" }); return;
  }
  if (req.method !== "POST") { reply(res, 405, { success: false, error: "Method not allowed" }); return; }
  try {
    const userId = await currentUser(req);
    if (!userId) { reply(res, 401, { success: false, error: "Authentication required" }); return; }
    const body = await readBody(req);
    const db = getDatabasePool();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const deal = await requireTradeParty(client, dealId, userId);
      if (!deal) {
        await client.query("ROLLBACK");
        reply(res, 404, { success: false, error: "Trade deal not found" }); return;
      }
      if (deal.account_status !== "active") {
        await client.query("ROLLBACK");
        reply(res, 409, { success: false, error: "The supplier account is not active" }); return;
      }
      const supplierMember = await client.query(
        `SELECT 1 FROM account_members WHERE account_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1`,
        [deal.supplier_account_id, userId],
      );
      const isSupplier = supplierMember.rows.length > 0;
      const isBuyer = deal.buyer_user_id === userId;
      if (isBuyer && isSupplier) {
        await client.query("ROLLBACK");
        reply(res, 403, { success: false, error: "A user cannot act as both parties in one deal" }); return;
      }
      if (amendmentId) {
        if (!["agreed", "in_progress"].includes(deal.status)) {
          await client.query("ROLLBACK");
          reply(res, 409, { success: false, error: "Only active agreed deals can process amendments" }); return;
        }
        if (body?.decision !== "accept" && body?.decision !== "reject") {
          await client.query("ROLLBACK");
          reply(res, 400, { success: false, error: "Decision must be accept or reject" }); return;
        }
        const found = await client.query(
          `SELECT id, version, proposed_by_user_id, status, terms_snapshot
           FROM trade_deal_amendments WHERE id = $1 AND deal_id = $2 FOR UPDATE`,
          [amendmentId, dealId],
        );
        const amendment = found.rows[0];
        if (!amendment) {
          await client.query("ROLLBACK");
          reply(res, 404, { success: false, error: "Amendment not found" }); return;
        }
        if (amendment.proposed_by_user_id === userId) {
          await client.query("ROLLBACK");
          reply(res, 403, { success: false, error: "The proposing party cannot respond to its own amendment" }); return;
        }
        if (amendment.status !== "proposed") {
          await client.query("ROLLBACK");
          reply(res, 409, { success: false, error: "Amendment already has a response" }); return;
        }
        const accepted = body.decision === "accept";
        if (accepted && deal.terms_version + 1 !== amendment.version) {
          await client.query("ROLLBACK");
          reply(res, 409, { success: false, error: "Amendment version is no longer current" }); return;
        }
        await client.query(
          `UPDATE trade_deal_amendments SET status = $2, responded_by_user_id = $3, responded_at = NOW() WHERE id = $1`,
          [amendmentId, accepted ? "accepted" : "rejected", userId],
        );
        if (accepted) {
          await client.query(
            `UPDATE trade_deals SET terms_snapshot = $2::jsonb, terms_version = $3, updated_at = NOW() WHERE id = $1`,
            [dealId, JSON.stringify(amendment.terms_snapshot), amendment.version],
          );
        }
        await client.query(
          `INSERT INTO trade_deal_events (deal_id, actor_user_id, event_type, metadata)
           VALUES ($1,$2,$3,$4::jsonb)`,
          [dealId, userId, accepted ? "amendment_accepted" : "amendment_rejected", JSON.stringify({ amendmentId, version: amendment.version })],
        );
        await client.query("COMMIT");
        reply(res, 200, { success: true, amendment: { id: amendmentId, status: accepted ? "accepted" : "rejected", version: amendment.version } });
        return;
      }

      if (!isObject(body?.termsSnapshot) || jsonSize(body.termsSnapshot) > 16_000 ||
          (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.length > 1000))) {
        await client.query("ROLLBACK");
        reply(res, 400, { success: false, error: "Provide valid amendment terms (maximum 16 KB) and an optional reason up to 1000 characters" }); return;
      }
      if (!["agreed", "in_progress"].includes(deal.status)) {
        await client.query("ROLLBACK");
        reply(res, 409, { success: false, error: "Only agreed or in-progress deals can be amended" }); return;
      }
      const pending = await client.query(
        `SELECT 1 FROM trade_deal_amendments WHERE deal_id = $1 AND status = 'proposed' LIMIT 1`,
        [dealId],
      );
      if (pending.rows.length) {
        await client.query("ROLLBACK");
        reply(res, 409, { success: false, error: "Respond to the pending amendment before proposing another" }); return;
      }
      const version = deal.terms_version + 1;
      const inserted = await client.query(
        `INSERT INTO trade_deal_amendments (deal_id, version, proposed_by_user_id, terms_snapshot, reason)
         VALUES ($1,$2,$3,$4::jsonb,$5)
         RETURNING id, version, proposed_by_user_id, status, terms_snapshot, reason, created_at`,
        [dealId, version, userId, JSON.stringify(body.termsSnapshot), typeof body.reason === "string" ? body.reason.trim() : null],
      );
      await client.query(
        `INSERT INTO trade_deal_events (deal_id, actor_user_id, event_type, metadata)
         VALUES ($1,$2,'amendment_proposed',$3::jsonb)`,
        [dealId, userId, JSON.stringify({ amendmentId: inserted.rows[0].id, version })],
      );
      await client.query("COMMIT");
      reply(res, 201, { success: true, amendment: inserted.rows[0] });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally { client.release(); }
  } catch (error) {
    console.error("WASLA trade amendment error:", error);
    const tooLarge = error instanceof Error && error.message === "BODY_TOO_LARGE";
    reply(res, tooLarge ? 413 : 500, { success: false, error: tooLarge ? "Request body is too large" : "Could not process amendment" });
  }
}

export async function handleTradeMilestones(req: IncomingMessage, res: ServerResponse, dealId: string, milestoneId?: string): Promise<void> {
  if (!UUID.test(dealId) || (milestoneId && !UUID.test(milestoneId))) {
    reply(res, 400, { success: false, error: "Invalid deal or milestone ID" }); return;
  }
  if (req.method !== "POST" && req.method !== "PATCH") {
    reply(res, 405, { success: false, error: "Method not allowed" }); return;
  }
  try {
    const userId = await currentUser(req);
    if (!userId) { reply(res, 401, { success: false, error: "Authentication required" }); return; }
    const body = await readBody(req);
    const db = getDatabasePool();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const deal = await requireTradeParty(client, dealId, userId);
      if (!deal) {
        await client.query("ROLLBACK");
        reply(res, 404, { success: false, error: "Trade deal not found" }); return;
      }
      if (deal.account_status !== "active") {
        await client.query("ROLLBACK");
        reply(res, 409, { success: false, error: "The supplier account is not active" }); return;
      }
      if (!["agreed", "in_progress"].includes(deal.status)) {
        await client.query("ROLLBACK");
        reply(res, 409, { success: false, error: "Milestones require an agreed or in-progress deal" }); return;
      }
      if (req.method === "POST" && !milestoneId) {
        const title = typeof body?.title === "string" ? body.title.trim() : "";
        const description = body?.description === undefined ? null : typeof body.description === "string" ? body.description.trim() : undefined;
        const dueAt = body?.dueAt === undefined || body.dueAt === null ? null : typeof body.dueAt === "string" && !Number.isNaN(Date.parse(body.dueAt)) ? new Date(body.dueAt).toISOString() : undefined;
        if (!title || title.length > 180 || description === undefined || (description !== null && description.length > 2000) || dueAt === undefined) {
          await client.query("ROLLBACK");
          reply(res, 400, { success: false, error: "Provide a title up to 180 characters, optional description up to 2000 characters, and a valid due date" }); return;
        }
        const inserted = await client.query(
          `INSERT INTO trade_deal_milestones (deal_id, title, description, due_at, created_by_user_id)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING id, title, description, due_at, status, created_by_user_id, created_at, updated_at`,
          [dealId, title, description, dueAt, userId],
        );
        await client.query(
          `INSERT INTO trade_deal_events (deal_id, actor_user_id, event_type, metadata)
           VALUES ($1,$2,'milestone_created',$3::jsonb)`,
          [dealId, userId, JSON.stringify({ milestoneId: inserted.rows[0].id })],
        );
        await client.query("COMMIT");
        reply(res, 201, { success: true, milestone: inserted.rows[0] }); return;
      }
      if (req.method === "PATCH" && milestoneId) {
        if (body?.status !== "completed" && body?.status !== "cancelled") {
          await client.query("ROLLBACK");
          reply(res, 400, { success: false, error: "Status must be completed or cancelled" }); return;
        }
        const found = await client.query(
          `SELECT id, status FROM trade_deal_milestones WHERE id = $1 AND deal_id = $2 FOR UPDATE`,
          [milestoneId, dealId],
        );
        const milestone = found.rows[0];
        if (!milestone) {
          await client.query("ROLLBACK");
          reply(res, 404, { success: false, error: "Milestone not found" }); return;
        }
        if (milestone.status !== "pending") {
          await client.query("ROLLBACK");
          reply(res, 409, { success: false, error: "Only pending milestones can be updated" }); return;
        }
        const completed = body.status === "completed";
        const updated = await client.query(
          `UPDATE trade_deal_milestones
           SET status = $2, completed_by_user_id = CASE WHEN $2 = 'completed' THEN $3 ELSE NULL END,
               completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE NULL END,
               updated_at = NOW()
           WHERE id = $1
           RETURNING id, title, status, completed_by_user_id, completed_at, updated_at`,
          [milestoneId, body.status, userId],
        );
        await client.query(
          `INSERT INTO trade_deal_events (deal_id, actor_user_id, event_type, metadata)
           VALUES ($1,$2,$3,$4::jsonb)`,
          [dealId, userId, completed ? "milestone_completed" : "milestone_cancelled", JSON.stringify({ milestoneId })],
        );
        await client.query("COMMIT");
        reply(res, 200, { success: true, milestone: updated.rows[0] }); return;
      }
      await client.query("ROLLBACK");
      reply(res, 404, { success: false, error: "Trade milestone route not found" });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally { client.release(); }
  } catch (error) {
    console.error("WASLA trade milestone error:", error);
    const tooLarge = error instanceof Error && error.message === "BODY_TOO_LARGE";
    reply(res, tooLarge ? 413 : 500, { success: false, error: tooLarge ? "Request body is too large" : "Could not process milestone" });
  }
}
