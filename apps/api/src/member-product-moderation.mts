import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

function reply(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "";
  let bytes = 0;
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 4096) throw new Error("Request body too large");
    raw += chunk.toString();
  }
  const value: unknown = JSON.parse(raw);
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Owner-only queue and decisions for member-store product publication. */
export async function handleMemberProductModeration(
  request: IncomingMessage,
  response: ServerResponse,
  productId?: string,
): Promise<void> {
  try {
    const access = await authorizePlatformPermission(request, response, "platform.manage");
    if (!access) return;
    if (!access.roleNames.includes("platform_owner")) {
      reply(response, 403, { success: false, error: "Platform owner access required" });
      return;
    }

    const pool = getDatabasePool();
    if (request.method === "GET" && !productId) {
      const result = await pool.query(
        `SELECT p.id, p.title, p.description, p.sku, p.price::text AS price,
                p.currency, p.stock_quantity AS "stockQuantity",
                p.image_url AS "imageUrl", p.created_at AS "createdAt",
                s.id AS "storeId", s.name AS "storeName", s.slug AS "storeSlug",
                a.display_name AS "businessName"
         FROM store_products p
         INNER JOIN stores s ON s.id = p.store_id AND s.status = 'active'
         INNER JOIN accounts a ON a.id = s.account_id AND a.status = 'active'
         WHERE p.status = 'draft'
         ORDER BY p.created_at ASC
         LIMIT 100`,
      );
      reply(response, 200, { success: true, products: result.rows });
      return;
    }

    if (request.method !== "POST" || !productId || !/^[0-9a-f-]{36}$/i.test(productId)) {
      reply(response, 405, { success: false, error: "Method not allowed" });
      return;
    }

    let body: Record<string, unknown> | null;
    try {
      body = await readJson(request);
    } catch {
      reply(response, 400, { success: false, error: "Invalid request body" });
      return;
    }
    if (!body || !["approve", "reject"].includes(String(body.decision))) {
      reply(response, 400, { success: false, error: "A valid moderation decision is required" });
      return;
    }
    const decision = body.decision as "approve" | "reject";
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (decision === "reject" && (note.length < 10 || note.length > 1000)) {
      reply(response, 400, { success: false, error: "A rejection reason between 10 and 1000 characters is required" });
      return;
    }
    if (decision === "approve" && note.length > 1000) {
      reply(response, 400, { success: false, error: "Review note is too long" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query(
        `SELECT p.id, p.status, p.store_id, s.status AS store_status,
                a.id AS account_id, a.status AS account_status
         FROM store_products p
         INNER JOIN stores s ON s.id = p.store_id
         INNER JOIN accounts a ON a.id = s.account_id
         WHERE p.id = $1
         FOR UPDATE OF p`,
        [productId],
      );
      if (!locked.rowCount) {
        await client.query("ROLLBACK");
        reply(response, 404, { success: false, error: "Product not found" });
        return;
      }
      const product = locked.rows[0];
      if (product.status !== "draft") {
        await client.query("ROLLBACK");
        reply(response, 409, { success: false, code: "PRODUCT_NOT_PENDING", error: "This product is no longer awaiting review" });
        return;
      }
      if (product.store_status !== "active" || product.account_status !== "active") {
        await client.query("ROLLBACK");
        reply(response, 409, { success: false, code: "STORE_NOT_ACTIVE", error: "The store or business account is not active" });
        return;
      }

      const nextStatus = decision === "approve" ? "active" : "archived";
      await client.query(
        "UPDATE store_products SET status = $2, updated_at = NOW() WHERE id = $1",
        [productId, nextStatus],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, store_id, metadata)
         VALUES ($1, $2, 'store_product', $3, $4, $5,
                 jsonb_build_object('decision', $6::text, 'previous_status', 'draft',
                                    'new_status', $7::text, 'note', $8::text))`,
        [access.userId, decision === "approve" ? "member_product.approved" : "member_product.rejected",
          productId, product.account_id, product.store_id, decision, nextStatus, note || null],
      );
      await client.query("COMMIT");
      reply(response, 200, { success: true, productId, status: nextStatus });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA member product moderation error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Member product moderation service error" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
