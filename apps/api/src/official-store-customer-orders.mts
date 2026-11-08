import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";
import { ensurePriceApprovalTables } from "./official-store-pricing.mjs";

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
  const parsed: unknown = JSON.parse(raw || "{}");
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown> : null;
}

/**
 * Customer request for an owner-reviewed supplier confirmation.
 * This is not checkout, a paid order, or an instruction to purchase from a supplier.
 */
export async function handleOfficialStoreCustomerOrdersRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST" && request.method !== "GET") {
    reply(response, 405, { success: false, error: "Method not allowed" });
    return;
  }

  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      reply(response, 401, { success: false, error: "Sign in to request supplier confirmation" });
      return;
    }
    const db = getDatabasePool();

    if (request.method === "GET") {
      const result = await db.query(
        `SELECT id, order_number AS "orderNumber",
                product_title_snapshot AS "productTitle", quantity,
                unit_price::text AS "unitPrice", currency,
                order_status AS "orderStatus",
                supplier_confirmation_status AS "supplierConfirmationStatus",
                payment_status AS "paymentStatus",
                shipping_status AS "shippingStatus",
                shipping_address->>'country' AS "destinationCountry",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM official_store_orders
         WHERE customer_user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [session.user.id],
      );
      reply(response, 200, { success: true, requests: result.rows });
      return;
    }

    let body: Record<string, unknown> | null;
    try { body = await readBody(request); }
    catch (error) {
      reply(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400,
        { success: false, error: "Invalid request body" });
      return;
    }
    if (!body || typeof body.productId !== "string" || !UUID.test(body.productId) ||
        typeof body.destinationCountry !== "string" ||
        body.destinationCountry.trim().length < 2 || body.destinationCountry.trim().length > 100 ||
        body.confirmed !== true ||
        (body.customerNote !== undefined && body.customerNote !== null &&
          (typeof body.customerNote !== "string" || body.customerNote.length > 1000))) {
      reply(response, 400, { success: false, error: "Confirm the request and provide a valid product and delivery destination" });
      return;
    }

    const destinationCountry = body.destinationCountry.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(destinationCountry)) {
      reply(response, 400, { success: false, error: "Use a two-letter destination country code" }); return;
    }
    await ensurePriceApprovalTables();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const offerResult = await client.query(
        `SELECT p.id AS "productId", p.title_ar AS "titleAr", p.title_en AS "titleEn",
                approval.customer_price::text AS "unitPrice", approval.currency,
                o.id AS "sourceOfferId", o.source_platform AS "sourcePlatform",
                o.supplier_name AS "supplierName",
                o.supplier_price::text AS "supplierUnitCost",
                o.supplier_currency AS "supplierCostCurrency",
                o.shipping_cost::text AS "supplierShippingCost",
                o.shipping_currency AS "supplierShippingCurrency",
                o.ships_to_countries AS "shipsToCountries"
         FROM official_store_products p
         INNER JOIN official_store_settings s ON s.singleton_id = TRUE AND s.status = 'active'
         INNER JOIN official_store_price_approvals approval
           ON approval.product_id = p.id
          AND approval.destination_country = $2
          AND approval.status = 'active'
         INNER JOIN LATERAL (
           SELECT o.*
           FROM official_store_product_source_offers o
           WHERE o.id = approval.offer_id AND o.product_id = p.id
             AND o.offer_status = 'approved'
             AND o.availability_status IN ('available', 'limited')
             AND o.direct_to_customer_confirmed = TRUE
             AND o.supplier_identity_verified = TRUE
             AND o.specifications_verified = TRUE
             AND o.minimum_order_quantity = 1
             AND o.shipping_cost IS NOT NULL
             AND o.shipping_currency IS NOT NULL
             AND CASE WHEN jsonb_typeof(o.ships_to_countries) = 'array'
                      THEN jsonb_array_length(o.ships_to_countries) > 0 ELSE FALSE END
             AND o.estimated_shipping_days_min IS NOT NULL
             AND o.estimated_shipping_days_max IS NOT NULL
             AND o.quote_valid_until > NOW()
             AND o.last_verified_at IS NOT NULL
           ORDER BY o.last_verified_at DESC, o.updated_at DESC
           LIMIT 1
         ) o ON TRUE
         WHERE p.id = $1 AND p.status = 'published'
           AND p.availability_status IN ('available', 'limited')
         FOR SHARE OF p`,
        [body.productId, destinationCountry],
      );
      const offer = offerResult.rows[0];
      if (!offer) {
        await client.query("ROLLBACK");
        reply(response, 409, { success: false, error: "This product no longer has a verified supplier offer. Please contact WASLA for assistance." });
        return;
      }
      const destinations = Array.isArray(offer.shipsToCountries) ? offer.shipsToCountries : [];
      if (!destinations.some((item: unknown) => typeof item === "string" && item.toLowerCase() === destinationCountry.toLowerCase())) {
        await client.query("ROLLBACK");
        reply(response, 400, { success: false, error: "The selected destination is not covered by the current supplier offer" });
        return;
      }

      const orderNumber = `WS-${Date.now()}-${randomBytes(3).toString("hex").toUpperCase()}`;
      const title = String(offer.titleEn || offer.titleAr).slice(0, 360);
      const inserted = await client.query(
        `INSERT INTO official_store_orders (
           order_number, customer_user_id, product_id, product_title_snapshot,
           quantity, unit_price, currency, supplier_name_snapshot,
           supplier_confirmation_status, order_status, payment_status,
           shipping_address, customer_note, owner_review_required,
           source_platform, supplier_purchase_status, supplier_unit_cost,
           supplier_shipping_cost, supplier_cost_currency, supplier_shipping_currency
         )
         VALUES ($1,$2,$3,$4,1,$5,$6,$7,'pending','awaiting_supplier','not_enabled',
                 $8::jsonb,$9,TRUE,$10,'not_placed',$11,$12,$13,$14)
         RETURNING id, order_number AS "orderNumber",
                   product_title_snapshot AS "productTitle",
                   unit_price::text AS "unitPrice", currency,
                   order_status AS "orderStatus",
                   supplier_confirmation_status AS "supplierConfirmationStatus",
                   payment_status AS "paymentStatus",
                   created_at AS "createdAt"`,
        [
          orderNumber, session.user.id, offer.productId, title, offer.unitPrice,
          offer.currency, offer.supplierName,
          JSON.stringify({ country: destinationCountry }),
          typeof body.customerNote === "string" ? body.customerNote.trim() || null : null,
          offer.sourcePlatform, offer.supplierUnitCost, offer.supplierShippingCost,
          offer.supplierCostCurrency, offer.supplierShippingCurrency,
        ],
      );
      const order = inserted.rows[0];
      await client.query(
        `INSERT INTO official_store_order_events (order_id, actor_type, actor_user_id, event_type, details)
         VALUES ($1,'customer',$2,'supplier_confirmation_requested',$3::jsonb)`,
        [order.id, session.user.id, JSON.stringify({
          sourceOfferId: offer.sourceOfferId,
          destinationCountry,
          customerConfirmedRequest: true,
          paymentEnabled: false,
          supplierPurchasePlaced: false,
        })],
      );
      await client.query("COMMIT");
      reply(response, 201, {
        success: true,
        request: order,
        message: "Your request was recorded for supplier and owner review. No payment was taken and no supplier purchase was placed.",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA official store customer request error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Could not process the official store request" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
