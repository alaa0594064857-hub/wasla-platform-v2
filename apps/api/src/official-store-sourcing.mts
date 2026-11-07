import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = [
  "supplierName", "supplierWebsite", "supplierContact", "supplierProductReference",
  "proposedTitle", "proposedDescription", "proposedPrice", "currency",
  "availabilityClaim", "fulfilmentClaim", "evidence", "verificationStatus",
  "reviewStatus", "sourcePlatform", "sourceProductUrl", "supplierDropshipConfirmed",
  "minimumOrderQuantity", "shippingCountries", "shippingCost", "shippingCurrency",
  "estimatedShippingDaysMin", "estimatedShippingDaysMax", "quoteValidUntil",
  "supplierIdentityVerified", "specificationsVerified", "sampleInspected",
] as const;
type Field = typeof fields[number];
const columns: Record<Field, string> = {
  supplierName: "supplier_name", supplierWebsite: "supplier_website",
  supplierContact: "supplier_contact", supplierProductReference: "supplier_product_reference",
  proposedTitle: "proposed_title", proposedDescription: "proposed_description",
  proposedPrice: "proposed_price", currency: "currency", availabilityClaim: "availability_claim",
  fulfilmentClaim: "fulfilment_claim", evidence: "evidence",
  verificationStatus: "verification_status", reviewStatus: "review_status",
  sourcePlatform: "source_platform", sourceProductUrl: "source_product_url",
  supplierDropshipConfirmed: "supplier_dropship_confirmed",
  minimumOrderQuantity: "minimum_order_quantity", shippingCountries: "shipping_countries",
  shippingCost: "shipping_cost", shippingCurrency: "shipping_currency",
  estimatedShippingDaysMin: "estimated_shipping_days_min",
  estimatedShippingDaysMax: "estimated_shipping_days_max", quoteValidUntil: "quote_valid_until",
  supplierIdentityVerified: "supplier_identity_verified",
  specificationsVerified: "specifications_verified",
  sampleInspected: "sample_inspected",
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
    if (raw.length > 30000) throw new Error("BODY_TOO_LARGE");
  }
  const value: unknown = JSON.parse(raw || "{}");
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function isHttps(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2000) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function validate(input: Record<string, unknown>, partial: boolean): string | null {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  if ((!partial && !has("supplierName")) || (has("supplierName") &&
      (typeof input.supplierName !== "string" || !input.supplierName.trim() || input.supplierName.length > 180))) {
    return "Supplier name is required (max 180 characters)";
  }
  for (const key of ["supplierContact", "supplierProductReference", "proposedTitle", "availabilityClaim", "fulfilmentClaim", "sourcePlatform"]) {
    if (has(key) && input[key] !== null && (typeof input[key] !== "string" || input[key].length > 500)) return "Invalid supplier or product text";
  }
  if (has("proposedDescription") && input.proposedDescription !== null &&
      (typeof input.proposedDescription !== "string" || input.proposedDescription.length > 10000)) return "Invalid product description";
  for (const key of ["supplierWebsite", "sourceProductUrl"]) {
    if (has(key) && input[key] !== null && input[key] !== "" && !isHttps(input[key])) return "Supplier and source URLs must use HTTPS";
  }
  for (const key of ["proposedPrice", "shippingCost"]) {
    if (has(key) && input[key] !== null && (typeof input[key] !== "number" || !Number.isFinite(input[key]) || input[key] < 0 || input[key] > 1000000000 || Math.round(input[key] * 100) !== input[key] * 100)) return "Invalid price or shipping cost";
  }
  for (const key of ["currency", "shippingCurrency"]) {
    if (has(key) && input[key] !== null && (typeof input[key] !== "string" || !/^[A-Z]{3}$/.test(input[key]))) return "Currency must be a 3-letter uppercase code";
  }
  for (const key of ["minimumOrderQuantity", "estimatedShippingDaysMin", "estimatedShippingDaysMax"]) {
    if (has(key) && input[key] !== null && (!Number.isInteger(input[key]) || Number(input[key]) < (key === "minimumOrderQuantity" ? 1 : 0) || Number(input[key]) > 100000)) return "Invalid quantity or shipping estimate";
  }
  if (has("supplierDropshipConfirmed") && typeof input.supplierDropshipConfirmed !== "boolean") return "Invalid dropshipping confirmation";
  for (const key of ["supplierIdentityVerified", "specificationsVerified", "sampleInspected"]) {
    if (has(key) && typeof input[key] !== "boolean") return "Invalid verification flag";
  }
  if (has("shippingCountries") && (!Array.isArray(input.shippingCountries) || input.shippingCountries.length > 100 ||
      input.shippingCountries.some(value => typeof value !== "string" || !/^[A-Z]{2}$/.test(value)))) return "Shipping countries must be ISO 2-letter country codes";
  if (has("evidence") && (!Array.isArray(input.evidence) || input.evidence.length > 20 || JSON.stringify(input.evidence).length > 12000)) return "Evidence must be an array of up to 20 compact items";
  if (has("verificationStatus") && !["unverified", "awaiting_supplier", "partially_verified", "verified", "rejected"].includes(String(input.verificationStatus))) return "Invalid verification status";
  if (has("reviewStatus") && !["draft", "needs_owner_review", "approved", "rejected"].includes(String(input.reviewStatus))) return "Invalid review status";
  if (has("quoteValidUntil") && input.quoteValidUntil !== null && (typeof input.quoteValidUntil !== "string" || !Number.isFinite(Date.parse(input.quoteValidUntil)))) return "Invalid supplier quote expiry";
  if (has("estimatedShippingDaysMin") && has("estimatedShippingDaysMax") &&
      input.estimatedShippingDaysMin !== null && input.estimatedShippingDaysMax !== null &&
      Number(input.estimatedShippingDaysMax) < Number(input.estimatedShippingDaysMin)) return "Maximum shipping days cannot be below minimum";
  return null;
}

