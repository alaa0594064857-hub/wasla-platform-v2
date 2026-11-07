import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

type Category = "skincare_cosmetics" | "perfume" | "book" | "watch" | "electronics" | "apparel" | "home" | "general";
const SCHEMAS: Record<Category, string[]> = {
  skincare_cosmetics: ["ingredients_inci", "volume_or_weight", "skin_type", "manufacturer", "country_of_origin", "batch_or_lot", "expiry_or_paO", "warnings", "regulatory_status", "sealed_packaging"],
  perfume: ["volume", "concentration", "scent_notes", "manufacturer", "country_of_origin", "batch_or_lot", "authenticity_evidence", "sealed_packaging"],
  book: ["author", "publisher", "isbn", "language", "edition", "publication_date", "format", "page_count"],
  watch: ["brand", "model", "movement", "case_material", "strap_material", "case_diameter", "water_resistance", "glass", "warranty"],
  electronics: ["brand", "model", "power_or_voltage", "compatibility", "dimensions", "included_accessories", "warranty", "certifications"],
  apparel: ["brand", "size", "material", "colour", "care_instructions", "country_of_origin"],
  home: ["dimensions", "material", "weight", "power_or_voltage", "included_components", "care_instructions"],
  general: ["brand", "model_or_sku", "dimensions_or_size", "material", "included_items", "country_of_origin", "warranty"],
};
const KEYWORDS: Record<Category, string[]> = {
  skincare_cosmetics: ["cream", "moistur", "lotion", "serum", "skin", "مرطب", "كريم", "بشرة", "سيروم", "لوشن"],
  perfume: ["perfume", "fragrance", "eau de", "parfum", "عطر", "كولونيا"],
  book: ["book", "isbn", "paperback", "hardcover", "novel", "كتاب", "رواية", "مؤلف"],
  watch: ["watch", "wristwatch", "movement", "ساعة", "ساعات"],
  electronics: ["electronic", "bluetooth", "usb", "charger", "headphone", "phone", "لابتوب", "سماعة", "شاحن", "إلكتروني"],
  apparel: ["shirt", "dress", "jacket", "shoe", "sneaker", "clothing", "قميص", "فستان", "حذاء", "ملابس"],
  home: ["kitchen", "furniture", "lamp", "storage", "home", "مطبخ", "منزل", "مصباح", "أثاث"],
  general: [],
};
function reply(res: ServerResponse, status: number, data: Record<string, unknown>) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(data));
}
async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "";
  for await (const chunk of req) { raw += chunk.toString(); if (raw.length > 8000) throw new Error("BODY_TOO_LARGE"); }
  const value: unknown = JSON.parse(raw || "{}");
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function classify(title: string, description: string): { category: Category; confidence: number } {
  const text = (title + " " + description).toLocaleLowerCase();
  const scores = (Object.keys(KEYWORDS) as Category[]).filter(k => k !== "general")
    .map(category => ({ category, score: KEYWORDS[category].reduce((n, word) => n + (text.includes(word) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score);
  if (!scores[0] || scores[0].score === 0) return { category: "general", confidence: 0.25 };
  const second = scores[1]?.score ?? 0;
  return { category: scores[0].category, confidence: Math.min(0.95, 0.55 + scores[0].score * 0.12 - (second ? 0.08 : 0)) };
}
function extractEvidenceFields(category: Category, text: string): { facts: Record<string, string>; missing: string[] } {
  const facts: Record<string, string> = {};
  const patterns: Record<string, RegExp> = {
    isbn: /\b(?:isbn(?:-1[03])?\s*[:#]?\s*)([0-9X-]{10,17})\b/i,
    volume_or_weight: /\b(\d+(?:\.\d+)?\s?(?:ml|l|g|kg|oz))\b/i,
    volume: /\b(\d+(?:\.\d+)?\s?(?:ml|l|oz))\b/i,
    page_count: /\b(\d{2,4})\s*(?:pages|صفحة|صفحات)\b/i,
    size: /\b(?:size|مقاس)\s*[:#]?\s*([a-z0-9-]+)/i,
    model_or_sku: /\b(?:model|sku|mpn)\s*[:#]?\s*([a-z0-9._-]+)/i,
    case_diameter: /\b(\d+(?:\.\d+)?\s?mm)\b/i,
    water_resistance: /\b(\d+\s?(?:atm|bar|m)\s*(?:water resistant|water resistance)?)\b/i,
  };
  for (const key of SCHEMAS[category]) {
    const pattern = patterns[key];
    const match = pattern?.exec(text);
    if (match?.[1]) facts[key] = match[1].trim();
  }
  return { facts, missing: SCHEMAS[category].filter(key => !facts[key]) };
}

/** Evidence-led first-pass enrichment. This is deterministic extraction, not an LLM and never publishes. */
export async function handleOfficialStoreCandidateEnrichment(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const access = await authorizePlatformPermission(req, res, "platform.manage");
    if (!access) return;
    if (req.method !== "POST") { reply(res, 405, { success: false, error: "Method not allowed" }); return; }
    let body: Record<string, unknown> | null;
    try { body = await readBody(req); } catch { reply(res, 400, { success: false, error: "Invalid JSON body" }); return; }
    const candidateId = typeof body?.candidateId === "string" ? body.candidateId.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidateId)) {
      reply(res, 400, { success: false, error: "A valid candidateId is required" }); return;
    }
    const db = getDatabasePool();
    const found = await db.query(
      `SELECT id, proposed_title, proposed_description, source_product_url, evidence
       FROM official_store_sourcing_candidates WHERE id=$1 LIMIT 1`, [candidateId]);
    if (!found.rows.length) { reply(res, 404, { success: false, error: "Sourcing candidate not found" }); return; }
    const candidate = found.rows[0] as { id: string; proposed_title: string | null; proposed_description: string | null; source_product_url: string | null; evidence: unknown };
    const title = candidate.proposed_title ?? "";
    const description = candidate.proposed_description ?? "";
    const detected = classify(title, description);
    const extracted = extractEvidenceFields(detected.category, title + " " + description);
    const source = candidate.source_product_url ? [{ field: "source_listing", url: candidate.source_product_url, status: "supplier_claim_unverified" }] : [];
    const evidence = [...source, ...Object.keys(extracted.facts).map(field => ({ field, value: extracted.facts[field], source: candidate.source_product_url, status: "source_claim_unverified" }))];
    const enrichment = {
      category: detected.category, classificationConfidence: detected.confidence,
      facts: extracted.facts, missingRequiredReviewFields: extracted.missing,
      evidence, sourceDescriptionAvailable: Boolean(description),
      mediaRights: "unreviewed", supplierIdentity: "unverified",
      listingDraftStatus: "not_generated_no_llm_provider",
      publicationStatus: "private_owner_review_only",
      warnings: [
        "This first-pass classifier and extractor is deterministic, not an AI model.",
        "Extracted values are supplier/source claims and are not independently verified.",
        "Do not reuse supplier descriptions, images or video without documented rights.",
        "No listing is created or published and no supplier order is placed.",
        ...(detected.category === "skincare_cosmetics" || detected.category === "perfume" ? ["Cosmetics/perfume require ingredient or composition, batch/expiry, authenticity, destination compliance and safety review before listing."] : []),
      ],
    };
    await db.query(`
      CREATE TABLE IF NOT EXISTS official_store_candidate_enrichments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        candidate_id uuid NOT NULL REFERENCES official_store_sourcing_candidates(id) ON DELETE CASCADE,
        owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category varchar(40) NOT NULL,
        enrichment jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        UNIQUE(candidate_id, owner_user_id)
      )`);
    const saved = await db.query(`
      INSERT INTO official_store_candidate_enrichments (candidate_id, owner_user_id, category, enrichment)
      VALUES ($1,$2,$3,$4::jsonb)
      ON CONFLICT (candidate_id, owner_user_id) DO UPDATE SET
        category=EXCLUDED.category, enrichment=EXCLUDED.enrichment, updated_at=NOW()
      RETURNING id, created_at, updated_at`,
      [candidateId, access.userId, detected.category, JSON.stringify(enrichment)]);
    reply(res, 200, { success: true, candidateId, enrichmentId: saved.rows[0].id, enrichment, note: "Saved as a private evidence-led enrichment for owner review. No AI-generated copy, image reuse, publication or purchasing was performed." });
  } catch (error) {
    console.error("WASLA product candidate enrichment error:", error);
    if (!res.headersSent) reply(res, 500, { success: false, error: "Product enrichment failed" });
    else res.destroy(error instanceof Error ? error : undefined);
  }
}
