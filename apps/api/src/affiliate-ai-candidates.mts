import { createHash } from "node:crypto";
import { getDatabasePool } from "./database.js";
import { ensureAffiliateCommerceTables } from "./affiliate-commerce.mjs";

export type AffiliateResearchCandidate = {
  title_en: string;
  title_ar: string;
  description_en: string;
  description_ar: string;
  source_url: string;
};

const START_MARKER = "WASLA_CANDIDATE_PRODUCTS_JSON_START";
const END_MARKER = "WASLA_CANDIDATE_PRODUCTS_JSON_END";
const MARKETPLACE_DOMAINS = [
  "amazon.com", "amazon.com.tr", "amazon.co.uk", "amazon.de", "amazon.fr", "amazon.ca",
  "amazon.co.jp", "amazon.com.au", "amazon.in", "amazon.sg", "amazon.ae", "amazon.sa",
  "amazon.es", "amazon.it", "amazon.nl", "amazon.se", "amazon.pl", "amazon.com.mx",
  "amazon.com.br", "amazon.eg", "ebay.com", "ebay.co.uk", "ebay.de", "ebay.ca",
  "walmart.com", "walmart.ca", "target.com", "bestbuy.com", "aliexpress.com",
  "temu.com", "alibaba.com", "shein.com",
];

function safeText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

function normalizedHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const privateHost = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
      || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.")
      || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) || host.startsWith("169.254.")
      || host === "0.0.0.0" || host === "::1" || host === "[::1]" || !host.includes(".");
    if (privateHost) return null;
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

function isMarketplaceHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return MARKETPLACE_DOMAINS.some(domain => host === domain || host.endsWith("." + domain));
}

/**
 * Extracts only bilingual product candidates whose official-source URL is also
 * present in Gemini's grounding metadata. Retail marketplaces are excluded:
 * this pipeline creates research leads, not licensed marketplace content.
 */
export function extractAffiliateResearchCandidates(
  answer: string,
  groundedSourceUrls: string[],
): AffiliateResearchCandidate[] {
  const start = answer.indexOf(START_MARKER);
  const end = answer.indexOf(END_MARKER, start + START_MARKER.length);
  if (start < 0 || end < 0) return [];

  const raw = answer.slice(start + START_MARKER.length, end).trim();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  const products = (parsed as Record<string, unknown>).products;
  if (!Array.isArray(products)) return [];

  const grounded = new Set(
    groundedSourceUrls.map(normalizedHttpsUrl).filter((url): url is string => Boolean(url)),
  );
  const result: AffiliateResearchCandidate[] = [];
  const seen = new Set<string>();

  for (const value of products.slice(0, 5)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    const titleEn = safeText(item.title_en, 180);
    const titleAr = safeText(item.title_ar, 180);
    const descriptionEn = safeText(item.description_en, 3000);
    const descriptionAr = safeText(item.description_ar, 3000);
    const sourceUrl = normalizedHttpsUrl(item.source_url);
    if (!titleEn || !titleAr || !descriptionEn || !descriptionAr || !sourceUrl) continue;

    let host = "";
    try { host = new URL(sourceUrl).hostname.toLowerCase(); } catch { continue; }
    if (isMarketplaceHost(host) || !grounded.has(sourceUrl) || seen.has(sourceUrl)) continue;

    seen.add(sourceUrl);
    result.push({
      title_en: titleEn,
      title_ar: titleAr,
      description_en: descriptionEn,
      description_ar: descriptionAr,
      source_url: sourceUrl,
    });
  }
  return result;
}

/** Saves research leads as unpublished, unverified owner-review drafts only. */
export async function saveAffiliateResearchCandidates(args: {
  specialistKey: string;
  inputContext: unknown;
  ownerUserId: string;
  answer: string;
  groundedSourceUrls: string[];
}): Promise<number> {
  if (args.specialistKey !== "product_analyst") return 0;
  if (!args.inputContext || typeof args.inputContext !== "object" || Array.isArray(args.inputContext)) return 0;
  const context = args.inputContext as Record<string, unknown>;
  if (context.scope !== "affiliate_only") return 0;

  const candidates = extractAffiliateResearchCandidates(args.answer, args.groundedSourceUrls);
  if (candidates.length === 0) return 0;

  await ensureAffiliateCommerceTables();
  const db = getDatabasePool();
  const program = await db.query(
    "SELECT id FROM affiliate_programs WHERE provider='amazon_associates' AND marketplace_domain='amazon.com' LIMIT 1",
  );
  const programId = program.rows[0]?.id;
  if (typeof programId !== "string") return 0;

  let created = 0;
  for (const candidate of candidates) {
    const providerItemId = "ai-research:" + createHash("sha256").update(candidate.source_url).digest("hex").slice(0, 40);
    const inserted = await db.query(
      `INSERT INTO affiliate_items
        (program_id,provider_item_id,title_en,title_ar,description_en,description_ar,
         source_url,content_source,destination_countries,publication_status,last_verified_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,'unverified','[]'::jsonb,'draft',NULL)
       ON CONFLICT(program_id,provider_item_id) DO NOTHING
       RETURNING id`,
      [programId,providerItemId,candidate.title_en,candidate.title_ar,
       candidate.description_en,candidate.description_ar,candidate.source_url],
    );
    if (inserted.rows[0]) created++;
  }
  return created;
}
