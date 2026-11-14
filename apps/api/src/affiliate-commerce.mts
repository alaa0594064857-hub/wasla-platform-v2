import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

function reply(res: ServerResponse, status: number, data: Record<string, unknown>): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  res.end(JSON.stringify(data));
}

export function approvedOutboundUrl(value: unknown, marketplaceDomain: unknown): string | null {
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
      source_url text,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(program_id, provider_item_id)
    )
  `);
  await db.query(`ALTER TABLE affiliate_items ADD COLUMN IF NOT EXISTS source_url text`);
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

  const program = await db.query(
    `SELECT id FROM affiliate_programs WHERE provider='amazon_associates' AND marketplace_domain='amazon.com' LIMIT 1`
  );
  const programId = program.rows[0]?.id;
  if (programId) {
    const editorialCandidates = [
      {
        id: "editorial:owala-freesip-stainless-24oz",
        titleEn: "Owala FreeSip Stainless Steel Water Bottle — 24 oz",
        titleAr: "قارورة أوالا FreeSip المعزولة من الستانلس ستيل — 24 أونصة",
        descriptionEn: "Insulated stainless-steel bottle with Owala's dual-function FreeSip spout, built-in straw and wide-mouth opening. The manufacturer lists a leak-proof lid, triple-layer insulation, a carry loop and a 24-hour cold claim. Verify the selected size and current details on the brand page.",
        descriptionAr: "قارورة معزولة من الستانلس ستيل بفوهة FreeSip ذات طريقتَي الشرب، مع شفاطة مدمجة وفتحة واسعة. تذكر الشركة غطاءً مانعاً للتسرب وعزلاً ثلاثي الطبقات وحلقة حمل واحتفاظاً بالبرودة لمدة 24 ساعة. يجب مراجعة المقاس والتفاصيل الحالية لدى الشركة.",
        sourceUrl: "https://owalalife.com/products/freesip"
      },
      {
        id: "editorial:stanley-quencher-h2o-flowstate-40oz",
        titleEn: "Stanley Quencher H2.0 FlowState Tumbler — 40 oz",
        titleAr: "كوب ستانلي Quencher H2.0 FlowState — 40 أونصة",
        descriptionEn: "Reusable 40 oz tumbler with double-wall vacuum insulation, a three-position FlowState lid, reusable straw and comfort-grip handle. Stanley lists recycled 18/8 stainless steel and compatibility with most car cup holders. Colors and availability vary by listing.",
        descriptionAr: "كوب قابل لإعادة الاستخدام بسعة 40 أونصة، بعزل حراري مزدوج الجدار وغطاء FlowState بثلاث وضعيات وشفاطة قابلة لإعادة الاستخدام ومقبض مريح. تذكر ستانلي استخدام فولاذ 18/8 معاد التدوير والتوافق مع معظم حاملات أكواب السيارات. تختلف الألوان والتوفّر حسب صفحة المنتج.",
        sourceUrl: "https://www.stanley1913.com/products/quencher-h2-0-flowstate-tumbler-40-oz"
      },
      {
        id: "retail:vatan-anker-312-25w",
        titleEn: "Anker 312 25W USB-C Charger — Black",
        titleAr: "شاحن Anker 312 USB-C بقدرة 25 واط — أسود",
        descriptionEn: "A compact 25W USB-C wall charger listed by Vatan Bilgisayar. Check the retailer page for the latest price, stock, delivery options, plug details and device compatibility before ordering.",
        descriptionAr: "شاحن جداري مدمج بمنفذ USB-C وقدرة 25 واط، معروض لدى متجر Vatan Bilgisayar. راجع صفحة البائع للتأكد من السعر والمخزون وخيارات التوصيل وتفاصيل القابس والتوافق قبل الطلب.",
        sourceUrl: "https://www.vatanbilgisayar.com/anker-312-sarj-cihazi-25w-sarj-cihazi.html"
      },
      {
        id: "retail:vatan-anker-nano-45w-black",
        titleEn: "Anker Nano 45W USB-C Charger with Cable — Black",
        titleAr: "شاحن Anker Nano بقدرة 45 واط مع كابل USB-C — أسود",
        descriptionEn: "A 45W USB-C charger supplied with a USB-C cable, listed by Vatan Bilgisayar. Confirm the current price, stock, delivery, regional plug and compatibility on the retailer's page.",
        descriptionAr: "شاحن USB-C بقدرة 45 واط مرفق معه كابل USB-C، معروض لدى متجر Vatan Bilgisayar. تحقق من السعر الحالي والمخزون والتوصيل ونوع القابس والتوافق من صفحة المتجر.",
        sourceUrl: "https://www.vatanbilgisayar.com/anker-nano-45w-sarj-cihazi-usb-c-kablo-dahil-siyah.html"
      },
      {
        id: "editorial:anker-735-nano-ii-65w",
        titleEn: "Anker 735 Charger (Nano II 65W)",
        titleAr: "شاحن Anker 735 Nano II بقدرة 65 واط",
        descriptionEn: "Compact GaN II wall charger with three ports: two USB-C and one USB-A. Anker's specifications list up to 65W single-port output; combined output depends on which ports are used. Check device compatibility and the regional plug version before purchase.",
        descriptionAr: "شاحن جداري مدمج بتقنية GaN II وثلاثة منافذ: منفذا USB-C ومنفذ USB-A. تذكر مواصفات Anker قدرة تصل إلى 65 واط عند استخدام منفذ واحد، بينما تختلف القدرة المشتركة حسب المنافذ المستخدمة. يجب التحقق من توافق الجهاز ونوع القابس الخاص بالمنطقة قبل الشراء.",
        sourceUrl: "https://www.anker.com/eu-en/products/a2667"
      }
    ];
    for (const item of editorialCandidates) {
      await db.query(
        `INSERT INTO affiliate_items
          (program_id, provider_item_id, title_en, title_ar, description_en, description_ar,
           source_url, content_source, destination_countries, publication_status, last_verified_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'editorial','[]'::jsonb,'draft',NOW())
         ON CONFLICT (program_id, provider_item_id) DO NOTHING`,
        [programId, item.id, item.titleEn, item.titleAr, item.descriptionEn, item.descriptionAr, item.sourceUrl]
      );
    }
  }
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
              COUNT(i.id) FILTER (WHERE i.publication_status='published')::int AS published_item_count,
              COUNT(DISTINCT c.id)::int AS click_count
       FROM affiliate_programs p LEFT JOIN affiliate_items i ON i.program_id=p.id
       LEFT JOIN affiliate_clicks c ON c.program_id=p.id
       GROUP BY p.id ORDER BY p.created_at ASC`
    );
    const items = await db.query(
      `SELECT id, provider_item_id, title_en, title_ar, description_en, description_ar,
              source_url, content_source, publication_status, last_verified_at
       FROM affiliate_items ORDER BY created_at DESC LIMIT 100`
    );
    reply(res, 200, {
      success: true,
      programs: programs.rows,
      items: items.rows,
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
    const affiliateItems = result.rows.flatMap((row: Record<string, unknown>) => {
      const outboundUrl = approvedOutboundUrl(row.outbound_url, row.marketplace_domain);
      if (!outboundUrl || typeof row.id !== "string") return [];
      return [{
        id: row.id,
        kind: "affiliate",
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
    // Editorial discovery cards are not affiliate offers and never imply local stock,
    // pricing, checkout, or commission. Only allow the three verified manufacturer hosts.
    const editorialResult = await db.query(
      `SELECT id,provider_item_id,title_en,title_ar,description_en,description_ar,source_url,last_verified_at
       FROM affiliate_items
       WHERE content_source='editorial' AND publication_status='draft'
         AND last_verified_at >= NOW() - INTERVAL '30 days'
         AND (provider_item_id NOT LIKE 'retail:vatan-%' OR $1 = 'TR')
       ORDER BY created_at ASC LIMIT 20`,
      [country]
    );
    const allowedEditorialHosts = new Set(["owalalife.com", "www.stanley1913.com", "www.anker.com", "www.vatanbilgisayar.com"]);
    // Official product-page imagery; Vatan thumbnails are served by its product CDN.
    const editorialImages: Record<string, string> = {
      "editorial:owala-freesip-stainless-24oz": "https://cdn.shopify.com/s/files/1/0439/2537/3087/files/OW_24oz_Free_Sip_Plaid_and_Simple_fall_stock_2026_SC_copy_dddd98b0-02e0-4909-adc3-6545e0096ded.png?crop=center&height=500&v=1788969809&width=500",
      "editorial:stanley-quencher-h2o-flowstate-40oz": "https://www.stanley1913.com/cdn/shop/files/Web_PNG_Square-TheQuencherH2.0FlowstateTumbler-40OZ-SorbetWildflower-Front.png?v=1782915015&width=990",
      "editorial:anker-735-nano-ii-65w": "https://cdn.shopify.com/s/files/1/0595/4034/0926/products/A2667311-Anker_735_Charger_Nano_II_65W.png?v=1758191630&width=3840",
      "retail:vatan-anker-312-25w": "https://cdn.vatanbilgisayar.com/Upload/PRODUCT/anker/thumb/139689-1_small.jpg",
      "retail:vatan-anker-nano-45w-black": "https://cdn.vatanbilgisayar.com/Upload/PRODUCT/anker/thumb/153187-1_small.jpg"
    };
    const editorialItems = editorialResult.rows.flatMap((row: Record<string, unknown>) => {
      if (typeof row.id !== "string" || typeof row.source_url !== "string") return [];
      try {
        const url = new URL(row.source_url);
        if (url.protocol !== "https:" || !allowedEditorialHosts.has(url.hostname)) return [];
        return [{
          id: row.id,
          kind: "editorial",
          title_en: row.title_en,
          title_ar: row.title_ar,
          description_en: row.description_en,
          description_ar: row.description_ar,
          marketplace: url.hostname === "www.vatanbilgisayar.com" ? "Vatan Bilgisayar" : "Official brand source",
          image_url: typeof row.provider_item_id === "string" ? editorialImages[row.provider_item_id] || null : null,
          destination_country: country,
          disclosure_en: "",
          disclosure_ar: "",
          outbound_path: url.toString()
        }];
      } catch { return []; }
    });
    const items = [...editorialItems, ...affiliateItems];
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
