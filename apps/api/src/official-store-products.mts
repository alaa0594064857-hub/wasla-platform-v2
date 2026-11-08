import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";
import { ensurePriceApprovalTables } from "./official-store-pricing.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = [
  "titleAr", "titleEn", "descriptionAr", "descriptionEn", "price", "currency",
  "supplierName", "supplierAccountId", "supplierContactUserId",
  "supplierProductReference", "availabilityStatus", "fulfillmentNotes", "imageUrl", "status",
] as const;
type Field = typeof fields[number];
const columns: Record<Field, string> = {
  titleAr: "title_ar", titleEn: "title_en", descriptionAr: "description_ar",
  descriptionEn: "description_en", price: "price", currency: "currency",
  supplierName: "supplier_name", supplierAccountId: "supplier_account_id",
  supplierContactUserId: "supplier_contact_user_id",
  supplierProductReference: "supplier_product_reference",
  availabilityStatus: "availability_status", fulfillmentNotes: "fulfillment_notes",
  imageUrl: "image_url", status: "status",
};

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
    if (raw.length > 24000) throw new Error("BODY_TOO_LARGE");
  }
  const value: unknown = JSON.parse(raw || "{}");
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function validate(input: Record<string, unknown>, partial: boolean): string | null {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  for (const key of ["titleAr", "titleEn"]) {
    if ((!partial && !has(key)) || (has(key) && (typeof input[key] !== "string" || !String(input[key]).trim() || String(input[key]).length > 180))) return "Both Arabic and English product titles are required (max 180 characters)";
  }
  for (const key of ["descriptionAr", "descriptionEn", "fulfillmentNotes"]) {
    if (has(key) && input[key] !== null && (typeof input[key] !== "string" || String(input[key]).length > 10000)) return "Invalid product description or fulfillment notes";
  }
  if ((!partial && !has("price")) || (has("price") && (typeof input.price !== "number" || !Number.isFinite(input.price) || input.price < 0 || input.price > 1000000000 || Math.round(input.price * 100) !== input.price * 100))) return "Invalid product price";
  if (has("currency") && (typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency))) return "Currency must be a 3-letter uppercase code";
  for (const key of ["supplierName", "supplierProductReference"]) {
    if (has(key) && input[key] !== null && (typeof input[key] !== "string" || String(input[key]).length > 180)) return "Invalid supplier information";
  }
  for (const key of ["supplierAccountId", "supplierContactUserId"]) {
    if (has(key) && input[key] !== null && (typeof input[key] !== "string" || !UUID.test(input[key]))) return "Invalid supplier reference";
  }
  if (has("availabilityStatus") && !["available", "limited", "unavailable", "needs_confirmation"].includes(String(input.availabilityStatus))) return "Invalid availability status";
  if (has("status") && !["draft", "published", "archived"].includes(String(input.status))) return "Invalid product status";
  if (has("imageUrl") && input.imageUrl !== null) {
    if (typeof input.imageUrl !== "string" || input.imageUrl.length > 2000) return "Invalid product image URL";
    try { if (new URL(input.imageUrl).protocol !== "https:") return "Product image URL must use HTTPS"; }
    catch { return "Invalid product image URL"; }
  }
  return null;
}

function values(input: Record<string, unknown>, keys: readonly Field[]): unknown[] {
  return keys.map(key => input[key] === "" && ["supplierAccountId", "supplierContactUserId", "imageUrl"].includes(key) ? null : input[key]);
}

