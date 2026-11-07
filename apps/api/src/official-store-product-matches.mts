import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk.toString();
    if (raw.length > 16000) throw new Error("BODY_TOO_LARGE");
  }
  const value: unknown = JSON.parse(raw || "{}");
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function clean(value: unknown, max = 180): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().slice(0, max) : "";
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("en").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function similarity(a: string, b: string): number {
  const left = new Set(normalize(a).split(" ").filter(x => x.length > 1));
  const right = new Set(normalize(b).split(" ").filter(x => x.length > 1));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap++;
  return overlap / Math.max(left.size, right.size);
}

/** Owner-only deterministic candidate matching. It never merges or publishes automatically. */
export async function handleOfficialStoreProductMatchesRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const access = await authorizePlatformPermission(request, response, "platform.manage");
    if (!access) return;
    if (request.method !== "POST") {
      reply(response, 405, { success: false, error: "Method not allowed" }); return;
    }
    let body: Record<string, unknown> | null;
    try { body = await readBody(request); }
    catch (error) {
      reply(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400,
        { success: false, error: "Invalid JSON body" }); return;
    }
    if (!body) { reply(response, 400, { success: false, error: "A JSON object is required" }); return; }

    const title = clean(body.title, 240);
    const brand = clean(body.brand);
    const model = clean(body.model);
    const gtin = clean(body.gtin, 14);
    const mpn = clean(body.mpn, 80);
    const attributes = body.attributes && typeof body.attributes === "object" && !Array.isArray(body.attributes)
      ? body.attributes as Record<string, unknown> : {};
    if (!title || title.length < 3 || (!gtin && !model && !brand && title.length < 8)) {
      reply(response, 400, { success: false, error: "Provide a product title and preferably GTIN, brand or model" }); return;
    }
    if (gtin && !/^[0-9]{8,14}$/.test(gtin)) {
      reply(response, 400, { success: false, error: "GTIN must contain 8 to 14 digits" }); return;
    }
    const db = getDatabasePool();
    if (body.saveIdentity === true) {
      const productId = clean(body.productId, 36);
      if (!UUID.test(productId)) {
        reply(response, 400, { success: false, error: "A valid WASLA product ID is required" }); return;
      }
      const saved = await db.query(
        `INSERT INTO official_store_product_identity
           (product_id, brand, model, gtin, mpn, normalized_title, key_attributes, updated_at)
         SELECT id, $2, $3, $4, $5, $6, $7::jsonb, NOW()
         FROM official_store_products WHERE id = $1
         ON CONFLICT (product_id) DO UPDATE SET
           brand = EXCLUDED.brand, model = EXCLUDED.model, gtin = EXCLUDED.gtin,
           mpn = EXCLUDED.mpn, normalized_title = EXCLUDED.normalized_title,
           key_attributes = EXCLUDED.key_attributes, updated_at = NOW()
         RETURNING product_id`,
        [productId, brand || null, model || null, gtin || null, mpn || null,
         normalize(title), JSON.stringify(attributes)],
      );
      if (!saved.rows.length) { reply(response, 404, { success: false, error: "WASLA product not found" }); return; }
      reply(response, 200, { success: true, productId, identitySaved: true });
      return;
    }
    const result = await db.query(
      `SELECT p.id, p.title_ar, p.title_en, p.description_en, p.image_url,
              i.brand, i.model, i.gtin, i.mpn, i.normalized_title, i.key_attributes
       FROM official_store_products p
       LEFT JOIN official_store_product_identity i ON i.product_id = p.id
       WHERE p.status <> 'archived'
       ORDER BY p.updated_at DESC LIMIT 1000`,
    );

    const matches = result.rows.map((row: Record<string, unknown>) => {
      const existingGtin = typeof row.gtin === "string" ? row.gtin : "";
      const existingBrand = typeof row.brand === "string" ? row.brand : "";
      const existingModel = typeof row.model === "string" ? row.model : "";
      const existingMpn = typeof row.mpn === "string" ? row.mpn : "";
      const existingTitle = typeof row.normalized_title === "string" && row.normalized_title
        ? row.normalized_title : [row.title_en, row.title_ar].filter(Boolean).join(" ");
      let score = Math.round(similarity(title, existingTitle) * 65);
      const reasons: string[] = [];
      if (gtin && existingGtin && gtin === existingGtin) { score = 100; reasons.push("exact_gtin"); }
      else {
        if (brand && existingBrand && normalize(brand) === normalize(existingBrand)) { score += 15; reasons.push("same_brand"); }
        if (model && existingModel && normalize(model) === normalize(existingModel)) { score += 25; reasons.push("same_model"); }
        if (mpn && existingMpn && normalize(mpn) === normalize(existingMpn)) { score += 30; reasons.push("same_mpn"); }
      }
      const incomingAttrs = Object.entries(attributes).slice(0, 20);
      const existingAttrs = row.key_attributes && typeof row.key_attributes === "object"
        ? row.key_attributes as Record<string, unknown> : {};
      let comparable = 0; let equal = 0;
      for (const [key, value] of incomingAttrs) {
        if (typeof value === "string" && typeof existingAttrs[key] === "string") {
          comparable++; if (normalize(value) === normalize(existingAttrs[key] as string)) equal++;
        }
      }
      if (comparable) {
        score += Math.round((equal / comparable) * 15);
        if (equal === comparable) reasons.push("matching_attributes");
      }
      return {
        productId: row.id, titleAr: row.title_ar, titleEn: row.title_en,
        imageUrl: row.image_url, brand: existingBrand || null, model: existingModel || null,
        gtin: existingGtin || null, score: Math.min(100, score), reasons,
      };
    }).filter((item: { score: number }) => item.score >= 25)
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .slice(0, 10);

    reply(response, 200, {
      success: true,
      candidate: { title, brand: brand || null, model: model || null, gtin: gtin || null, mpn: mpn || null },
      matches,
      decision: matches[0]?.score >= 90 ? "likely_same_product" :
        matches[0]?.score >= 65 ? "manual_review_recommended" : "no_confident_match",
      automaticMerge: false,
      note: "Matching is a recommendation only. Human approval is required before combining product records or publishing imported content.",
    });
  } catch (error) {
    console.error("WASLA official store product matching error:", error);
    if (!response.headersSent && (error as { code?: string })?.code === "23505") reply(response, 409, { success: false, error: "This GTIN is already assigned to another WASLA product" });
    else if (!response.headersSent) reply(response, 500, { success: false, error: "Product matching service error" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
