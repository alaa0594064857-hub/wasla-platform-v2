import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

function respond(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  let body = "";
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 12_000) throw new Error("Request body too large");
    body += chunk.toString();
  }
  return JSON.parse(body);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Private, seller-scoped product inquiry inbox, deliberately separate from direct messages. */
export async function ensureProductInquiryTables(): Promise<void> {
  const db = getDatabasePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS product_inquiries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
      store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body varchar(3000) NOT NULL CHECK (length(body) BETWEEN 5 AND 3000),
      status varchar(16) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'replied', 'closed')),
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS product_inquiries_recipient_created_idx ON product_inquiries (recipient_user_id, status, created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS product_inquiries_sender_created_idx ON product_inquiries (sender_user_id, created_at DESC)`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS product_inquiry_replies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      inquiry_id uuid NOT NULL REFERENCES product_inquiries(id) ON DELETE CASCADE,
      sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body varchar(3000) NOT NULL CHECK (length(body) BETWEEN 1 AND 3000),
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS product_inquiry_replies_inquiry_created_idx ON product_inquiry_replies (inquiry_id, created_at ASC)`);
}

export async function handleProductInquiriesRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") {
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
    const path = new URL(request.url || "/", "http://localhost").pathname;
    const replyMatch = path.match(/^\/api\/product-inquiries\/([0-9a-f-]{36})\/replies$/i);
    const statusMatch = path.match(/^\/api\/product-inquiries\/([0-9a-f-]{36})\/status$/i);

    if (replyMatch && request.method === "GET") {
      const access = await db.query(
        `SELECT id FROM product_inquiries
         WHERE id = $1 AND (sender_user_id = $2 OR recipient_user_id = $2)`,
        [replyMatch[1], userId],
      );
      if (!access.rowCount) {
        respond(response, 404, { success: false, error: "Inquiry not found" });
        return;
      }
      const result = await db.query(
        `SELECT r.id, r.sender_user_id AS "senderUserId",
                COALESCE(p.display_name, u.name) AS "senderName",
                r.body, r.created_at AS "createdAt"
         FROM product_inquiry_replies r
         INNER JOIN users u ON u.id = r.sender_user_id
         LEFT JOIN profiles p ON p.user_id = u.id
         WHERE r.inquiry_id = $1 ORDER BY r.created_at ASC`,
        [replyMatch[1]],
      );
      respond(response, 200, { success: true, replies: result.rows });
      return;
    }

    if (replyMatch && request.method === "POST") {
      let replyBody: unknown;
      try { replyBody = await readBody(request); }
      catch {
        respond(response, 400, { success: false, error: "Invalid request body" });
        return;
      }
      if (!isObject(replyBody) || typeof replyBody.message !== "string" ||
          replyBody.message.trim().length < 1 || replyBody.message.trim().length > 3000) {
        respond(response, 400, { success: false, error: "A reply between 1 and 3000 characters is required" });
        return;
      }
      const access = await db.query(
        `SELECT id FROM product_inquiries WHERE id = $1 AND recipient_user_id = $2 AND status <> 'closed'`,
        [replyMatch[1], userId],
      );
      if (!access.rowCount) {
        respond(response, 404, { success: false, error: "Open inquiry not found for this seller" });
        return;
      }
      const inserted = await db.query(
        `INSERT INTO product_inquiry_replies (inquiry_id, sender_user_id, body)
         VALUES ($1, $2, $3) RETURNING id, sender_user_id AS "senderUserId",
         body, created_at AS "createdAt"`,
        [replyMatch[1], userId, replyBody.message.trim()],
      );
      await db.query(
        `UPDATE product_inquiries SET status = 'replied', updated_at = NOW() WHERE id = $1`,
        [replyMatch[1]],
      );
      respond(response, 201, { success: true, reply: inserted.rows[0] });
      return;
    }

    if (statusMatch && request.method === "PATCH") {
      let statusBody: unknown;
      try { statusBody = await readBody(request); }
      catch {
        respond(response, 400, { success: false, error: "Invalid request body" });
        return;
      }
      if (!isObject(statusBody) || !["new", "replied", "closed"].includes(String(statusBody.status))) {
        respond(response, 400, { success: false, error: "A valid inquiry status is required" });
        return;
      }
      const updated = await db.query(
        `UPDATE product_inquiries SET status = $3, updated_at = NOW()
         WHERE id = $1 AND recipient_user_id = $2
         RETURNING id, status, updated_at AS "updatedAt"`,
        [statusMatch[1], userId, statusBody.status],
      );
      if (!updated.rowCount) {
        respond(response, 404, { success: false, error: "Inquiry not found for this seller" });
        return;
      }
      respond(response, 200, { success: true, inquiry: updated.rows[0] });
      return;
    }

    if (request.method === "GET") {
      const result = await db.query(
        `SELECT i.id, i.product_id AS "productId", p.title AS "productTitle",
                i.store_id AS "storeId", s.name AS "storeName",
                i.sender_user_id AS "senderUserId", COALESCE(profile.display_name, sender.name) AS "senderName",
                i.body, i.status, i.created_at AS "createdAt"
         FROM product_inquiries i
         INNER JOIN store_products p ON p.id = i.product_id
         INNER JOIN stores s ON s.id = i.store_id
         INNER JOIN users sender ON sender.id = i.sender_user_id
         LEFT JOIN profiles profile ON profile.user_id = sender.id
         WHERE i.recipient_user_id = $1
         ORDER BY i.created_at DESC
         LIMIT 100`,
        [userId],
      );
      respond(response, 200, { success: true, inquiries: result.rows });
      return;
    }

    let body: unknown;
    try { body = await readBody(request); }
    catch {
      respond(response, 400, { success: false, error: "Invalid request body" });
      return;
    }
    if (!isObject(body) || typeof body.productId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(body.productId) ||
        typeof body.message !== "string" ||
        body.message.trim().length < 5 || body.message.trim().length > 3000) {
      respond(response, 400, { success: false, error: "A valid product and a message between 5 and 3000 characters are required" });
      return;
    }

    const product = await db.query(
      `SELECT p.id AS product_id, p.store_id, s.account_id,
              COALESCE(store_owner.user_id, account_owner.user_id, account_manager.user_id) AS recipient_user_id
       FROM store_products p
       INNER JOIN stores s ON s.id = p.store_id AND s.status = 'active'
       INNER JOIN accounts a ON a.id = s.account_id AND a.status = 'active'
       LEFT JOIN LATERAL (
         SELECT sm.user_id
         FROM store_members sm
         INNER JOIN users u ON u.id = sm.user_id AND u.status = 'active' AND u.email_verified = TRUE
         INNER JOIN roles r ON r.id = sm.role_id AND r.scope_type = sm.role_scope
         WHERE sm.store_id = s.id AND sm.status = 'active' AND r.name = 'store_owner'
         ORDER BY sm.created_at ASC LIMIT 1
       ) store_owner ON TRUE
       LEFT JOIN LATERAL (
         SELECT am.user_id
         FROM account_members am
         INNER JOIN users u ON u.id = am.user_id AND u.status = 'active' AND u.email_verified = TRUE
         INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
         WHERE am.account_id = s.account_id AND am.status = 'active' AND r.name = 'account_owner'
         ORDER BY am.created_at ASC LIMIT 1
       ) account_owner ON TRUE
       LEFT JOIN LATERAL (
         SELECT am.user_id
         FROM account_members am
         INNER JOIN users u ON u.id = am.user_id AND u.status = 'active' AND u.email_verified = TRUE
         INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
         WHERE am.account_id = s.account_id AND am.status = 'active' AND r.name = 'account_manager'
         ORDER BY am.created_at ASC LIMIT 1
       ) account_manager ON TRUE
       WHERE p.id = $1 AND p.status = 'active'
       LIMIT 1`,
      [body.productId],
    );

    if (product.rowCount !== 1 || !product.rows[0].recipient_user_id) {
      respond(response, 404, { success: false, error: "Product is unavailable for inquiries" });
      return;
    }
    if (product.rows[0].recipient_user_id === userId) {
      respond(response, 400, { success: false, error: "You cannot inquire about your own product" });
      return;
    }

    const inserted = await db.query(
      `INSERT INTO product_inquiries
         (product_id, store_id, sender_user_id, recipient_user_id, body)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, product_id AS "productId", status, created_at AS "createdAt"`,
      [product.rows[0].product_id, product.rows[0].store_id, userId,
       product.rows[0].recipient_user_id, body.message.trim()],
    );
    respond(response, 201, { success: true, inquiry: inserted.rows[0] });
  } catch (error) {
    console.error("WASLA product inquiries API error:", error);
    respond(response, 500, { success: false, error: "Could not process product inquiry" });
  }
}
