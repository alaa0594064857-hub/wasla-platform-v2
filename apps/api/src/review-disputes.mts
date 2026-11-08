import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { authorizePlatformPermission } from "./platform-security.mjs";
import { getDatabasePool } from "./database.js";

function respond(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(data));
}
async function readBody(request: IncomingMessage): Promise<unknown> {
  let body = "", size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 4000) throw new Error("Request body too large");
    body += chunk.toString();
  }
  return JSON.parse(body);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Authenticated buyers can report a public review or appeal their own rejected/hidden review. */
export async function handleReviewDisputeSubmission(
  request: IncomingMessage, response: ServerResponse, reviewId: string, kind: "report" | "appeal",
): Promise<void> {
  if (request.method !== "POST") { respond(response, 405, { success: false, error: "Method not allowed" }); return; }
  if (!uuid.test(reviewId)) { respond(response, 400, { success: false, error: "Invalid review id" }); return; }
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) { respond(response, 401, { success: false, error: "Authentication required" }); return; }
  let body: unknown;
  try { body = await readBody(request); }
  catch (error) {
    const tooLarge = error instanceof Error && error.message === "Request body too large";
    respond(response, tooLarge ? 413 : 400, { success: false, error: tooLarge ? "Request body too large" : "Invalid request body" }); return;
  }
  if (!isObject(body)) { respond(response, 400, { success: false, error: "Invalid request body" }); return; }
  const db = getDatabasePool();
  if (kind === "report") {
    const reasons = ["spam","abuse","harassment","conflict_of_interest","personal_information","other"];
    if (typeof body.reason !== "string" || !reasons.includes(body.reason) ||
      (body.details !== undefined && (typeof body.details !== "string" || body.details.trim().length > 1000))) {
      respond(response, 400, { success: false, error: "Choose a report reason and optional details up to 1000 characters" }); return;
    }
    const review = await db.query("SELECT id FROM verified_product_reviews WHERE id = $1 AND status = 'published' AND buyer_user_id <> $2", [reviewId, session.user.id]);
    if (!review.rowCount) { respond(response, 404, { success: false, error: "Published review not found" }); return; }
    const inserted = await db.query(
      `INSERT INTO verified_product_review_reports (review_id, reporter_user_id, reason, details)
       VALUES ($1,$2,$3,$4) ON CONFLICT (review_id, reporter_user_id) DO NOTHING RETURNING id, status, created_at AS "createdAt"`,
      [reviewId, session.user.id, body.reason, typeof body.details === "string" ? body.details.trim() || null : null],
    );
    if (!inserted.rowCount) { respond(response, 409, { success: false, error: "You have already reported this review" }); return; }
    respond(response, 201, { success: true, report: inserted.rows[0] }); return;
  }
  if (typeof body.reason !== "string" || body.reason.trim().length < 10 || body.reason.trim().length > 1000) {
    respond(response, 400, { success: false, error: "Appeal reason must be between 10 and 1000 characters" }); return;
  }
  const review = await db.query(
    "SELECT id FROM verified_product_reviews WHERE id = $1 AND buyer_user_id = $2 AND status IN ('rejected','hidden')",
    [reviewId, session.user.id],
  );
  if (!review.rowCount) { respond(response, 404, { success: false, error: "An appeal is available only to the author of a rejected or hidden review" }); return; }
  const appeal = await db.query(
    `INSERT INTO verified_product_review_appeals (review_id, appellant_user_id, reason)
     VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id, status, created_at AS "createdAt"`,
    [reviewId, session.user.id, body.reason.trim()],
  );
  if (!appeal.rowCount) { respond(response, 409, { success: false, error: "An open appeal already exists for this review" }); return; }
  respond(response, 201, { success: true, appeal: appeal.rows[0] });
}

