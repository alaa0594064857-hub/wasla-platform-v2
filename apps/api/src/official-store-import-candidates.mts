import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

type Candidate = {
  title: string; description: string; brand: string; sku: string; barcode: string;
  price: number | null; currency: string | null; available: boolean | null;
  variant: string; imageUrls: string[];
};
const MAX_BODY = 50000;

function reply(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(data));
}
async function readBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "";
  for await (const chunk of request) { raw += chunk.toString(); if (raw.length > MAX_BODY) throw new Error("BODY_TOO_LARGE"); }
  const value: unknown = JSON.parse(raw || "{}");
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function textValue(value: unknown, max = 5000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function https(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  try { const u = new URL(value); return u.protocol === "https:" && !!u.hostname && !u.username && !u.password; } catch { return false; }
}
function imageList(value: unknown): string[] {
  let entries: unknown[] = Array.isArray(value) ? value : [];
  if (!entries.length && value && typeof value === "object") {
    const edges = (value as Record<string, unknown>).edges;
    if (Array.isArray(edges)) entries = edges.map(edge =>
      edge && typeof edge === "object" ? (edge as Record<string, unknown>).node : null
    );
  }
  return entries.slice(0, 12).map(item => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const x = item as Record<string, unknown>;
      return textValue(x.url ?? x.src, 2000);
    }
    return "";
  }).filter(https);
}
function amount(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? Math.round(n * 100) / 100 : null;
}
function adaptShopify(payload: Record<string, unknown>): Candidate[] {
  const product = (payload.product && typeof payload.product === "object" ? payload.product : payload) as Record<string, unknown>;
  const title = textValue(product.title, 240);
  if (!title) throw new Error("Product title is missing");
  const description = textValue(product.body_html ?? product.description ?? product.descriptionHtml, 5000);
  const brand = textValue(product.vendor ?? product.brand, 180);
  const images = imageList(product.images ?? product.media);
  let variants: unknown[] = Array.isArray(product.variants) ? product.variants : [];
  if (!variants.length && product.variants && typeof product.variants === "object") {
    const edges = (product.variants as Record<string, unknown>).edges;
    if (Array.isArray(edges)) variants = edges.map(edge => (edge as Record<string, unknown>)?.node);
  }
  if (!variants.length) variants = [{}];
  return variants.slice(0, 20).map((raw): Candidate => {
    const v = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const priceNode = v.price && typeof v.price === "object" ? v.price as Record<string, unknown> : {};
    const selected = Array.isArray(v.selectedOptions) ? v.selectedOptions
      .map(option => { const o = option as Record<string, unknown>; return [textValue(o.name, 80), textValue(o.value, 120)].filter(Boolean).join(": "); }).filter(Boolean).join(", ")
      : [v.option1, v.option2, v.option3].filter(x => typeof x === "string" && x.trim()).join(" / ");
    const p = amount(v.price ?? priceNode.amount);
    const currency = textValue(v.currency ?? priceNode.currencyCode ?? product.currency, 3).toUpperCase();
    const available = typeof v.available === "boolean" ? v.available :
      typeof v.availableForSale === "boolean" ? v.availableForSale : null;
    return {
      title, description, brand, sku: textValue(v.sku, 120), barcode: textValue(v.barcode, 32),
      price: p, currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
      available, variant: selected, imageUrls: images,
    };
  });
}
function adaptFeed(payload: Record<string, unknown>): Candidate[] {
  const title = textValue(payload.title ?? payload.name, 240);
  if (!title) throw new Error("Product title is missing");
  const p = amount(payload.price);
  const currency = textValue(payload.currency, 3).toUpperCase();
  return [{
    title, description: textValue(payload.description, 5000),
    brand: textValue(payload.brand ?? payload.vendor, 180),
    sku: textValue(payload.sku, 120), barcode: textValue(payload.gtin ?? payload.barcode, 32),
    price: p, currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
    available: typeof payload.available === "boolean" ? payload.available : null,
    variant: textValue(payload.variant, 240), imageUrls: imageList(payload.images),
  }];
}

