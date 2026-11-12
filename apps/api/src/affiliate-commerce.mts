import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

function reply(res: ServerResponse, status: number, data: Record<string, unknown>): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  res.end(JSON.stringify(data));
}

function approvedOutboundUrl(value: unknown, marketplaceDomain: unknown): string | null {
  if (typeof value !== "string" || typeof marketplaceDomain !== "string") return null;
  try {
    const url = new URL(value);
    const domain = marketplaceDomain.trim().toLowerCase();
    if (url.protocol !== "https:" || !domain || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host !== domain && !host.endsWith(`.${domain}`)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Separate affiliate-program registry; it never creates WASLA orders or supplier offers. */
export async function ensureAffiliateCommerceTables(): Promise<void> {
  const db = getDatabasePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS affiliate_programs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider varchar(60) NOT NULL,
      marketplace varchar(120) NOT NULL,
      marketplace_domain varchar(180) NOT NULL,
      destination_country char(2) NOT NULL,
      currency char(3) NOT NULL,
      tracking_id varchar(120),
      status varchar(20) NOT NULL DEFAULT 'paused'
        CHECK (status IN ('paused','pending_approval','active','rejected')),
      disclosure_en text NOT NULL,
      disclosure_ar text NOT NULL,
      terms_reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(provider, marketplace_domain)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS affiliate_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id uuid NOT NULL REFERENCES affiliate_programs(id) ON DELETE RESTRICT,
      provider_item_id varchar(160) NOT NULL,
      title_en varchar(240),
      title_ar varchar(240),
      description_en text,
      description_ar text,
      outbound_url text,
      content_source varchar(24) NOT NULL DEFAULT 'unverified'
        CHECK (content_source IN ('unverified','approved_api','licensed_feed','editorial')),
      destination_countries jsonb NOT NULL DEFAULT '[]'::jsonb,
      publication_status varchar(16) NOT NULL DEFAULT 'draft'
        CHECK (publication_status IN ('draft','published','archived')),
      last_verified_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(program_id, provider_item_id)
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS affiliate_items_public_idx ON affiliate_items(program_id, publication_status, updated_at DESC)`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS affiliate_clicks (
      id bigserial PRIMARY KEY,
      item_id uuid NOT NULL REFERENCES affiliate_items(id) ON DELETE RESTRICT,
      program_id uuid NOT NULL REFERENCES affiliate_programs(id) ON DELETE RESTRICT,
      clicked_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    INSERT INTO affiliate_programs
      (provider, marketplace, marketplace_domain, destination_country, currency, tracking_id, status, disclosure_en, disclosure_ar)
    VALUES
      ('amazon_associates','Amazon United States','amazon.com','US','USD','waslatrade-20','pending_approval',
       'As an Amazon Associate I earn from qualifying purchases.',
       'بصفتي شريكاً في Amazon، أكسب من عمليات الشراء المؤهلة.')
    ON CONFLICT (provider, marketplace_domain) DO NOTHING
  `);
}

export async function handleAffiliateCommerceRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const access = await authorizePlatformPermission(req, res, "platform.manage");
    if (!access) return;
    const db = getDatabasePool();
    if (req.method !== "GET") { reply(res, 405, { success: false, error: "Method not allowed" }); return; }
    const programs = await db.query(
      `SELECT p.id,p.provider,p.marketplace,p.marketplace_domain,p.destination_country,p.currency,
              p.tracking_id,p.status,p.disclosure_en,p.disclosure_ar,p.terms_reviewed_at,
              p.created_at,p.updated_at,COUNT(i.id)::int AS item_count,
              COUNT(i.id) FILTER (WHERE i.publication_status='published')::int AS published_item_count
       FROM affiliate_programs p LEFT JOIN affiliate_items i ON i.program_id=p.id
       GROUP BY p.id ORDER BY p.created_at ASC`
    );
    reply(res, 200, {
      success: true,
      programs: programs.rows,
      safeguards: {
        publicPublishingEnabled: false,
        amazonProductApiConnected: false,
        amazonLinksEnabled: false,
        turkeyAffiliateProgramConfigured: false
      },
      note: "Affiliate setup is intentionally paused. No products, prices, images or outbound links are published."
    });
  } catch (error) {
    console.error("WASLA affiliate commerce registry error:", error);
    if (!res.headersSent) reply(res, 500, { success: false, error: "Affiliate commerce service error" });
    else res.destroy(error instanceof Error ? error : undefined);
  }
}