/** Platform staff queue for reports and appeals; no buyer or seller access. */
export async function handlePlatformReviewDisputes(
  request: IncomingMessage, response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET") { respond(response, 405, { success: false, error: "Method not allowed" }); return; }
  const access = await authorizePlatformPermission(request, response, "platform.reports.manage");
  if (!access) return;
  const db = getDatabasePool();
  const [reports, appeals] = await Promise.all([
    db.query(`SELECT d.id, d.review_id AS "reviewId", d.reason, d.details, d.status,
      d.created_at AS "createdAt", r.rating, r.title, r.body, p.title AS "productTitle"
      FROM verified_product_review_reports d
      JOIN verified_product_reviews r ON r.id = d.review_id
      JOIN store_products p ON p.id = r.product_id
      WHERE d.status = 'open' ORDER BY d.created_at ASC LIMIT 100`),
    db.query(`SELECT a.id, a.review_id AS "reviewId", a.reason, a.status,
      a.created_at AS "createdAt", r.rating, r.title, r.body, p.title AS "productTitle"
      FROM verified_product_review_appeals a
      JOIN verified_product_reviews r ON r.id = a.review_id
      JOIN store_products p ON p.id = r.product_id
      WHERE a.status = 'open' ORDER BY a.created_at ASC LIMIT 100`),
  ]);
  respond(response, 200, { success: true, reports: reports.rows, appeals: appeals.rows });
}


/** Resolve a report or appeal with an immutable audit event in the same transaction. */
export async function handlePlatformReviewDisputeDecision(
  request: IncomingMessage, response: ServerResponse, kind: "report" | "appeal", id: string,
): Promise<void> {
  if (request.method !== "PATCH") { respond(response, 405, { success: false, error: "Method not allowed" }); return; }
  if (!uuid.test(id)) { respond(response, 400, { success: false, error: "Invalid dispute id" }); return; }
  const access = await authorizePlatformPermission(request, response, "platform.reports.manage");
  if (!access) return;
  let body: unknown;
  try { body = await readBody(request); }
  catch (error) {
    const tooLarge = error instanceof Error && error.message === "Request body too large";
    respond(response, tooLarge ? 413 : 400, { success: false, error: tooLarge ? "Request body too large" : "Invalid request body" }); return;
  }
  if (!isObject(body)) { respond(response, 400, { success: false, error: "Invalid request body" }); return; }
  const allowed = kind === "report" ? ["reviewed", "dismissed", "actioned"] : ["upheld", "overturned"];
  if (typeof body.status !== "string" || !allowed.includes(body.status) ||
    (body.note !== undefined && (typeof body.note !== "string" || body.note.trim().length > 1000))) {
    respond(response, 400, { success: false, error: "Invalid dispute decision or note" }); return;
  }
  const db = getDatabasePool();
  const client = await db.connect();
  const table = kind === "report" ? "verified_product_review_reports" : "verified_product_review_appeals";
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      \`SELECT id, review_id AS "reviewId", status FROM \${table} WHERE id = $1 FOR UPDATE\`, [id],
    );
    if (!selected.rowCount || selected.rows[0].status !== "open") {
      await client.query("ROLLBACK");
      respond(response, selected.rowCount ? 409 : 404, { success: false, error: selected.rowCount ? "Dispute is already resolved" : "Dispute not found" }); return;
    }
    const decision = body.status as string;
    if (kind === "report") {
      await client.query(
        \`UPDATE verified_product_review_reports SET status = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $1\`,
        [id, decision, access.userId],
      );
      if (decision === "actioned") {
        await client.query(
          \`UPDATE verified_product_reviews SET status = 'hidden', moderated_by = $2,
           moderation_note = $3, moderated_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status = 'published'\`,
          [selected.rows[0].reviewId, access.userId,
            typeof body.note === "string" ? body.note.trim() || "Hidden after review report" : "Hidden after review report"],
        );
      }
    } else {
      await client.query(
        \`UPDATE verified_product_review_appeals SET status = $2, reviewed_by = $3,
         reviewed_at = NOW(), resolution_note = $4 WHERE id = $1\`,
        [id, decision, access.userId, typeof body.note === "string" ? body.note.trim() || null : null],
      );
      if (decision === "overturned") {
        await client.query(
          \`UPDATE verified_product_reviews SET status = 'pending_moderation', moderated_by = $2,
           moderation_note = $3, moderated_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status IN ('rejected','hidden')\`,
          [selected.rows[0].reviewId, access.userId, "Appeal accepted; returned to moderation"],
        );
      }
    }
    await client.query(
      \`INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)\`,
      [access.userId, \`review.\${kind}.\${decision}\`, \`verified_product_review_\${kind}\`, id,
        JSON.stringify({ reviewId: selected.rows[0].reviewId, note: typeof body.note === "string" ? body.note.trim() : null })],
    );
    await client.query("COMMIT");
    respond(response, 200, { success: true, dispute: { id, kind, status: decision } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
