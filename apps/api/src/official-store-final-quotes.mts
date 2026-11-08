import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });
  response.end(JSON.stringify(data));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk.toString();
    if (Buffer.byteLength(raw) > 8000) throw new Error("BODY_TOO_LARGE");
  }
  const parsed: unknown = JSON.parse(raw || "{}");
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown> : null;
}

function validAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 100000000;
}

function validCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

/** Owner issues a time-limited, customer-facing quote only after supplier reconfirmation. */
export async function handleOfficialStoreFinalQuoteIssue(
  request: IncomingMessage, response: ServerResponse, orderId?: string,
): Promise<void> {
  if (request.method !== "POST") { reply(response, 405, { success: false, error: "Method not allowed" }); return; }
  if (!orderId || !UUID.test(orderId)) { reply(response, 400, { success: false, error: "Invalid order identifier" }); return; }
  const access = await authorizePlatformPermission(request, response, "platform.manage");
  if (!access) return;

  let body: Record<string, unknown> | null;
  try { body = await readBody(request); }
  catch (error) {
    reply(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400,
      { success: false, error: "Invalid JSON body" }); return;
  }
  const amount = body?.amount;
  const currency = body?.currency;
  const minDays = body?.shippingDaysMin;
  const maxDays = body?.shippingDaysMax;
  const validityHours = body?.validityHours ?? 48;
  const note = typeof body?.customerNote === "string" ? body.customerNote.trim() : "";
  if (!validAmount(amount) || !validCurrency(currency) ||
      !Number.isInteger(minDays) || Number(minDays) < 0 || Number(minDays) > 365 ||
      !Number.isInteger(maxDays) || Number(maxDays) < Number(minDays) || Number(maxDays) > 365 ||
      !Number.isInteger(validityHours) || Number(validityHours) < 1 || Number(validityHours) > 336 ||
      note.length > 1000) {
    reply(response, 400, { success: false, error: "Provide a valid final amount, ISO currency, delivery estimate and validity from 1 to 336 hours" }); return;
  }

  const db = getDatabasePool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT id, customer_user_id AS "customerUserId", supplier_confirmation_status AS "supplierStatus",
              order_status AS "orderStatus", final_quote_status AS "quoteStatus"
       FROM official_store_orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = current.rows[0];
    if (!order) { await client.query("ROLLBACK"); reply(response, 404, { success: false, error: "Order not found" }); return; }
    if (order.supplierStatus !== "accepted" || order.orderStatus !== "supplier_confirmed") {
      await client.query("ROLLBACK"); reply(response, 409, { success: false, error: "Supplier must be reconfirmed before a final quote can be issued" }); return;
    }
    if (order.quoteStatus === "accepted") {
      await client.query("ROLLBACK"); reply(response, 409, { success: false, error: "Customer already accepted this quote; create a new request for changes" }); return;
    }
    const expiresAt = new Date(Date.now() + Number(validityHours) * 3600000);
    const updated = await client.query(
      `UPDATE official_store_orders
       SET final_quote_amount = $2, final_quote_currency = $3,
           final_quote_shipping_days_min = $4, final_quote_shipping_days_max = $5,
           final_quote_expires_at = $6, final_quote_status = 'pending_customer',
           owner_review_required = TRUE, updated_at = NOW()
       WHERE id = $1
       RETURNING id, order_number AS "orderNumber", final_quote_amount::text AS "amount",
                 final_quote_currency AS "currency", final_quote_shipping_days_min AS "shippingDaysMin",
                 final_quote_shipping_days_max AS "shippingDaysMax", final_quote_expires_at AS "expiresAt",
                 final_quote_status AS "status"`,
      [orderId, amount.toFixed(2), currency, minDays, maxDays, expiresAt]);
    await client.query(
      `INSERT INTO official_store_order_events (order_id, actor_type, actor_user_id, event_type, details)
       VALUES ($1, 'human', $2, 'final_quote_issued', $3::jsonb)`,
      [orderId, access.userId, JSON.stringify({ amount: amount.toFixed(2), currency, shippingDaysMin: minDays,
        shippingDaysMax: maxDays, expiresAt: expiresAt.toISOString(), customerNote: note,
        paymentEnabled: false, supplierPurchasePlaced: false })]);
    await client.query(
      `INSERT INTO notifications (user_id, type, title_ar, title_en, body_ar, body_en, action_url, resource_id, metadata)
       VALUES ($1, 'official_store_order', 'عرض سعر نهائي جديد', 'A new final quote is ready',
         'أعدت WASLA عرض السعر النهائي ومدة التوصيل. راجع التفاصيل قبل انتهاء الصلاحية.',
         'WASLA prepared a final price and delivery estimate. Review it before it expires.',
         '/account/orders', $2, $3::jsonb)`,
      [order.customerUserId, orderId, JSON.stringify({ orderId, quoteStatus: "pending_customer", paymentEnabled: false })]);
    await client.query("COMMIT");
    reply(response, 200, { success: true, quote: updated.rows[0], paymentEnabled: false });
  } catch (error) {
    await client.query("ROLLBACK"); throw error;
  } finally { client.release(); }
}