/** Public catalog only exposes recently verified items from approved, terms-reviewed programs. */
export async function handleAffiliatePublicCatalogRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET") { reply(res, 405, { success: false, error: "Method not allowed" }); return; }
  const country = new URL(req.url || "/", "http://localhost").searchParams.get("country")?.toUpperCase();
  if (!country || !/^[A-Z]{2}$/.test(country)) {
    reply(res, 400, { success: false, error: "Choose a valid two-letter marketplace country code" });
    return;
  }
  try {
    const db = getDatabasePool();
    const result = await db.query(
      `SELECT i.id, i.title_en, i.title_ar, i.description_en, i.description_ar,
              i.outbound_url, i.destination_countries, i.last_verified_at,
              p.marketplace, p.marketplace_domain, p.destination_country,
              p.disclosure_en, p.disclosure_ar
       FROM affiliate_items i
       INNER JOIN affiliate_programs p ON p.id=i.program_id
       WHERE p.status='active' AND p.terms_reviewed_at IS NOT NULL
         AND i.publication_status='published'
         AND i.content_source IN ('approved_api','licensed_feed','editorial')
         AND i.last_verified_at >= NOW() - INTERVAL '30 days'
         AND i.destination_countries ? $1
       ORDER BY i.updated_at DESC LIMIT 60`,
      [country]
    );
    const items = result.rows.flatMap((row: Record<string, unknown>) => {
      const outboundUrl = approvedOutboundUrl(row.outbound_url, row.marketplace_domain);
      if (!outboundUrl || typeof row.id !== "string") return [];
      return [{
        id: row.id,
        title_en: row.title_en,
        title_ar: row.title_ar,
        description_en: row.description_en,
        description_ar: row.description_ar,
        marketplace: row.marketplace,
        destination_country: row.destination_country,
        disclosure_en: row.disclosure_en,
        disclosure_ar: row.disclosure_ar,
        outbound_path: `/api/affiliate/out/${row.id}`
      }];
    });
    reply(res, 200, { success: true, country, items });
  } catch (error) {
    console.error("WASLA public affiliate catalog error:", error);
    reply(res, 500, { success: false, error: "Affiliate catalog service error" });
  }
}

/** Privacy-minimal click logging; only redirects to the item's verified marketplace domain. */
export async function handleAffiliateOutboundRequest(req: IncomingMessage, res: ServerResponse, itemId: string): Promise<void> {
  if (req.method !== "GET") { reply(res, 405, { success: false, error: "Method not allowed" }); return; }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(itemId)) {
    reply(res, 404, { success: false, error: "Affiliate item not found" });
    return;
  }
  try {
    const db = getDatabasePool();
    const result = await db.query(
      `SELECT i.id, i.outbound_url, p.id AS program_id, p.marketplace_domain
       FROM affiliate_items i
       INNER JOIN affiliate_programs p ON p.id=i.program_id
       WHERE i.id=$1 AND p.status='active' AND p.terms_reviewed_at IS NOT NULL
         AND i.publication_status='published'
         AND i.content_source IN ('approved_api','licensed_feed','editorial')
         AND i.last_verified_at >= NOW() - INTERVAL '30 days'
       LIMIT 1`,
      [itemId]
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    const destination = row ? approvedOutboundUrl(row.outbound_url, row.marketplace_domain) : null;
    if (!row || !destination) { reply(res, 404, { success: false, error: "Affiliate item is unavailable" }); return; }
    await db.query("INSERT INTO affiliate_clicks (item_id, program_id) VALUES ($1, $2)", [itemId, row.program_id]);
    res.writeHead(302, {
      Location: destination,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    });
    res.end();
  } catch (error) {
    console.error("WASLA affiliate outbound redirect error:", error);
    if (!res.headersSent) reply(res, 500, { success: false, error: "Affiliate redirect service error" });
    else res.destroy(error instanceof Error ? error : undefined);
  }
}
