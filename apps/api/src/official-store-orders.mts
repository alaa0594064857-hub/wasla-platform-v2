import type { IncomingMessage, ServerResponse } from "node:http";
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

/** Owner-only, read-only order desk. Payment and fulfillment actions are deliberately not exposed here. */
export async function handleOfficialStoreOrdersRequest(
  request: IncomingMessage,
  response: ServerResponse,
  orderId?: string,
): Promise<void> {
  if (request.method !== "GET") {
    reply(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  if (orderId && !UUID.test(orderId)) {
    reply(response, 400, { success: false, error: "Invalid order identifier" });
    return;
  }
  try {
    const access = await authorizePlatformPermission(request, response, "platform.manage");
    if (!access) return;
    const db = getDatabasePool();

    if (orderId) {
      const result = await db.query(
        `SELECT o.id, o.order_number AS "orderNumber",
                o.customer_user_id AS "customerUserId",
                u.email AS "customerEmail",
                o.product_id AS "productId",
                o.product_title_snapshot AS "productTitle",
                o.quantity, o.unit_price::text AS "unitPrice", o.currency,
                o.supplier_name_snapshot AS "supplierName",
                o.supplier_account_id AS "supplierAccountId",
                o.supplier_confirmation_status AS "supplierConfirmationStatus",
                o.order_status AS "orderStatus",
                o.payment_status AS "paymentStatus",
                o.payment_provider_reference AS "paymentProviderReference",
                o.shipping_carrier AS "shippingCarrier",
                o.tracking_reference AS "trackingReference",
                o.shipping_status AS "shippingStatus",
                o.shipping_address->>'country' AS "destinationCountry",
                o.shipping_address AS "shippingAddress",
                o.customer_note AS "customerNote",
                o.owner_review_required AS "ownerReviewRequired",
                o.source_platform AS "sourcePlatform",
                o.supplier_purchase_reference AS "supplierPurchaseReference",
                o.supplier_purchase_status AS "supplierPurchaseStatus",
                o.supplier_unit_cost::text AS "supplierUnitCost",
                o.supplier_shipping_cost::text AS "supplierShippingCost",
                o.supplier_cost_currency AS "supplierCostCurrency",
                o.supplier_order_url AS "supplierOrderUrl",
                o.supplier_tracking_url AS "supplierTrackingUrl",
                o.created_at AS "createdAt", o.updated_at AS "updatedAt"
         FROM official_store_orders o
         INNER JOIN users u ON u.id = o.customer_user_id
         WHERE o.id = $1
         LIMIT 1`,
        [orderId],
      );
      if (!result.rows[0]) {
        reply(response, 404, { success: false, error: "Official store order not found" });
        return;
      }
      const events = await db.query(
        `SELECT id, actor_type AS "actorType", actor_user_id AS "actorUserId",
                event_type AS "eventType", details, created_at AS "createdAt"
         FROM official_store_order_events
         WHERE order_id = $1
         ORDER BY created_at ASC
         LIMIT 250`,
        [orderId],
      );
      reply(response, 200, { success: true, order: result.rows[0], events: events.rows, readOnly: true });
      return;
    }

    const result = await db.query(
      `SELECT o.id, o.order_number AS "orderNumber",
              o.customer_user_id AS "customerUserId",
              u.email AS "customerEmail",
              o.product_title_snapshot AS "productTitle",
              o.quantity, o.unit_price::text AS "unitPrice", o.currency,
              o.supplier_name_snapshot AS "supplierName",
              o.supplier_confirmation_status AS "supplierConfirmationStatus",
              o.order_status AS "orderStatus",
              o.payment_status AS "paymentStatus",
              o.shipping_carrier AS "shippingCarrier",
              o.tracking_reference AS "trackingReference",
              o.shipping_status AS "shippingStatus",
              o.shipping_address->>'country' AS "destinationCountry",
              o.owner_review_required AS "ownerReviewRequired",
              o.supplier_purchase_status AS "supplierPurchaseStatus",
              o.created_at AS "createdAt", o.updated_at AS "updatedAt"
       FROM official_store_orders o
       INNER JOIN users u ON u.id = o.customer_user_id
       ORDER BY o.created_at DESC
       LIMIT 100`,
    );
    reply(response, 200, { success: true, orders: result.rows, readOnly: true });
  } catch (error) {
    console.error("WASLA official store order desk error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Could not load official store orders" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