/** Owner-managed catalogue for the platform-owned WASLA Store. No inventory or payment collection. */
export async function handleOfficialStoreProductsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  productId?: string,
  publicCatalogue = false,
): Promise<void> {
  try {
    const db = getDatabasePool();
    if (publicCatalogue) {
      if (request.method !== "GET") { reply(response, 405, { success: false, error: "Method not allowed" }); return; }
      await ensurePriceApprovalTables();
      const destinationCountry = new URL(request.url || "/", "http://localhost").searchParams.get("country")?.toUpperCase();
      if (!destinationCountry || !/^[A-Z]{2}$/.test(destinationCountry)) {
        reply(response, 400, { success: false, error: "Choose a valid two-letter delivery country to view destination-specific prices" }); return;
      }
      const result = await db.query(
        `SELECT p.id, p.title_ar, p.title_en, p.description_ar, p.description_en,
                approval.customer_price::text AS price, approval.currency, p.availability_status,
                p.image_url, p.created_at,
                ARRAY[approval.destination_country] AS "deliveryCountries",
                offer.estimated_shipping_days_min AS "estimatedDeliveryDaysMin",
                offer.estimated_shipping_days_max AS "estimatedDeliveryDaysMax"
         FROM official_store_products p
         INNER JOIN official_store_settings s ON s.singleton_id = TRUE AND s.status = 'active'
         INNER JOIN official_store_price_approvals approval
           ON approval.product_id = p.id AND approval.status = 'active'
          AND approval.destination_country = $1
         INNER JOIN official_store_product_source_offers offer
           ON offer.id = approval.offer_id AND offer.product_id = p.id
          AND offer.offer_status = 'approved'
          AND offer.availability_status IN ('available', 'limited')
          AND offer.direct_to_customer_confirmed = TRUE
          AND offer.supplier_identity_verified = TRUE
          AND offer.specifications_verified = TRUE
          AND offer.minimum_order_quantity = 1
          AND offer.shipping_cost IS NOT NULL AND offer.shipping_currency IS NOT NULL
          AND offer.quote_valid_until > NOW() AND offer.last_verified_at IS NOT NULL
          AND offer.ships_to_countries @> to_jsonb(ARRAY[$1]::text[])
         WHERE p.status = 'published' AND p.availability_status IN ('available', 'limited')
         ORDER BY p.created_at DESC
         LIMIT 100`,
        [destinationCountry],
      );
      reply(response, 200, { success: true, destinationCountry, products: result.rows });
      return;
    }

    const access = await authorizePlatformPermission(request, response, "platform.manage");
    if (!access) return;

    if (request.method === "GET" && !productId) {
      const result = await db.query(
        `SELECT id, title_ar, title_en, description_ar, description_en,
                price::text AS price, currency, supplier_name, supplier_account_id,
                supplier_contact_user_id, supplier_product_reference,
                availability_status, fulfillment_notes, image_url, status,
                created_at, updated_at
         FROM official_store_products ORDER BY created_at DESC LIMIT 250`,
      );
      reply(response, 200, { success: true, products: result.rows, inventoryManagedByPlatform: false, paymentsEnabled: false });
      return;
    }

    if (request.method !== "POST" && !(request.method === "PATCH" && productId)) {
      reply(response, 405, { success: false, error: "Method not allowed" });
      return;
    }
    let body: Record<string, unknown> | null;
    try { body = await readBody(request); }
    catch (error) {
      reply(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, { success: false, error: "Invalid request body" });
      return;
    }
    if (!body) { reply(response, 400, { success: false, error: "A JSON object is required" }); return; }
    const input: Record<string, unknown> = {};
    for (const key of fields) if (Object.prototype.hasOwnProperty.call(body, key)) input[key] = body[key];
    const invalid = validate(input, request.method === "PATCH");
    if (invalid) { reply(response, 400, { success: false, error: invalid }); return; }

    const keys = fields.filter(key => Object.prototype.hasOwnProperty.call(input, key));
    if (request.method === "PATCH" && keys.length === 0) {
      reply(response, 400, { success: false, error: "No supported product fields supplied" }); return;
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      let result;
      if (request.method === "POST") {
        const insertKeys = fields.filter(key => Object.prototype.hasOwnProperty.call(input, key));
        const names = insertKeys.map(key => columns[key]);
        const placeholders = insertKeys.map((key, index) => `$${index + 1}${key === "price" ? "::numeric(12,2)" : ""}`);
        result = await client.query(
          `INSERT INTO official_store_products (${names.join(", ")})
           VALUES (${placeholders.join(", ")})
           RETURNING id, title_ar, title_en, description_ar, description_en,
                     price::text AS price, currency, supplier_name, supplier_account_id,
                     supplier_contact_user_id, supplier_product_reference,
                     availability_status, fulfillment_notes, image_url, status, created_at, updated_at`,
          values(input, insertKeys),
        );
      } else {
        const assignments = keys.map((key, index) => `${columns[key]} = $${index + 1}${key === "price" ? "::numeric(12,2)" : ""}`);
        result = await client.query(
          `UPDATE official_store_products SET ${assignments.join(", ")}, updated_at = NOW()
           WHERE id = $${keys.length + 1}
           RETURNING id, title_ar, title_en, description_ar, description_en,
                     price::text AS price, currency, supplier_name, supplier_account_id,
                     supplier_contact_user_id, supplier_product_reference,
                     availability_status, fulfillment_notes, image_url, status, created_at, updated_at`,
          [...values(input, keys), productId],
        );
        if (!result.rows[0]) {
          await client.query("ROLLBACK");
          reply(response, 404, { success: false, error: "Official store product not found" }); return;
        }
      }
      const product = result.rows[0] as { id: string; status: string };
      await client.query(
        `INSERT INTO official_store_activity_log (actor_type, actor_user_id, product_id, action, details)
         VALUES ('human', $1, $2, $3, $4::jsonb)`,
        [access.userId, product.id, request.method === "POST" ? "official_store.product.created" : "official_store.product.updated", JSON.stringify({ changed_fields: keys, status: product.status })],
      );
      await client.query("COMMIT");
      reply(response, request.method === "POST" ? 201 : 200, { success: true, product, inventoryManagedByPlatform: false, paymentsEnabled: false });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  } catch (error) {
    if ((error as { code?: string })?.code === "23503") {
      reply(response, 400, { success: false, error: "Supplier account or contact does not exist" }); return;
    }
    console.error("WASLA official store products error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Official store products service error" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