/** Customer may accept or reject their own unexpired quote; acceptance never initiates payment. */
export async function handleOfficialStoreFinalQuoteDecision(
  request: IncomingMessage, response: ServerResponse, orderId?: string,
): Promise<void> {
  if (request.method !== "PATCH") { reply(response, 405, { success: false, error: "Method not allowed" }); return; }
  if (!orderId || !UUID.test(orderId)) { reply(response, 400, { success: false, error: "Invalid order identifier" }); return; }
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) { reply(response, 401, { success: false, error: "Sign in to respond to this quote" }); return; }
  let body: Record<string, unknown> | null;
  try { body = await readBody(request); }
  catch (error) {
    reply(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400,
      { success: false, error: "Invalid JSON body" }); return;
  }
  const decision = body?.decision;
  if (decision !== "accepted" && decision !== "rejected") {
    reply(response, 400, { success: false, error: "Choose accepted or rejected" }); return;
  }
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT id, customer_user_id, final_quote_status, final_quote_expires_at
       FROM official_store_orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = current.rows[0];
    if (!order || order.customer_user_id !== session.user.id) {
      await client.query("ROLLBACK"); reply(response, 404, { success: false, error: "Quote not found" }); return;
    }
    if (order.final_quote_status !== "pending_customer") {
      await client.query("ROLLBACK"); reply(response, 409, { success: false, error: "This quote is no longer awaiting a response" }); return;
    }
    if (!order.final_quote_expires_at || new Date(order.final_quote_expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE official_store_orders SET final_quote_status = 'expired', updated_at = NOW() WHERE id = $1`, [orderId]);
      await client.query("COMMIT");
      reply(response, 409, { success: false, error: "This quote has expired; ask WASLA for a refreshed quote" }); return;
    }
    await client.query(
      `UPDATE official_store_orders
       SET final_quote_status = $2,
           order_status = CASE WHEN $2 = 'rejected' THEN 'cancelled' ELSE order_status END,
           updated_at = NOW()
       WHERE id = $1`, [orderId, decision]);
    await client.query(
      `INSERT INTO official_store_order_events (order_id, actor_type, actor_user_id, event_type, details)
       VALUES ($1, 'customer', $2, $3, $4::jsonb)`,
      [orderId, session.user.id, `final_quote_${decision}`,
        JSON.stringify({ decision, paymentEnabled: false, supplierPurchasePlaced: false })]);
    await client.query("COMMIT");
    reply(response, 200, { success: true, decision, paymentEnabled: false,
      message: decision === "accepted"
        ? "Quote accepted. No payment was taken and no supplier purchase was placed; checkout is not enabled."
        : "Quote declined. No payment was taken and no supplier purchase was placed." });
  } catch (error) {
    await client.query("ROLLBACK"); throw error;
  } finally { client.release(); }
}