/** Converts merchant-authorized catalog/feed payloads into unapproved sourcing candidates. */
export async function handleOfficialStoreImportCandidatesRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const access = await authorizePlatformPermission(request, response, "platform.manage");
    if (!access) return;
    if (request.method !== "POST") { reply(response, 405, { success: false, error: "Method not allowed" }); return; }
    let body: Record<string, unknown> | null;
    try { body = await readBody(request); } catch (error) {
      reply(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, { success: false, error: "Invalid JSON body" }); return;
    }
    if (!body) { reply(response, 400, { success: false, error: "A JSON object is required" }); return; }
    const provider = textValue(body.provider, 32).toLowerCase();
    const sourcePlatform = textValue(body.sourcePlatform, 80) || provider;
    const dataSourceId = textValue(body.dataSourceId, 64);
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (dataSourceId && !UUID.test(dataSourceId)) { reply(response, 400, { success: false, error: "Invalid registered data source" }); return; }
    if (!sourcePlatform || (!dataSourceId && sourcePlatform.toLowerCase() !== provider)) {
      reply(response, 403, { success: false, error: "A registered approved data source is required when importing from an external source platform." }); return;
    }
    const supplierName = textValue(body.supplierName, 180);
    const productUrl = body.productUrl;
    if (!supplierName || !https(productUrl) || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
      reply(response, 400, { success: false, error: "Supplier, HTTPS product URL and provider payload are required" }); return;
    }
    const supplierEvidenceUrl = body.supplierEvidenceUrl ? body.supplierEvidenceUrl : null;
    const specificationEvidenceUrl = body.specificationEvidenceUrl ? body.specificationEvidenceUrl : null;
    if ((supplierEvidenceUrl && !https(supplierEvidenceUrl)) || (specificationEvidenceUrl && !https(specificationEvidenceUrl))) {
      reply(response, 400, { success: false, error: "Evidence links must use HTTPS" }); return;
    }
    const raw = body.payload as Record<string, unknown>;
    let candidates: Candidate[];
    try {
      if (provider === "shopify") candidates = adaptShopify(raw);
      else if (provider === "merchant_feed") candidates = adaptFeed(raw);
      else { reply(response, 400, { success: false, error: "Supported providers: shopify, merchant_feed" }); return; }
    } catch (error) {
      reply(response, 422, { success: false, error: error instanceof Error ? error.message : "Invalid product payload" }); return;
    }
    const db = getDatabasePool();
    const client = await db.connect();
    const created = [];
    try {
      await client.query("BEGIN");
      if (dataSourceId) {
        const source = await client.query(
          `SELECT id FROM official_store_data_sources
           WHERE id=$1 AND created_by=$2 AND permission_status='approved'
             AND lower(provider)=lower($3)
           FOR SHARE`,
          [dataSourceId, access.userId, sourcePlatform],
        );
        if (!source.rows.length) {
          await client.query("ROLLBACK");
          reply(response, 403, { success: false, error: "The registered source is not approved for this account/provider" });
          return;
        }
      }
      for (const item of candidates) {
        const evidence = [
          { type: "source_product_url", url: productUrl, sourcePlatform, adapter: provider },
          ...(supplierEvidenceUrl ? [{ type: "supplier_evidence_url", url: supplierEvidenceUrl }] : []),
          ...(specificationEvidenceUrl ? [{ type: "product_specification", url: specificationEvidenceUrl }] : []),
          ...item.imageUrls.map(url => ({ type: "image_reference", url, rights_status: "unreviewed" })),
          ...(item.barcode ? [{ type: "gtin_candidate", value: item.barcode }] : []),
          ...(item.sku ? [{ type: "sku_candidate", value: item.sku }] : []),
        ];
        const availability = item.available === true ? "Merchant feed reports available" :
          item.available === false ? "Merchant feed reports unavailable" : "Availability not supplied";
        const result = await client.query(
          `INSERT INTO official_store_sourcing_candidates
            (supplier_name, supplier_website, supplier_product_reference, proposed_title, proposed_description,
             proposed_price, currency, availability_claim, fulfilment_claim, evidence, verification_status,
             review_status, source_platform, source_product_url, supplier_dropship_confirmed, data_source_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'unverified',
                   'needs_owner_review', $11, $12, FALSE, $13)
           RETURNING id, proposed_title, proposed_price::text AS proposed_price, currency, review_status`,
          [supplierName, new URL(productUrl).origin, item.sku || item.barcode || null,
           item.title + (item.variant ? " — " + item.variant : ""), item.description || null,
           item.price, item.currency, availability, "Direct-to-customer fulfilment not verified",
           JSON.stringify(evidence), sourcePlatform, productUrl, dataSourceId || null],
        );
        created.push(result.rows[0]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    reply(response, 201, {
      success: true, provider, sourcePlatform, importedCount: created.length, candidates: created,
      note: "Imported as unverified owner-review candidates only. A registered source is linked only when an approved source owned by the importing account was selected; external source-platform names are preserved separately from the ingestion adapter. No images were copied or published; image rights, supplier identity, availability, exact variant and direct shipping require review.",
    });
  } catch (error) {
    console.error("WASLA official store import candidate error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Import candidate service error" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
