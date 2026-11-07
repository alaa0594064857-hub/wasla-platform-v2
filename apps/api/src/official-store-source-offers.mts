import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = ["draft", "needs_review", "approved", "paused", "rejected", "expired"] as const;
const AVAILABILITY = ["available", "limited", "unavailable", "needs_confirmation", "expired"] as const;

export function shouldRequireOfferReReview(
  currentStatus: string,
  body: Record<string, unknown>,
): boolean {
  if (currentStatus !== "approved" || body.offerStatus !== undefined) return false;
  return [
    "supplierPrice", "quoteValidUntil", "availabilityStatus",
    "supplierIdentityVerified", "specificationsVerified", "directToCustomerConfirmed",
  ].some((key) => Object.hasOwn(body, key));
}

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

function httpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

function validPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= 0 && value <= 1_000_000_000 && Math.round(value * 100) === value * 100;
}

/** Private owner-only source-offer management. Offers never enter the public catalogue response. */
export async function handleOfficialStoreSourceOffersRequest(
  request: IncomingMessage,
  response: ServerResponse,
  offerId?: string,
): Promise<void> {
  try {
    const access = await authorizePlatformPermission(request, response, "platform.manage");
    if (!access) return;
    const db = getDatabasePool();

    if (request.method === "GET" && !offerId) {
      const result = await db.query(
        `SELECT o.id, o.product_id, o.sourcing_candidate_id, o.source_platform,
                o.source_product_url, o.supplier_name, o.supplier_reference,
                o.variant_attributes, o.supplier_price::text AS supplier_price,
                o.supplier_currency, o.shipping_cost::text AS shipping_cost,
                o.shipping_currency, o.minimum_order_quantity, o.ships_to_countries,
                o.direct_to_customer_confirmed, o.availability_status,
                o.estimated_shipping_days_min, o.estimated_shipping_days_max,
                o.quote_valid_until, o.last_verified_at, o.supplier_identity_verified,
                o.specifications_verified, o.evidence, o.offer_status,
                o.created_at, o.updated_at, p.title_ar, p.title_en
         FROM official_store_product_source_offers o
         INNER JOIN official_store_products p ON p.id = o.product_id
         ORDER BY o.updated_at DESC LIMIT 500`,
      );
      reply(response, 200, { success: true, offers: result.rows });
      return;
    }

    if (request.method === "POST" && !offerId) {
      let body: Record<string, unknown> | null;
      try { body = await readBody(request); }
      catch (error) {
        reply(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400,
          { success: false, error: "Invalid request body" }); return;
      }
      if (!body) { reply(response, 400, { success: false, error: "A JSON object is required" }); return; }
      const productId = body.productId;
      const supplierName = typeof body.supplierName === "string" ? body.supplierName.trim() : "";
      const platform = typeof body.sourcePlatform === "string" ? body.sourcePlatform.trim() : "";
      const currency = body.supplierCurrency;
      if (typeof productId !== "string" || !UUID.test(productId) ||
          !supplierName || supplierName.length > 180 ||
          !platform || platform.length > 80 ||
          !httpsUrl(body.sourceProductUrl) ||
          !validPrice(body.supplierPrice) ||
          typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
        reply(response, 400, { success: false, error: "Product, supplier, HTTPS source URL, valid price and ISO currency are required" }); return;
      }
      if (body.shippingCost !== undefined && body.shippingCost !== null && !validPrice(body.shippingCost)) {
        reply(response, 400, { success: false, error: "Invalid shipping cost" }); return;
      }
      if (body.minimumOrderQuantity !== undefined && body.minimumOrderQuantity !== null &&
          (!Number.isInteger(body.minimumOrderQuantity) || Number(body.minimumOrderQuantity) < 1 || Number(body.minimumOrderQuantity) > 100000)) {
        reply(response, 400, { success: false, error: "Invalid minimum order quantity" }); return;
      }
      if (body.variantAttributes !== undefined &&
          (!body.variantAttributes || typeof body.variantAttributes !== "object" || Array.isArray(body.variantAttributes) ||
           JSON.stringify(body.variantAttributes).length > 8000)) {
        reply(response, 400, { success: false, error: "Invalid variant attributes" }); return;
      }
      if (body.shipsToCountries !== undefined &&
          (!Array.isArray(body.shipsToCountries) || body.shipsToCountries.length > 100 ||
           body.shipsToCountries.some(x => typeof x !== "string" || !/^[A-Z]{2}$/.test(x)))) {
        reply(response, 400, { success: false, error: "Shipping countries must be ISO country codes" }); return;
      }
      if (body.evidence !== undefined &&
          (!Array.isArray(body.evidence) || body.evidence.length > 20 ||
           body.evidence.some(item => !item || typeof item !== "object" || Array.isArray(item) ||
             !["supplier_evidence_url", "product_specification", "availability_confirmation", "shipping_quote"].includes(String((item as Record<string, unknown>).type)) ||
             !httpsUrl((item as Record<string, unknown>).url)))) {
        reply(response, 400, { success: false, error: "Evidence must contain supported HTTPS proof URLs" }); return;
      }
      if (body.quoteValidUntil !== undefined && body.quoteValidUntil !== null &&
          (typeof body.quoteValidUntil !== "string" || !Number.isFinite(Date.parse(body.quoteValidUntil)))) {
        reply(response, 400, { success: false, error: "Invalid supplier quote expiry" }); return;
      }
      const product = await db.query("SELECT id FROM official_store_products WHERE id = $1", [productId]);
      if (!product.rows.length) { reply(response, 404, { success: false, error: "WASLA product not found" }); return; }
      const candidateId = body.sourcingCandidateId === undefined || body.sourcingCandidateId === null || body.sourcingCandidateId === "" ? null : body.sourcingCandidateId;
      if (candidateId !== null && (typeof candidateId !== "string" || !UUID.test(candidateId))) { reply(response, 400, { success: false, error: "Invalid sourcing candidate reference" }); return; }

      const client = await db.connect();
      try {
        await client.query("BEGIN");
        if (candidateId) {
          const candidate = await client.query(
            "SELECT supplier_name, source_platform, source_product_url, proposed_price::text AS proposed_price, currency, review_status FROM official_store_sourcing_candidates WHERE id = $1 FOR UPDATE",
            [candidateId],
          );
          if (!candidate.rows.length) {
            await client.query("ROLLBACK");
            reply(response, 404, { success: false, error: "Sourcing candidate not found" });
            return;
          }
          const c = candidate.rows[0];
          if (["rejected", "converted"].includes(c.review_status) || c.supplier_name !== supplierName ||
              c.source_platform !== platform || c.source_product_url !== body.sourceProductUrl ||
              (c.currency && c.currency !== currency) ||
              (c.proposed_price !== null && Number(c.proposed_price) !== Number(body.supplierPrice))) {
            await client.query("ROLLBACK");
            reply(response, 409, { success: false, error: "Offer details do not match the selected sourcing candidate" });
            return;
          }
        }
        const inserted = await client.query(
          "INSERT INTO official_store_product_source_offers " +
          "(product_id, sourcing_candidate_id, source_platform, source_product_url, supplier_name, " +
          "supplier_reference, variant_attributes, supplier_price, supplier_currency, " +
          "shipping_cost, shipping_currency, minimum_order_quantity, ships_to_countries, " +
          "direct_to_customer_confirmed, availability_status, quote_valid_until, offer_status, evidence) " +
          "VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,'needs_review',$17::jsonb) " +
          "RETURNING id, product_id, sourcing_candidate_id, source_platform, source_product_url, supplier_name, " +
          "supplier_price::text AS supplier_price, supplier_currency, offer_status, created_at",
          [productId, candidateId, platform, body.sourceProductUrl, supplierName,
           typeof body.supplierReference === "string" ? body.supplierReference.slice(0,180) : null,
           JSON.stringify(body.variantAttributes ?? {}), body.supplierPrice, currency,
           body.shippingCost ?? null,
           typeof body.shippingCurrency === "string" && /^[A-Z]{3}$/.test(body.shippingCurrency) ? body.shippingCurrency : null,
           body.minimumOrderQuantity ?? null, JSON.stringify(body.shipsToCountries ?? []),
           body.directToCustomerConfirmed === true,
           AVAILABILITY.includes(body.availabilityStatus as typeof AVAILABILITY[number]) ? body.availabilityStatus : "needs_confirmation",
           body.quoteValidUntil ?? null,
           JSON.stringify(Array.isArray(body.evidence) ? body.evidence.slice(0,20) : [])],
        );
        if (candidateId) {
          await client.query(
            "UPDATE official_store_sourcing_candidates SET review_status = 'converted', reviewed_by_user_id = $1, reviewed_at = NOW(), updated_at = NOW() WHERE id = $2",
            [access.userId, candidateId],
          );
        }
        await client.query("COMMIT");
        reply(response, 201, { success: true, offer: inserted.rows[0], note: candidateId ? "Candidate linked to a private source offer. No public listing or purchase was created." : undefined });
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { /* transaction may already be closed */ }
        if ((error as { code?: string })?.code === "23505") {
          reply(response, 409, { success: false, error: "This source listing is already linked to a WASLA product" }); return;
        }
        throw error;
      } finally {
        client.release();
      }
      return;
    }

    if (request.method === "PATCH" && offerId && UUID.test(offerId)) {
      let body: Record<string, unknown> | null;
      try { body = await readBody(request); }
      catch (error) {
        reply(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400,
          { success: false, error: "Invalid request body" }); return;
      }
      if (!body) { reply(response, 400, { success: false, error: "A JSON object is required" }); return; }

      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query(
          `SELECT id, product_id, offer_status, supplier_identity_verified, specifications_verified,
                  direct_to_customer_confirmed, minimum_order_quantity,
                  availability_status, quote_valid_until, evidence
           FROM official_store_product_source_offers WHERE id = $1 FOR UPDATE`,
          [offerId],
        );
        if (!current.rows.length) {
          await client.query("ROLLBACK");
          reply(response, 404, { success: false, error: "Source offer not found" }); return;
        }
        const row = current.rows[0] as {
          product_id: string; offer_status: string; supplier_identity_verified: boolean; specifications_verified: boolean;
          direct_to_customer_confirmed: boolean; minimum_order_quantity: number | null;
          availability_status: string; quote_valid_until: Date | string | null; evidence: unknown;
        };
        const updates: string[] = [];
        const params: unknown[] = [];
        const add = (column: string, value: unknown) => { params.push(value); updates.push(`${column} = $${params.length}`); };

        if (body.offerStatus !== undefined && !STATUSES.includes(body.offerStatus as typeof STATUSES[number])) {
          await client.query("ROLLBACK");
          reply(response, 400, { success: false, error: "Invalid offer status" }); return;
        }
        if (body.availabilityStatus !== undefined && !AVAILABILITY.includes(body.availabilityStatus as typeof AVAILABILITY[number])) {
          await client.query("ROLLBACK");
          reply(response, 400, { success: false, error: "Invalid availability status" }); return;
        }
        if (body.offerStatus === "approved") {
          const identity = Object.hasOwn(body, "supplierIdentityVerified") ? body.supplierIdentityVerified === true : row.supplier_identity_verified;
          const specs = Object.hasOwn(body, "specificationsVerified") ? body.specificationsVerified === true : row.specifications_verified;
          const dropship = Object.hasOwn(body, "directToCustomerConfirmed") ? body.directToCustomerConfirmed === true : row.direct_to_customer_confirmed;
          const availability = Object.hasOwn(body, "availabilityStatus") ? String(body.availabilityStatus) : row.availability_status;
          const expiry = Object.hasOwn(body, "quoteValidUntil") ? body.quoteValidUntil : row.quote_valid_until;
          const evidence = Array.isArray(row.evidence) ? row.evidence : [];
          const hasSupplierProof = evidence.some(item => item && typeof item === "object" && (item as Record<string, unknown>).type === "supplier_evidence_url");
          const hasSpecificationProof = evidence.some(item => item && typeof item === "object" && (item as Record<string, unknown>).type === "product_specification");
          if (!identity || !specs || !hasSupplierProof || !hasSpecificationProof || !dropship ||
              row.minimum_order_quantity === null || row.minimum_order_quantity > 1 ||
              !["available", "limited"].includes(availability) || !expiry ||
              !Number.isFinite(Date.parse(String(expiry))) || Date.parse(String(expiry)) <= Date.now() ||
              evidence.length === 0) {
            await client.query("ROLLBACK");
            reply(response, 409, { success: false, error: "Offer approval requires verified supplier identity and specifications, supplier and product proof, confirmed single-unit direct shipping, MOQ of 1 or less, current quote and available stock" }); return;
          }
          add("last_verified_at", new Date().toISOString());
        }
        if (shouldRequireOfferReReview(row.offer_status, body)) {
          add("offer_status", "needs_review");
        } else if (Object.hasOwn(body, "offerStatus")) {
          add("offer_status", body.offerStatus);
        }
        if (Object.hasOwn(body, "availabilityStatus")) add("availability_status", body.availabilityStatus);
        for (const [key, column] of [["supplierIdentityVerified","supplier_identity_verified"],["specificationsVerified","specifications_verified"],["directToCustomerConfirmed","direct_to_customer_confirmed"]] as const) {
          if (Object.hasOwn(body, key)) {
            if (typeof body[key] !== "boolean") {
              await client.query("ROLLBACK");
              reply(response, 400, { success: false, error: `Invalid ${key}` }); return;
            }
            add(column, body[key]);
          }
        }
        if (Object.hasOwn(body, "supplierPrice")) {
          if (!validPrice(body.supplierPrice)) {
            await client.query("ROLLBACK");
            reply(response, 400, { success: false, error: "Invalid supplier price" }); return;
          }
          add("supplier_price", body.supplierPrice);
        }
        if (Object.hasOwn(body, "quoteValidUntil")) {
          const expiry = body.quoteValidUntil;
          if (expiry !== null && (typeof expiry !== "string" || !Number.isFinite(Date.parse(expiry)))) {
            await client.query("ROLLBACK");
            reply(response, 400, { success: false, error: "Invalid quote expiry" }); return;
          }
          add("quote_valid_until", expiry);
        }
        if (!updates.length) {
          await client.query("ROLLBACK");
          reply(response, 400, { success: false, error: "No supported offer fields supplied" }); return;
        }
        params.push(offerId);
        const result = await client.query(
          `UPDATE official_store_product_source_offers SET ${updates.join(", ")}, updated_at = NOW()
           WHERE id = $${params.length}
           RETURNING id, product_id, offer_status, availability_status, supplier_price::text AS supplier_price, updated_at`,
          params,
        );
        await client.query(
          `INSERT INTO official_store_activity_log (product_id, actor_type, actor_user_id, action, details)
           VALUES ($1, 'human', $2, 'source_offer_updated', $3::jsonb)`,
          [row.product_id, access.userId, JSON.stringify({ offerId, changedFields: updates.map(x => x.split(" = ")[0]) })],
        );
        await client.query("COMMIT");
        reply(response, 200, { success: true, offer: result.rows[0] });
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { /* transaction may already be closed */ }
        throw error;
      } finally {
        client.release();
      }
      return;
    }

    reply(response, 405, { success: false, error: "Method not allowed" });
  } catch (error) {
    console.error("WASLA official store source offers error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Source offer service error" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
