import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { authorizePlatformPermission } from "./platform-security.mjs";
import { getDatabasePool } from "./database.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function send(res: ServerResponse, status: number, data: Record<string, unknown>) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(data));
}
async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "", size = 0;
  for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 5000) throw new Error("too_large"); raw += chunk.toString(); }
  const value: unknown = JSON.parse(raw);
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Buyer complaint, merchant reply, buyer closure and moderator resolution. */
export async function handleMemberOrderDispute(req: IncomingMessage, res: ServerResponse, slug: string, orderId: string, action: "submit" | "respond" | "close"): Promise<void> {
  if (!uuid.test(orderId)) { send(res, 400, { success: false, error: "Invalid order id" }); return; }
  const current = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!current) { send(res, 401, { success: false, error: "Authentication required" }); return; }
  if ((action === "close" && req.method !== "PATCH") || (action !== "close" && req.method !== "POST")) { send(res, 405, { success: false, error: "Method not allowed" }); return; }
  let input: Record<string, unknown> | null;
  try { input = await readBody(req); } catch (error) { send(res, error instanceof Error && error.message === "too_large" ? 413 : 400, { success: false, error: "Invalid request body" }); return; }
  if (!input) { send(res, 400, { success: false, error: "Invalid request body" }); return; }
  const details = typeof input.details === "string" ? input.details.trim() : typeof input.response === "string" ? input.response.trim() : "";
  if (action !== "close" && (details.length < 10 || details.length > 3000)) { send(res, 400, { success: false, error: "Provide between 10 and 3000 characters" }); return; }
  const reasons = ["not_as_described", "damaged_or_defective", "missing_items", "delivery_problem", "seller_communication", "other"];
  if (action === "submit" && (typeof input.reason !== "string" || !reasons.includes(input.reason))) { send(res, 400, { success: false, error: "Choose a valid complaint reason" }); return; }
  const db = getDatabasePool(), client = await db.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT o.id, o.status AS \"orderStatus\", o.buyer_user_id AS \"buyerId\", s.id AS \"storeId\" FROM member_store_orders o JOIN stores s ON s.id=o.store_id WHERE o.id=$1 AND s.slug=$2 AND s.status='active' FOR UPDATE OF o",
      [orderId, slug],
    );
    if (!found.rowCount) { await client.query("ROLLBACK"); send(res, 404, { success: false, error: "Order not found" }); return; }
    const order = found.rows[0];
    let result;
    if (action === "submit") {
      if (order.buyerId !== current.user.id) { await client.query("ROLLBACK"); send(res, 403, { success: false, error: "Only the buyer can open a complaint" }); return; }
      if (!["accepted", "shipped", "completed"].includes(order.orderStatus)) { await client.query("ROLLBACK"); send(res, 409, { success: false, error: "Complaint is available only for accepted, shipped or completed orders" }); return; }
      result = await client.query(
        "INSERT INTO member_store_order_disputes (order_id,store_id,buyer_user_id,reason,details) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (order_id) WHERE status IN ('open','merchant_responded') DO NOTHING RETURNING id,status,created_at AS \"createdAt\"",
        [orderId, order.storeId, current.user.id, input.reason, details],
      );
      if (!result.rowCount) { await client.query("ROLLBACK"); send(res, 409, { success: false, error: "An open complaint already exists for this order" }); return; }
    } else {
      const selected = await client.query(
        "SELECT id,status,buyer_user_id AS \"buyerId\" FROM member_store_order_disputes WHERE order_id=$1 AND store_id=$2 AND status <> 'closed' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        [orderId, order.storeId],
      );
      if (!selected.rowCount) { await client.query("ROLLBACK"); send(res, 404, { success: false, error: "Complaint not found" }); return; }
      const dispute = selected.rows[0];
      if (action === "respond") {
        const membership = await client.query(
          "SELECT 1 FROM stores s WHERE s.id=$1 AND (EXISTS (SELECT 1 FROM account_members am JOIN roles r ON r.id=am.role_id AND r.scope_type=am.role_scope JOIN role_permissions rp ON rp.role_id=r.id AND rp.scope_type=r.scope_type JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type WHERE am.account_id=s.account_id AND am.user_id=$2 AND am.status='active' AND p.permission_key=ANY($3::text[])) OR EXISTS (SELECT 1 FROM store_members sm JOIN roles r ON r.id=sm.role_id AND r.scope_type=sm.role_scope JOIN role_permissions rp ON rp.role_id=r.id AND rp.scope_type=r.scope_type JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type WHERE sm.store_id=s.id AND sm.user_id=$2 AND sm.status='active' AND p.permission_key=ANY($3::text[])))",
          [order.storeId, current.user.id, ["store.order.manage", "account.order.manage"]],
        );
        if (!membership.rowCount) { await client.query("ROLLBACK"); send(res, 403, { success: false, error: "Store order management permission required" }); return; }
        if (dispute.status !== "open") { await client.query("ROLLBACK"); send(res, 409, { success: false, error: "Complaint is already answered or closed" }); return; }
        result = await client.query(
          "UPDATE member_store_order_disputes SET merchant_response=$2,merchant_user_id=$3,status='merchant_responded',merchant_responded_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id,status,updated_at AS \"updatedAt\"",
          [dispute.id, details, current.user.id],
        );
      } else {
        if (dispute.buyerId !== current.user.id) { await client.query("ROLLBACK"); send(res, 403, { success: false, error: "Only the buyer can close this complaint" }); return; }
        if (!["resolved", "dismissed"].includes(dispute.status)) { await client.query("ROLLBACK"); send(res, 409, { success: false, error: "Only a resolved or dismissed complaint can be closed" }); return; }
        result = await client.query("UPDATE member_store_order_disputes SET status='closed',closed_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id,status,updated_at AS \"updatedAt\"", [dispute.id]);
      }
    }
    await client.query(
      "INSERT INTO audit_logs (actor_user_id,action,resource_type,resource_id,metadata) VALUES ($1,$2,'member_store_order_dispute',$3,$4::jsonb)",
      [current.user.id, "order_dispute." + action, result.rows[0].id, JSON.stringify({ orderId, storeId: order.storeId })],
    );
    await client.query("COMMIT");
    send(res, action === "submit" ? 201 : 200, { success: true, dispute: result.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function handlePlatformMemberOrderDisputes(req: IncomingMessage, res: ServerResponse, id?: string): Promise<void> {
  const access = await authorizePlatformPermission(req, res, "platform.reports.manage");
  if (!access) return;
  const db = getDatabasePool();
  if (!id) {
    if (req.method !== "GET") { send(res, 405, { success: false, error: "Method not allowed" }); return; }
    const result = await db.query(
      "SELECT d.id,d.order_id AS \"orderId\",o.order_number AS \"orderNumber\",d.store_id AS \"storeId\",s.name AS \"storeName\",d.buyer_user_id AS \"buyerUserId\",d.reason,d.details,d.status,d.merchant_response AS \"merchantResponse\",d.moderator_note AS \"moderatorNote\",d.created_at AS \"createdAt\",d.merchant_responded_at AS \"merchantRespondedAt\" FROM member_store_order_disputes d JOIN member_store_orders o ON o.id=d.order_id JOIN stores s ON s.id=d.store_id WHERE d.status IN ('open','merchant_responded') ORDER BY d.created_at ASC LIMIT 100",
    );
    send(res, 200, { success: true, disputes: result.rows }); return;
  }
  if (!uuid.test(id) || req.method !== "PATCH") { send(res, req.method !== "PATCH" ? 405 : 400, { success: false, error: "Invalid dispute request" }); return; }
  let input: Record<string, unknown> | null;
  try { input = await readBody(req); } catch { send(res, 400, { success: false, error: "Invalid request body" }); return; }
  if (!input || !["resolved", "dismissed"].includes(String(input.status)) || typeof input.note !== "string" || input.note.trim().length < 5 || input.note.trim().length > 1500) { send(res, 400, { success: false, error: "Choose resolved or dismissed and provide a 5–1500 character moderator note" }); return; }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query("SELECT id,status FROM member_store_order_disputes WHERE id=$1 FOR UPDATE", [id]);
    if (!selected.rowCount || !["open", "merchant_responded"].includes(selected.rows[0].status)) { await client.query("ROLLBACK"); send(res, selected.rowCount ? 409 : 404, { success: false, error: selected.rowCount ? "Complaint is no longer open" : "Complaint not found" }); return; }
    const result = await client.query(
      "UPDATE member_store_order_disputes SET status=$2,moderator_user_id=$3,moderator_note=$4,resolved_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id,status,moderator_note AS \"moderatorNote\",resolved_at AS \"resolvedAt\"",
      [id, input.status, access.userId, input.note.trim()],
    );
    await client.query(
      "INSERT INTO audit_logs (actor_user_id,action,resource_type,resource_id,metadata) VALUES ($1,$2,'member_store_order_dispute',$3,$4::jsonb)",
      [access.userId, "order_dispute." + input.status, id, JSON.stringify({ note: input.note.trim() })],
    );
    await client.query("COMMIT");
    send(res, 200, { success: true, dispute: result.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
