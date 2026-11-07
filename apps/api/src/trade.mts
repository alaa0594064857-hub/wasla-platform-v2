import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

type DealStatus = "draft" | "proposed" | "negotiating" | "accepted" | "declined" | "cancelled" | "completed";
type TradeAction = "propose" | "counter" | "accept" | "decline" | "cancel" | "complete";

function respond(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 30_000) throw new Error("Request body too large");
    body += chunk.toString();
  }
  const parsed: unknown = JSON.parse(body || "{}");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Invalid request body");
  return parsed as Record<string, unknown>;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 999999999999;
}

async function hasAccountPermission(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rowCount: number | null; rows: unknown[] }> },
  accountId: string,
  userId: string,
  permission: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
     FROM account_members am
     INNER JOIN accounts a ON a.id = am.account_id AND a.status = 'active'
     INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
     INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
     INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
     WHERE am.account_id = $1 AND am.user_id = $2 AND am.status = 'active'
       AND p.permission_key = $3
     LIMIT 1`,
    [accountId, userId, permission],
  );
  return Boolean(result.rowCount);
}

async function notifyTradeParty(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  accountId: string,
  dealId: string,
  titleAr: string,
  titleEn: string,
  bodyAr: string,
  bodyEn: string,
): Promise<void> {
  await client.query(
    `INSERT INTO notifications (
       user_id, type, title_ar, title_en, body_ar, body_en,
       action_url, resource_id, metadata
     )
     SELECT am.user_id, 'trade_deal', $3, $4, $5, $6, '/trade', $2, $7::jsonb
     FROM account_members am
     INNER JOIN users u ON u.id = am.user_id AND u.status = 'active' AND u.email_verified = TRUE
     INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
     INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
     INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
     WHERE am.account_id = $1 AND am.status = 'active'
       AND p.permission_key = 'account.trade.read'`,
    [accountId, dealId, titleAr, titleEn, bodyAr, bodyEn, JSON.stringify({ dealId })],
  );
}

export async function ensureTradeTables(): Promise<void> {
  const db = getDatabasePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS trade_deals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      initiator_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      counterparty_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      pending_response_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
      title varchar(180) NOT NULL,
      description text,
      currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
      proposed_amount numeric(14,2) CHECK (proposed_amount IS NULL OR proposed_amount >= 0),
      status varchar(24) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'proposed', 'negotiating', 'accepted', 'declined', 'cancelled', 'completed')),
      expires_at timestamptz,
      accepted_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT trade_deals_distinct_accounts CHECK (initiator_account_id <> counterparty_account_id),
      CONSTRAINT trade_deals_pending_party CHECK (
        pending_response_account_id IS NULL
        OR pending_response_account_id IN (initiator_account_id, counterparty_account_id)
      )
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS trade_deal_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id uuid NOT NULL REFERENCES trade_deals(id) ON DELETE CASCADE,
      title varchar(180) NOT NULL,
      description text,
      sku varchar(120),
      quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
      unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
      currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS trade_deal_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id uuid NOT NULL REFERENCES trade_deals(id) ON DELETE CASCADE,
      actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      actor_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
      event_type varchar(32) NOT NULL
        CHECK (event_type IN ('created', 'proposed', 'countered', 'accepted', 'declined', 'cancelled', 'completed')),
      from_status varchar(24),
      to_status varchar(24) NOT NULL,
      body text,
      terms jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS trade_deals_initiator_updated_idx ON trade_deals (initiator_account_id, updated_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS trade_deals_counterparty_updated_idx ON trade_deals (counterparty_account_id, updated_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS trade_deal_items_deal_idx ON trade_deal_items (deal_id, created_at)`);
  await db.query(`CREATE INDEX IF NOT EXISTS trade_deal_events_deal_idx ON trade_deal_events (deal_id, created_at DESC)`);
}

