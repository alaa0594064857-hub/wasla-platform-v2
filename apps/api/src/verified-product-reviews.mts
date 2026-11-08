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
    if (size > 8_000) throw new Error("Request body too large");
    body += chunk.toString();
  }
  return JSON.parse(body);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reviews are public only after moderation; creation requires the buyer's completed order line. */
export async function handleVerifiedProductReviewsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  productId: string,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }

  const db = getDatabasePool();
  if (request.method === "GET") {
    const product = await db.query(
      `SELECT p.id
       FROM store_products p
       INNER JOIN stores s ON s.id = p.store_id AND s.status = 'active'
       WHERE p.id = $1 AND p.status = 'active'
       LIMIT 1`,
      [productId],
    );
    if (!product.rowCount) {
      respond(response, 404, { success: false, error: "Product not found" });
      return;
    }
    const [reviews, summary] = await Promise.all([
      db.query(
        `SELECT r.id, r.rating, r.title, r.body, r.created_at AS "createdAt",
                'Verified buyer' AS "buyerLabel"
         FROM verified_product_reviews r
         WHERE r.product_id = $1 AND r.status = 'published'
         ORDER BY r.created_at DESC
         LIMIT 50`,
        [productId],
      ),
      db.query(
        `SELECT COUNT(*)::int AS count, COALESCE(ROUND(AVG(rating)::numeric, 2), 0)::text AS average
         FROM verified_product_reviews
         WHERE product_id = $1 AND status = 'published'`,
        [productId],
      ),
    ]);
    respond(response, 200, { success: true, summary: summary.rows[0], reviews: reviews.rows });
    return;
  }

  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) {
    respond(response, 401, { success: false, error: "Authentication required" });
    return;
  }

  let body: unknown;
  try {
    body = await readBody(request);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "Request body too large";
    respond(response, tooLarge ? 413 : 400, {
      success: false,
      error: tooLarge ? "Request body too large" : "Invalid request body",
    });
    return;
  }
  if (!isObject(body) || !Number.isInteger(body.rating) ||
      (body.rating as number) < 1 || (body.rating as number) > 5 ||
      typeof body.body !== "string" || body.body.trim().length < 10 ||
      body.body.trim().length > 2000 ||
      (body.title !== undefined &&
        (typeof body.title !== "string" || body.title.trim().length > 120))) {
    respond(response, 400, { success: false, error: "Provide a rating from 1 to 5 and a review between 10 and 2000 characters" });
    return;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const eligible = await client.query(
      `SELECT o.id AS "orderId", o.store_id AS "storeId"
       FROM member_store_orders o
       INNER JOIN store_products p ON p.id = $1 AND p.store_id = o.store_id
       WHERE o.buyer_user_id = $2 AND o.status = 'completed'
         AND o.items @> jsonb_build_array(jsonb_build_object('productId', p.id::text))
       ORDER BY o.delivery_confirmed_at DESC NULLS LAST, o.updated_at DESC
       LIMIT 1
       FOR UPDATE OF o`,
      [productId, session.user.id],
    );
    if (!eligible.rowCount) {
      await client.query("ROLLBACK");
      respond(response, 403, { success: false, error: "A completed purchase of this product is required to review it" });
      return;
    }
    const inserted = await client.query(
      `INSERT INTO verified_product_reviews
         (order_id, product_id, store_id, buyer_user_id, rating, title, body)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (order_id, product_id) DO NOTHING
       RETURNING id, rating, title, body, status, created_at AS "createdAt"`,
      [eligible.rows[0].orderId, productId, eligible.rows[0].storeId, session.user.id,
        body.rating, typeof body.title === "string" ? body.title.trim() || null : null, body.body.trim()],
    );
    if (!inserted.rowCount) {
      await client.query("ROLLBACK");
      respond(response, 409, { success: false, error: "A review has already been submitted for this purchase" });
      return;
    }
    await client.query("COMMIT");
    respond(response, 201, {
      success: true,
      review: inserted.rows[0],
      message: "Your verified-purchase review was submitted for moderation",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}


/** Buyers may edit their own review; every prior version is retained and edits return to moderation. */
export async function handleVerifiedProductReviewEditRequest(
  request: IncomingMessage,
  response: ServerResponse,
  productId: string,
  reviewId: string,
): Promise<void> {
  if (request.method !== "PATCH") {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reviewId)) {
    respond(response, 400, { success: false, error: "A valid review id is required" });
    return;
  }
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) {
    respond(response, 401, { success: false, error: "Authentication required" });
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
  if (!isObject(body) || !Number.isInteger(body.rating) ||
      (body.rating as number) < 1 || (body.rating as number) > 5 ||
      typeof body.body !== "string" || body.body.trim().length < 10 ||
      body.body.trim().length > 2000 ||
      (body.title !== undefined &&
        (typeof body.title !== "string" || body.title.trim().length > 120))) {
    respond(response, 400, { success: false, error: "Provide a rating from 1 to 5 and a review between 10 and 2000 characters" });
    return;
  }

  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT id, buyer_user_id AS "buyerUserId", rating, title, body, status
       FROM verified_product_reviews
       WHERE id = $1 AND product_id = $2
       FOR UPDATE`,
      [reviewId, productId],
    );
    if (!existing.rowCount || existing.rows[0].buyerUserId !== session.user.id) {
      await client.query("ROLLBACK");
      respond(response, 404, { success: false, error: "Review not found" });
      return;
    }
    if (!["pending_moderation", "published"].includes(existing.rows[0].status)) {
      await client.query("ROLLBACK");
      respond(response, 409, { success: false, error: "This review can no longer be edited" });
      return;
    }
    await client.query(
      `INSERT INTO verified_product_review_edits
         (review_id, editor_user_id, previous_rating, previous_title, previous_body, previous_status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [reviewId, session.user.id, existing.rows[0].rating, existing.rows[0].title,
        existing.rows[0].body, existing.rows[0].status],
    );
    const updated = await client.query(
      `UPDATE verified_product_reviews
       SET rating = $3, title = $4, body = $5, status = 'pending_moderation',
           moderated_by = NULL, moderation_note = NULL, moderated_at = NULL, updated_at = NOW()
       WHERE id = $1 AND product_id = $2
       RETURNING id, rating, title, body, status, updated_at AS "updatedAt"`,
      [reviewId, productId, body.rating,
        typeof body.title === "string" ? body.title.trim() || null : null, body.body.trim()],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, 'review.edited', 'verified_product_review', $2, $3::jsonb)`,
      [session.user.id, reviewId, JSON.stringify({ previousStatus: existing.rows[0].status, newStatus: "pending_moderation" })],
    );
    await client.query("COMMIT");
    respond(response, 200, {
      success: true, review: updated.rows[0],
      message: "Your changes were saved and returned to moderation",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