function dbValue(key: Field, value: unknown): unknown {
  if (value === "") return null;
  if (key === "evidence" || key === "shippingCountries") return JSON.stringify(value);
  return value;
}

/** Owner-only supplier sourcing review queue for the official WASLA Store. */
export async function handleOfficialStoreSourcingRequest(
  request: IncomingMessage,
  response: ServerResponse,
  candidateId?: string,
): Promise<void> {
  try {
    const access = await authorizePlatformPermission(request, response, "platform.manage");
    if (!access) return;
    const db = getDatabasePool();

    if (request.method === "GET" && !candidateId) {
      const result = await db.query(
        `SELECT id, product_id, supplier_name, supplier_website, supplier_contact,
                supplier_product_reference, proposed_title, proposed_description,
                proposed_price::text AS proposed_price, currency, availability_claim,
                fulfilment_claim, evidence, verification_status, review_status,
                reviewed_by_user_id, reviewed_at, source_platform, source_product_url,
                supplier_dropship_confirmed, minimum_order_quantity, shipping_countries,
                shipping_cost::text AS shipping_cost, shipping_currency,
                estimated_shipping_days_min, estimated_shipping_days_max, quote_valid_until,
                created_at, updated_at
         FROM official_store_sourcing_candidates
         ORDER BY CASE review_status WHEN 'needs_owner_review' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
                  created_at DESC LIMIT 250`,
      );
      reply(response, 200, { success: true, candidates: result.rows });
      return;
    }

    if (request.method !== "POST" && !(request.method === "PATCH" && candidateId)) {
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
      reply(response, 400, { success: false, error: "No supported candidate fields supplied" }); return;
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      let result;
      if (request.method === "POST" && ["approved", "rejected"].includes(String(input.reviewStatus ?? ""))) {
        await client.query("ROLLBACK");
        reply(response, 400, { success: false, error: "New sourcing candidates must be reviewed after creation" }); return;
      }
      if (request.method === "PATCH" && (input.verificationStatus === "verified" || input.reviewStatus === "approved")) {
        const current = await client.query(
          `SELECT verification_status, supplier_dropship_confirmed, minimum_order_quantity,
                  source_product_url, supplier_website, evidence, quote_valid_until,
                  proposed_price, currency, supplier_identity_verified, specifications_verified
           FROM official_store_sourcing_candidates WHERE id = $1 FOR UPDATE`,
          [candidateId],
        );
        const row = current.rows[0] as {
          verification_status: string; supplier_dropship_confirmed: boolean;
          minimum_order_quantity: number | null; source_product_url: string | null;
          supplier_website: string | null; evidence: unknown[]; quote_valid_until: Date | null;
          proposed_price: string | null; currency: string | null;
          supplier_identity_verified: boolean; specifications_verified: boolean;
        } | undefined;
        const value = (key: Field, currentValue: unknown) => input[key] === undefined ? currentValue : input[key];
        const verified = value("verificationStatus", row?.verification_status);
        const dropship = value("supplierDropshipConfirmed", row?.supplier_dropship_confirmed);
        const minimum = value("minimumOrderQuantity", row?.minimum_order_quantity);
        const evidence = value("evidence", row?.evidence);
        const quote = value("quoteValidUntil", row?.quote_valid_until);
        const supplierIdentity = value("supplierIdentityVerified", row?.supplier_identity_verified);
        const specifications = value("specificationsVerified", row?.specifications_verified);
        const price = value("proposedPrice", row?.proposed_price);
        const currency = value("currency", row?.currency);
        const sourceUrl = value("sourceProductUrl", row?.source_product_url) || value("supplierWebsite", row?.supplier_website);
        const proofItems = Array.isArray(evidence) ? evidence as Array<{ type?: string; url?: string }> : [];
        const hasSupplierProof = proofItems.some(item => item?.type === "supplier_evidence_url" && typeof item.url === "string");
        const hasSpecificationProof = proofItems.some(item => item?.type === "product_specification" && typeof item.url === "string");
        const quoteTime = quote instanceof Date ? quote.getTime() : typeof quote === "string" ? Date.parse(quote) : NaN;
        if (!row || verified !== "verified" || supplierIdentity !== true || specifications !== true || dropship !== true ||
            (minimum !== null && Number(minimum) > 1) || !sourceUrl ||
            !hasSupplierProof || !hasSpecificationProof || !Number.isFinite(quoteTime) || quoteTime <= Date.now() ||
            price === null || price === undefined || currency === null || currency === undefined) {
          await client.query("ROLLBACK");
          reply(response, 409, { success: false, error: "Verification and approval require supplier and specification evidence, verified supplier status, confirmed single-unit direct shipping, MOQ of one or less, a future-valid quote, price, currency, and a supplier or product URL" }); return;
        }
      }
      if (request.method === "POST") {
        const insertKeys = fields.filter(key => Object.prototype.hasOwnProperty.call(input, key));
        const names = insertKeys.map(key => columns[key]);
        const placeholders = insertKeys.map((key, index) =>
          `$ ${index + 1}`.replace("$ ", "$") +
          (["evidence", "shippingCountries"].includes(key) ? "::jsonb" : key === "proposedPrice" || key === "shippingCost" ? "::numeric(12,2)" : ""));
        result = await client.query(
          `INSERT INTO official_store_sourcing_candidates (${names.join(", ")})
           VALUES (${placeholders.join(", ")})
           RETURNING id, supplier_name, supplier_website, supplier_product_reference,
                     proposed_title, proposed_price::text AS proposed_price, currency,
                     verification_status, review_status, source_platform, source_product_url,
                     supplier_dropship_confirmed, minimum_order_quantity, shipping_countries,
                     shipping_cost::text AS shipping_cost, shipping_currency,
                     estimated_shipping_days_min, estimated_shipping_days_max, quote_valid_until,
                     created_at, updated_at`,
          insertKeys.map(key => dbValue(key, input[key])),
        );
      } else {
        const assignments = keys.map((key, index) =>
          `${columns[key]} = $${index + 1}` +
          (["evidence", "shippingCountries"].includes(key) ? "::jsonb" : key === "proposedPrice" || key === "shippingCost" ? "::numeric(12,2)" : ""));
        const reviewChanged = Object.prototype.hasOwnProperty.call(input, "reviewStatus");
        if (reviewChanged && ["approved", "rejected", "converted"].includes(String(input.reviewStatus))) {
          assignments.push("reviewed_by_user_id = $" + (keys.length + 1), "reviewed_at = NOW()");
        }
        result = await client.query(
          `UPDATE official_store_sourcing_candidates
           SET ${assignments.join(", ")}, updated_at = NOW()
           WHERE id = $${keys.length + (reviewChanged && ["approved", "rejected", "converted"].includes(String(input.reviewStatus)) ? 2 : 1)}
           RETURNING id, supplier_name, supplier_website, supplier_product_reference,
                     proposed_title, proposed_price::text AS proposed_price, currency,
                     verification_status, review_status, reviewed_by_user_id, reviewed_at,
                     source_platform, source_product_url, supplier_dropship_confirmed,
                     minimum_order_quantity, shipping_countries, shipping_cost::text AS shipping_cost,
                     shipping_currency, estimated_shipping_days_min, estimated_shipping_days_max,
                     quote_valid_until, created_at, updated_at`,
          [...keys.map(key => dbValue(key, input[key])),
            ...(reviewChanged && ["approved", "rejected", "converted"].includes(String(input.reviewStatus)) ? [access.userId] : []),
            candidateId],
        );
        if (!result.rows[0]) {
          await client.query("ROLLBACK");
          reply(response, 404, { success: false, error: "Sourcing candidate not found" }); return;
        }
      }
      const candidate = result.rows[0] as { id: string; review_status?: string };
      await client.query(
        `INSERT INTO official_store_activity_log (actor_type, actor_user_id, action, details)
         VALUES ('human', $1, $2, $3::jsonb)`,
        [access.userId, request.method === "POST" ? "official_store.sourcing_candidate.created" : "official_store.sourcing_candidate.updated",
          JSON.stringify({ candidate_id: candidate.id, changed_fields: keys, review_status: candidate.review_status ?? "draft" })],
      );
      await client.query("COMMIT");
      reply(response, request.method === "POST" ? 201 : 200, { success: true, candidate });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  } catch (error) {
    console.error("WASLA official store sourcing error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Official store sourcing service error" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
