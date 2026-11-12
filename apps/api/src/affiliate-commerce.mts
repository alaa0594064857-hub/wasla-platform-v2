import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

function reply(res: ServerResponse, status: number, data: Record<string, unknown>): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  res.end(JSON.stringify(data));
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
