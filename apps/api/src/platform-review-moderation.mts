import type { IncomingMessage, ServerResponse } from "node:http";
import { authorizePlatformPermission } from "./platform-security.mjs";
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
    if (size > 4_000) throw new Error("Request body too large");
    body += chunk.toString();
  }
  return JSON.parse(body);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Platform-only moderation queue; sellers and buyers cannot change publication state. */
export async function handlePlatformReviewModerationRequest(
  request: IncomingMessage,
  response: ServerResponse,
  reviewId?: string,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "PATCH") {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  const access = await authorizePlatformPermission(request, response, "platform.reports.manage");
  if (!access) return;
  const db = getDatabasePool();

  if (request.method === "GET") {
    if (reviewId) {
      respond(response, 405, { success: false, error: "Method not allowed" });
      return;
    }
    const url = new URL(request.url ?? "/api/platform/reviews", "http://localhost");
    const requestedStatus = url.searchParams.get("status") ?? "pending_moderation";
    if (!["pending_moderation", "published", "rejected", "hidden", "all"].includes(requestedStatus)) {
      respond(response, 400, { success: false, error: "Invalid review status filter" });
      return;
    }
    const result = await db.query(
      `SELECT r.id, r.product_id AS "productId", p.title AS "productTitle",
              r.store_id AS "storeId", s.name AS "storeName",
              r.order_id AS "orderId", r.buyer_user_id AS "buyerUserId",
              r.rating, r.title, r.body, r.status,
              r.moderation_note AS "moderationNote",
              r.moderated_at AS "moderatedAt", r.created_at AS "createdAt"
       FROM verified_product_reviews r
       INNER JOIN store_products p ON p.id = r.product_id
       INNER JOIN stores s ON s.id = r.store_id
       WHERE ($1 = 'all' OR r.status = $1)
       ORDER BY CASE WHEN r.status = 'pending_moderation' THEN 0 ELSE 1 END,
                r.created_at ASC
       LIMIT 100`,
      [requestedStatus],
    );
    respond(response, 200, { success: true, reviews: result.rows });
    return;
  }

  if (!reviewId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reviewId)) {
    respond(response, 400, { success: false, error: "A valid review id is required" });
    return;
  }
  let body: unknown;
  try {
    body = await readBody(request);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "Request body too large";
    respond(response, tooLarge ? 413 : 400, {
      success: false, error: tooLarge ? "Request body too large" : "Invalid request body",
    });
    return;
  }
  if (!isObject(body) || !["published", "rejected", "hidden"].includes(String(body.status)) ||
      (body.note !== undefined && (typeof body.note !== "string" || body.note.trim().length > 1000))) {
    respond(response, 400, { success: false, error: "Choose a valid moderation decision and an optional note up to 1000 characters" });
    return;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE verified_product_reviews
       SET status = $2, moderated_by = $3,
           moderation_note = $4, moderated_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING id, product_id AS "productId", status,
                 moderation_note AS "moderationNote", moderated_at AS "moderatedAt"`,
      [reviewId, body.status, access.userId, typeof body.note === "string" ? body.note.trim() || null : null],
    );
    if (!updated.rowCount) {
      await client.query("ROLLBACK");
      respond(response, 404, { success: false, error: "Review not found" });
      return;
    }
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, 'verified_product_review', $3, $4::jsonb)`,
      [access.userId, `review.${body.status}`, reviewId,
        JSON.stringify({ status: body.status, note: typeof body.note === "string" ? body.note.trim() : null })],
    );
    await client.query("COMMIT");
    respond(response, 200, { success: true, review: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
