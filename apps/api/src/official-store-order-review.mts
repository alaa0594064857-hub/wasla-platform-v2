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
    if (raw.length > 8000) throw new Error("BODY_TOO_LARGE");
  }
  const value: unknown = JSON.parse(raw || "{}");
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function validEvidenceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

/**
 * Owner records a manual supplier re-confirmation after checking the supplier.
 * This never collects payment or places a supplier purchase.
 */
export async function handleOfficialStoreOrderSupplierReview(
  request: IncomingMessage,
  response: ServerResponse,
  orderId?: string,
): Promise<void> {
  if (request.method !== "PATCH") {
    reply(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  if (!orderId || !UUID.test(orderId)) {
    reply(response, 400, { success: false, error: "Invalid order identifier" });
    return;
  }

  try {
    const access = await authorizePlatformPermission(request, response, "platform.manage");
    if (!access) return;

    let body: Record<string, unknown> | null;
    try { body = await readBody(request); }
    catch (error) {
      reply(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400,
        { success: false, error: "Invalid request body" });
      return;
    }
    const decision = body?.decision;
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    const evidenceUrl = body?.evidenceUrl === undefined || body.evidenceUrl === null || body.evidenceUrl === ""
      ? null : body.evidenceUrl;
    if (!["accepted", "rejected", "expired"].includes(String(decision)) ||
        note.length < 10 || note.length > 1000 ||
        (evidenceUrl !== null && !validEvidenceUrl(evidenceUrl)) ||
        (decision === "accepted" && !validEvidenceUrl(evidenceUrl))) {
      reply(response, 400, {
        success: false,
        error: "Choose a valid supplier decision and provide a review note; acceptance also requires an HTTPS evidence URL",
      });
      return;
    }

    const db = getDatabasePool();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const orderResult = await client.query(
        `SELECT o.id, o.customer_user_id AS "customerUserId",
                o.product_id AS "productId",
                o.supplier_confirmation_status AS "supplierConfirmationStatus",
                o.order_status AS "orderStatus",
                o.source_platform AS "sourcePlatform",
                o.supplier_name_snapshot AS "supplierName",
                o.supplier_unit_cost::text AS "supplierUnitCost",
                o.supplier_shipping_cost::text AS "supplierShippingCost",
                o.supplier_cost_currency AS "supplierCostCurrency",
                o.supplier_shipping_currency AS "supplierShippingCurrency",
                o.shipping_address->>'country' AS "destinationCountry",
                (
                  SELECT e.details->>'sourceOfferId'
                  FROM official_store_order_events e
                  WHERE e.order_id = o.id AND e.event_type = 'supplier_confirmation_requested'
                  ORDER BY e.created_at DESC LIMIT 1
                ) AS "sourceOfferId"
         FROM official_store_orders o
         WHERE o.id = $1
         FOR UPDATE OF o`,
        [orderId],
      );
      const order = orderResult.rows[0];
      if (!order) {
        await client.query("ROLLBACK");
        reply(response, 404, { success: false, error: "Order request not found" });
        return;
      }
      if (order.supplierConfirmationStatus !== "pending" || order.orderStatus !== "awaiting_supplier") {
        await client.query("ROLLBACK");
        reply(response, 409, { success: false, error: "This supplier request has already been reviewed" });
        return;
      }
      if (decision === "accepted") {
        if (!order.sourceOfferId || !order.productId || !order.destinationCountry) {
          await client.query("ROLLBACK");
          reply(response, 409, { success: false, error: "The original verified supplier offer could not be identified" });
          return;
        }
        const offerResult = await client.query(
          `SELECT id, source_platform AS "sourcePlatform",
                  supplier_name AS "supplierName",
                  supplier_price::text AS "supplierUnitCost",
                  supplier_currency AS "supplierCostCurrency",
                  shipping_cost::text AS "supplierShippingCost",
                  shipping_currency AS "supplierShippingCurrency",
                  ships_to_countries AS "shipsToCountries"
           FROM official_store_product_source_offers
           WHERE id = $1 AND product_id = $2
             AND offer_status = 'approved'
             AND availability_status IN ('available', 'limited')
             AND direct_to_customer_confirmed = TRUE
             AND supplier_identity_verified = TRUE
             AND specifications_verified = TRUE
             AND minimum_order_quantity = 1
             AND shipping_cost IS NOT NULL
             AND shipping_currency IS NOT NULL
             AND estimated_shipping_days_min IS NOT NULL
             AND estimated_shipping_days_max IS NOT NULL
             AND quote_valid_until > NOW()
             AND last_verified_at IS NOT NULL
           LIMIT 1`,
          [order.sourceOfferId, order.productId],
        );
        const offer = offerResult.rows[0];
        const destinations = Array.isArray(offer?.shipsToCountries) ? offer.shipsToCountries : [];
        const sameQuote = offer &&
          offer.sourcePlatform === order.sourcePlatform &&
          offer.supplierName === order.supplierName &&
          offer.supplierUnitCost === order.supplierUnitCost &&
          offer.supplierShippingCost === order.supplierShippingCost &&
          offer.supplierCostCurrency === order.supplierCostCurrency &&
          offer.supplierShippingCurrency === order.supplierShippingCurrency &&
          destinations.some((country: unknown) =>
            typeof country === "string" && country.toLowerCase() === String(order.destinationCountry).toLowerCase());
        if (!sameQuote) {
          await client.query("ROLLBACK");
          reply(response, 409, {
            success: false,
            error: "The original supplier offer, price or destination coverage changed or expired. Do not confirm this request; obtain renewed customer approval first.",
          });
          return;
        }
      }

      const nextOrderStatus = decision === "accepted" ? "supplier_confirmed" : "cancelled";
      const updated = await client.query(
        `UPDATE official_store_orders
         SET supplier_confirmation_status = $2,
             order_status = $3,
             owner_review_required = TRUE,
             updated_at = NOW()
         WHERE id = $1 AND supplier_confirmation_status = 'pending'
         RETURNING id, order_number AS "orderNumber",
                   supplier_confirmation_status AS "supplierConfirmationStatus",
                   order_status AS "orderStatus",
                   payment_status AS "paymentStatus",
                   supplier_purchase_status AS "supplierPurchaseStatus",
                   owner_review_required AS "ownerReviewRequired"`,
        [orderId, decision, nextOrderStatus],
      );
      if (!updated.rowCount) {
        await client.query("ROLLBACK");
        reply(response, 409, { success: false, error: "This supplier request changed while it was being reviewed" });
        return;
      }
      await client.query(
        `INSERT INTO official_store_order_events (order_id, actor_type, actor_user_id, event_type, details)
         VALUES ($1,'human',$2,$3,$4::jsonb)`,
        [orderId, access.userId, `supplier_confirmation_${decision}`, JSON.stringify({
          decision, note, evidenceUrl,
          sourceOfferId: order.sourceOfferId,
          paymentEnabled: false,
          paymentStatus: "not_enabled",
          supplierPurchasePlaced: false,
        })],
      );
      await client.query(
        `INSERT INTO notifications (
           user_id, type, title_ar, title_en, body_ar, body_en,
           action_url, resource_id, metadata
         )
         VALUES ($1,'official_store_order',$2,$3,$4,$5,'/account/orders',$6,$7::jsonb)`,
        [
          order.customerUserId,
          decision === "accepted" ? "تم تأكيد توفر المنتج" : "تعذر تأكيد توفر المنتج",
          decision === "accepted" ? "Supplier availability confirmed" : "Supplier availability could not be confirmed",
          decision === "accepted"
            ? "أكد المورد توفر المنتج مبدئياً. الدفع لم يُفعّل ولم يتم شراء المنتج."
            : "لم يتمكن المورد من تأكيد توفر المنتج. أُغلق الطلب دون دفع أو شراء.",
          decision === "accepted"
            ? "The supplier confirmed availability for review. Payment is still disabled and no purchase was placed."
            : "The supplier could not confirm availability. The request was closed without payment or purchase.",
          orderId,
          JSON.stringify({ orderId, supplierConfirmationStatus: decision, paymentEnabled: false }),
        ],
      );
      await client.query("COMMIT");
      reply(response, 200, {
        success: true,
        order: updated.rows[0],
        message: decision === "accepted"
          ? "Supplier availability was manually confirmed. A final customer quote is still required; payment remains disabled and no supplier purchase was placed."
          : "Supplier availability was not confirmed. The request was closed without payment or supplier purchase.",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA official store supplier review error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Could not review supplier confirmation" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