export async function handleTradeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dealId?: string,
): Promise<void> {
  if (!["GET", "POST", "PATCH"].includes(request.method ?? "")) {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      respond(response, 401, { success: false, error: "Authentication required" });
      return;
    }
    const db = getDatabasePool();
    const userId = session.user.id;

    if (!dealId && request.method === "GET") {
      const result = await db.query(
        `SELECT d.id, d.initiator_account_id AS "initiatorAccountId",
                d.counterparty_account_id AS "counterpartyAccountId",
                d.created_by_user_id AS "createdByUserId",
                d.title, d.description, d.currency, d.proposed_amount::text AS "proposedAmount",
                d.status, d.pending_response_account_id AS "pendingResponseAccountId",
                d.expires_at AS "expiresAt", d.accepted_at AS "acceptedAt",
                d.completed_at AS "completedAt", d.created_at AS "createdAt", d.updated_at AS "updatedAt",
                ia.display_name AS "initiatorName", ca.display_name AS "counterpartyName"
         FROM trade_deals d
         INNER JOIN accounts ia ON ia.id = d.initiator_account_id
         INNER JOIN accounts ca ON ca.id = d.counterparty_account_id
         WHERE (d.status <> 'draft' OR EXISTS (
           SELECT 1 FROM account_members draft_member
           INNER JOIN roles draft_role ON draft_role.id = draft_member.role_id AND draft_role.scope_type = draft_member.role_scope
           INNER JOIN role_permissions draft_rp ON draft_rp.role_id = draft_role.id AND draft_rp.scope_type = draft_role.scope_type
           INNER JOIN permissions draft_permission ON draft_permission.id = draft_rp.permission_id AND draft_permission.scope_type = draft_rp.scope_type
           WHERE draft_member.user_id = $1 AND draft_member.status = 'active'
             AND draft_member.account_id = d.initiator_account_id
             AND draft_permission.permission_key = 'account.trade.read'
         )) AND EXISTS (
           SELECT 1 FROM account_members am
           INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
           INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
           INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
           WHERE am.user_id = $1 AND am.status = 'active'
             AND am.account_id IN (d.initiator_account_id, d.counterparty_account_id)
             AND p.permission_key = 'account.trade.read'
         )
         ORDER BY d.updated_at DESC LIMIT 100`,
        [userId],
      );
      respond(response, 200, { success: true, deals: result.rows });
      return;
    }

    if (!dealId && request.method === "POST") {
      const body = await readBody(request);
      const initiatorAccountId = body.initiatorAccountId;
      const counterpartyAccountId = body.counterpartyAccountId;
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
      const amount = body.proposedAmount;
      const expiresAt = body.expiresAt;
      const items = Array.isArray(body.items) ? body.items : [];

      if (!isUuid(initiatorAccountId) || !isUuid(counterpartyAccountId) ||
          initiatorAccountId === counterpartyAccountId || title.length < 3 || title.length > 180 ||
          description.length > 5000 || !/^[A-Z]{3}$/.test(currency) ||
          (amount !== undefined && amount !== null && !validAmount(amount)) ||
          items.length > 50) {
        respond(response, 400, { success: false, error: "Invalid trade deal details" });
        return;
      }
      if (expiresAt !== undefined && expiresAt !== null &&
          (typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt)))) {
        respond(response, 400, { success: false, error: "Invalid expiry date" });
        return;
      }

      const client = await db.connect();
      try {
        await client.query("BEGIN");
        if (!(await hasAccountPermission(client, initiatorAccountId, userId, "account.trade.create"))) {
          await client.query("ROLLBACK");
          respond(response, 403, { success: false, error: "Trade creation permission required on the initiator account" });
          return;
        }
        const counterparty = await client.query(
          `SELECT a.id
           FROM accounts a
           WHERE a.id = $1 AND a.status = 'active'
             AND EXISTS (
               SELECT 1 FROM account_members am
               INNER JOIN users u ON u.id = am.user_id AND u.status = 'active' AND u.email_verified = TRUE
               INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
               INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
               INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
               WHERE am.account_id = a.id AND am.status = 'active'
                 AND p.permission_key = 'account.trade.read'
             )
           LIMIT 1`,
          [counterpartyAccountId],
        );
        if (!counterparty.rowCount) {
          await client.query("ROLLBACK");
          respond(response, 409, { success: false, error: "Counterparty account is not ready to receive trade deals" });
          return;
        }

        const inserted = await client.query(
          `INSERT INTO trade_deals
             (initiator_account_id, counterparty_account_id, created_by_user_id,
              title, description, currency, proposed_amount, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, status, title, currency, proposed_amount::text AS "proposedAmount"`,
          [initiatorAccountId, counterpartyAccountId, userId, title, description || null,
            currency, amount ?? null, expiresAt ?? null],
        );
        const deal = inserted.rows[0];

        for (const item of items) {
          if (typeof item !== "object" || item === null ||
              typeof item.title !== "string" || item.title.trim().length < 1 ||
              item.title.trim().length > 180 ||
              typeof item.quantity !== "number" || !Number.isFinite(item.quantity) || item.quantity <= 0 ||
              typeof item.unitPrice !== "number" || !validAmount(item.unitPrice)) {
            await client.query("ROLLBACK");
            respond(response, 400, { success: false, error: "Invalid trade deal line item" });
            return;
          }
          const itemCurrency = typeof item.currency === "string" ? item.currency.toUpperCase() : currency;
          if (itemCurrency !== currency) {
            await client.query("ROLLBACK");
            respond(response, 400, { success: false, error: "All line items must use the deal currency" });
            return;
          }
          await client.query(
            `INSERT INTO trade_deal_items (deal_id, title, description, sku, quantity, unit_price, currency)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [deal.id, item.title.trim(), typeof item.description === "string" ? item.description.trim().slice(0, 2000) : null,
              typeof item.sku === "string" ? item.sku.trim().slice(0, 120) : null,
              item.quantity, item.unitPrice, currency],
          );
        }

        if (items.length) {
          const total = await client.query(
            `SELECT SUM(quantity * unit_price)::numeric(14,2)::text AS total
             FROM trade_deal_items WHERE deal_id = $1`,
            [deal.id],
          );
          await client.query(
            `UPDATE trade_deals SET proposed_amount = $2, updated_at = NOW() WHERE id = $1`,
            [deal.id, total.rows[0].total],
          );
          deal.proposedAmount = total.rows[0].total;
        }

        await client.query(
          `INSERT INTO trade_deal_events (deal_id, actor_user_id, actor_account_id, event_type, to_status, body, terms)
           VALUES ($1, $2, $3, 'created', 'draft', $4, $5::jsonb)`,
          [deal.id, userId, initiatorAccountId, "Draft created",
            JSON.stringify({ title, currency, proposedAmount: deal.proposedAmount, itemCount: items.length })],
        );
        await client.query(
          `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, metadata)
           VALUES ($1, 'trade.deal.created', 'trade_deal', $2, $3, $4::jsonb)`,
          [userId, deal.id, initiatorAccountId, JSON.stringify({ counterpartyAccountId, title })],
        );
        await client.query("COMMIT");
        respond(response, 201, { success: true, deal });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return;
    }

    if (!dealId) {
      respond(response, 404, { success: false, error: "Trade route not found" });
      return;
    }
    if (!isUuid(dealId)) {
      respond(response, 400, { success: false, error: "Invalid trade deal ID" });
      return;
    }

    if (request.method === "GET") {
      const deal = await db.query(
        `SELECT d.*, ia.display_name AS initiator_name, ca.display_name AS counterparty_name
         FROM trade_deals d
         INNER JOIN accounts ia ON ia.id = d.initiator_account_id
         INNER JOIN accounts ca ON ca.id = d.counterparty_account_id
         WHERE d.id = $1 AND (d.status <> 'draft' OR EXISTS (
           SELECT 1 FROM account_members draft_member
           INNER JOIN roles draft_role ON draft_role.id = draft_member.role_id AND draft_role.scope_type = draft_member.role_scope
           INNER JOIN role_permissions draft_rp ON draft_rp.role_id = draft_role.id AND draft_rp.scope_type = draft_role.scope_type
           INNER JOIN permissions draft_permission ON draft_permission.id = draft_rp.permission_id AND draft_permission.scope_type = draft_rp.scope_type
           WHERE draft_member.user_id = $2 AND draft_member.status = 'active'
             AND draft_member.account_id = d.initiator_account_id
             AND draft_permission.permission_key = 'account.trade.read'
         )) AND EXISTS (
           SELECT 1 FROM account_members am
           INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
           INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
           INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
           WHERE am.user_id = $2 AND am.status = 'active'
             AND am.account_id IN (d.initiator_account_id, d.counterparty_account_id)
             AND p.permission_key = 'account.trade.read'
         )
         LIMIT 1`,
        [dealId, userId],
      );
      if (!deal.rowCount) {
        respond(response, 404, { success: false, error: "Trade deal not found" });
        return;
      }
      const [items, events] = await Promise.all([
        db.query(`SELECT id, title, description, sku, quantity::text AS quantity, unit_price::text AS "unitPrice", currency FROM trade_deal_items WHERE deal_id = $1 ORDER BY created_at`, [dealId]),
        db.query(`SELECT id, actor_user_id AS "actorUserId", actor_account_id AS "actorAccountId", event_type AS "eventType", from_status AS "fromStatus", to_status AS "toStatus", body, terms, created_at AS "createdAt" FROM trade_deal_events WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 100`, [dealId]),
      ]);
      respond(response, 200, { success: true, deal: deal.rows[0], items: items.rows, events: events.rows });
      return;
    }

    const body = await readBody(request);
    const action = body.action as TradeAction;
    const actorAccountId = body.accountId;
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
    const nextAmount = body.proposedAmount;

    if (!isUuid(actorAccountId) ||
        !["propose", "counter", "accept", "decline", "cancel", "complete"].includes(action)) {
      respond(response, 400, { success: false, error: "Invalid trade action" });
      return;
    }
    if (action === "counter" && nextAmount !== undefined && !validAmount(nextAmount)) {
      respond(response, 400, { success: false, error: "Counter amount must be a valid non-negative number" });
      return;
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT * FROM trade_deals
         WHERE id = $1 AND (status <> 'draft' OR EXISTS (
           SELECT 1 FROM account_members draft_member
           INNER JOIN roles draft_role ON draft_role.id = draft_member.role_id AND draft_role.scope_type = draft_member.role_scope
           INNER JOIN role_permissions draft_rp ON draft_rp.role_id = draft_role.id AND draft_rp.scope_type = draft_role.scope_type
           INNER JOIN permissions draft_permission ON draft_permission.id = draft_rp.permission_id AND draft_permission.scope_type = draft_rp.scope_type
           WHERE draft_member.user_id = $2 AND draft_member.status = 'active'
             AND draft_member.account_id = trade_deals.initiator_account_id
             AND draft_permission.permission_key = 'account.trade.read'
         )) AND EXISTS (
           SELECT 1 FROM account_members am
           INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
           INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
           INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
           WHERE am.user_id = $2 AND am.status = 'active'
             AND am.account_id IN (trade_deals.initiator_account_id, trade_deals.counterparty_account_id)
             AND p.permission_key = 'account.trade.read'
         )
         FOR UPDATE`,
        [dealId, userId],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        respond(response, 404, { success: false, error: "Trade deal not found" });
        return;
      }
      const deal = current.rows[0];
      if (![deal.initiator_account_id, deal.counterparty_account_id].includes(actorAccountId)) {
        await client.query("ROLLBACK");
        respond(response, 403, { success: false, error: "Account is not a party to this deal" });
        return;
      }

      const fromStatus = deal.status as DealStatus;
      let toStatus: DealStatus = fromStatus;
      let pendingResponse: string | null = deal.pending_response_account_id;
      const eventTypeMap: Record<TradeAction, string> = {
        propose: "proposed",
        counter: "countered",
        accept: "accepted",
        decline: "declined",
        cancel: "cancelled",
        complete: "completed",
      };
      const eventType = eventTypeMap[action];
      let amount: number | null = null;

      if (action === "propose") {
        if (actorAccountId !== deal.initiator_account_id || fromStatus !== "draft" ||
            !(await hasAccountPermission(client, actorAccountId, userId, "account.trade.create"))) {
          await client.query("ROLLBACK");
          respond(response, 403, { success: false, error: "Only the authorized initiator can propose a draft deal" });
          return;
        }
        toStatus = "proposed";
        pendingResponse = deal.counterparty_account_id;
      } else if (action === "counter") {
        if ((!message && nextAmount === undefined) ||
            actorAccountId !== deal.pending_response_account_id ||
            !["proposed", "negotiating"].includes(fromStatus) ||
            !(await hasAccountPermission(client, actorAccountId, userId, "account.trade.negotiate"))) {
          await client.query("ROLLBACK");
          respond(response, 403, { success: false, error: "The pending responder must have negotiation permission to counter" });
          return;
        }
        if (nextAmount !== undefined) amount = nextAmount as number;
        toStatus = "negotiating";
        pendingResponse = actorAccountId === deal.initiator_account_id
          ? deal.counterparty_account_id
          : deal.initiator_account_id;
      } else if (action === "accept" || action === "decline") {
        if (actorAccountId !== deal.pending_response_account_id ||
            !["proposed", "negotiating"].includes(fromStatus) ||
            !(await hasAccountPermission(client, actorAccountId, userId, "account.trade.negotiate"))) {
          await client.query("ROLLBACK");
          respond(response, 403, { success: false, error: "Only the pending responder can accept or decline" });
          return;
        }
        toStatus = action === "accept" ? "accepted" : "declined";
        pendingResponse = null;
      } else if (action === "cancel") {
        if (actorAccountId !== deal.initiator_account_id ||
            !["draft", "proposed", "negotiating"].includes(fromStatus) ||
            !(await hasAccountPermission(client, actorAccountId, userId, "account.trade.update"))) {
          await client.query("ROLLBACK");
          respond(response, 403, { success: false, error: "Only the initiator can cancel an open deal" });
          return;
        }
        toStatus = "cancelled";
        pendingResponse = null;
      } else if (action === "complete") {
        if (fromStatus !== "accepted" ||
            !(await hasAccountPermission(client, actorAccountId, userId, "account.trade.update"))) {
          await client.query("ROLLBACK");
          respond(response, 403, { success: false, error: "An accepted deal and update permission are required to complete" });
          return;
        }
        toStatus = "completed";
        pendingResponse = null;
      }

      await client.query(
        `UPDATE trade_deals
         SET status = $2, pending_response_account_id = $3,
             proposed_amount = CASE WHEN $4::numeric IS NULL THEN proposed_amount ELSE $4::numeric END,
             accepted_at = CASE WHEN $2 = 'accepted' THEN NOW() ELSE accepted_at END,
             completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END,
             updated_at = NOW()
         WHERE id = $1`,
        [dealId, toStatus, pendingResponse, amount],
      );
      await client.query(
        `INSERT INTO trade_deal_events
           (deal_id, actor_user_id, actor_account_id, event_type, from_status, to_status, body, terms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [dealId, userId, actorAccountId, eventType, fromStatus, toStatus, message || null,
          JSON.stringify({ proposedAmount: amount ?? deal.proposed_amount, pendingResponseAccountId: pendingResponse })],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, metadata)
         VALUES ($1, $2, 'trade_deal', $3, $4, $5::jsonb)`,
        [userId, `trade.deal.${action}`, dealId, actorAccountId,
          JSON.stringify({ fromStatus, toStatus, pendingResponseAccountId: pendingResponse })],
      );

      const recipientAccount = actorAccountId === deal.initiator_account_id
        ? deal.counterparty_account_id
        : deal.initiator_account_id;
      const titles: Record<TradeAction, [string, string, string, string]> = {
        propose: ["عرض تجاري جديد", "New trade proposal", "أرسل لك الطرف الآخر عرضاً تجارياً للمراجعة.", "The other party sent a trade proposal for your review."],
        counter: ["تعديل على العرض التجاري", "Trade proposal updated", "وصل تعديل جديد على شروط الصفقة.", "A new counter-proposal is ready for your review."],
        accept: ["تم قبول العرض التجاري", "Trade proposal accepted", "تم قبول شروط الصفقة داخل وصلة.", "The trade terms were accepted on WASLA."],
        decline: ["تم رفض العرض التجاري", "Trade proposal declined", "تم رفض العرض التجاري داخل وصلة.", "The trade proposal was declined on WASLA."],
        cancel: ["تم إلغاء الصفقة", "Trade deal cancelled", "تم إلغاء الصفقة داخل وصلة.", "The trade deal was cancelled on WASLA."],
        complete: ["تم إتمام الصفقة", "Trade deal completed", "تم تسجيل الصفقة كمكتملة داخل وصلة.", "The trade deal was marked complete on WASLA."],
      };
      const [titleAr, titleEn, bodyAr, bodyEn] = titles[action];
      await notifyTradeParty(client, recipientAccount, dealId, titleAr, titleEn, bodyAr, bodyEn);
      await client.query("COMMIT");
      respond(response, 200, { success: true, dealId, status: toStatus, pendingResponseAccountId: pendingResponse });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA trade API error:", error);
    if (!response.headersSent) respond(response, 500, { success: false, error: "Could not process trade deal" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
