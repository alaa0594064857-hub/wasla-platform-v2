import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

const METHODS = ["official_api", "licensed_feed", "merchant_feed", "owner_research", "manual_import"] as const;
const STATUSES = ["pending_review", "approved", "paused", "rejected"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(res: ServerResponse, status: number, data: Record<string, unknown>) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(data));
}
async function body(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "";
  for await (const chunk of req) { raw += chunk.toString(); if (raw.length > 16000) throw new Error("BODY_TOO_LARGE"); }
  const parsed: unknown = JSON.parse(raw || "{}");
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
}
const str = (v: unknown, max = 240) => typeof v === "string" ? v.trim().slice(0, max) : "";
const https = (v: unknown) => { if (typeof v !== "string" || v.length > 2000) return false; try { const u = new URL(v); return u.protocol === "https:" && !!u.hostname && !u.username && !u.password; } catch { return false; } };
function stringArray(v: unknown, maxItems = 30): string[] | null {
  if (!Array.isArray(v) || v.length > maxItems || v.some(x => typeof x !== "string" || !x.trim() || x.length > 80)) return null;
  return [...new Set(v.map(x => (x as string).trim()))];
}

/** Idempotent schema bootstrap for the owner-only authorized data source registry. */
export async function ensureOfficialStoreDataSourceTables(): Promise<void> {
  const client = await getDatabasePool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS official_store_data_sources (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name varchar(180) NOT NULL,
        provider varchar(100) NOT NULL,
        source_category varchar(60) NOT NULL,
        access_method varchar(32) NOT NULL CHECK (access_method IN ('official_api','licensed_feed','merchant_feed','owner_research','manual_import')),
        permission_status varchar(32) NOT NULL DEFAULT 'pending_review' CHECK (permission_status IN ('pending_review','approved','paused','rejected')),
        permission_evidence_url text,
        terms_url text,
        documentation_url text,
        data_types jsonb NOT NULL DEFAULT '[]'::jsonb,
        markets jsonb NOT NULL DEFAULT '[]'::jsonb,
        refresh_interval_hours integer,
        last_verified_at timestamptz,
        notes text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS official_store_data_sources_owner_created_idx ON official_store_data_sources (created_by, created_at DESC)`);
    await client.query(`ALTER TABLE official_store_sourcing_candidates ADD COLUMN IF NOT EXISTS data_source_id uuid REFERENCES official_store_data_sources(id) ON DELETE SET NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS official_store_sourcing_candidates_data_source_idx ON official_store_sourcing_candidates (data_source_id) WHERE data_source_id IS NOT NULL`);
  } finally { client.release(); }
}

export async function handleOfficialStoreDataSourcesRequest(req: IncomingMessage, res: ServerResponse, sourceId?: string): Promise<void> {
  try {
    const access = await authorizePlatformPermission(req, res, "platform.manage");
    if (!access) return;
    const db = getDatabasePool();
    if (req.method === "GET" && !sourceId) {
      const result = await db.query(
        `SELECT id, name, provider, source_category, access_method, permission_status,
          permission_evidence_url, terms_url, documentation_url, data_types, markets,
          refresh_interval_hours, last_verified_at, notes, created_at, updated_at
         FROM official_store_data_sources WHERE created_by = $1 ORDER BY created_at DESC LIMIT 200`,
        [access.userId],
      );
      reply(res, 200, { success: true, sources: result.rows }); return;
    }
    let input: Record<string, unknown> | null;
    try { input = await body(req); } catch (error) {
      reply(res, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, { success: false, error: "Invalid JSON body" }); return;
    }
    if (!input) { reply(res, 400, { success: false, error: "A JSON object is required" }); return; }
    if (req.method === "POST" && !sourceId) {
      const name = str(input.name, 180), provider = str(input.provider, 100), category = str(input.sourceCategory, 60);
      const method = str(input.accessMethod, 32);
      const dataTypes = stringArray(input.dataTypes), markets = stringArray(input.markets);
      const interval = input.refreshIntervalHours === "" || input.refreshIntervalHours == null ? null : Number(input.refreshIntervalHours);
      const evidence = input.permissionEvidenceUrl ? input.permissionEvidenceUrl : null;
      const terms = input.termsUrl ? input.termsUrl : null;
      const docs = input.documentationUrl ? input.documentationUrl : null;
      if (name.length < 2 || !provider || !category || !(METHODS as readonly string[]).includes(method) ||
          !dataTypes || !markets || (evidence && !https(evidence)) || (terms && !https(terms)) || (docs && !https(docs)) ||
          (interval !== null && (!Number.isInteger(interval) || interval < 1 || interval > 8760))) {
        reply(res, 400, { success: false, error: "Provide a name, provider, category, supported access method, valid data types/markets, HTTPS evidence links and a valid refresh interval." }); return;
      }
      const inserted = await db.query(
        `INSERT INTO official_store_data_sources
         (created_by,name,provider,source_category,access_method,permission_status,permission_evidence_url,terms_url,documentation_url,data_types,markets,refresh_interval_hours,last_verified_at,notes)
         VALUES ($1,$2,$3,$4,$5,'pending_review',$6,$7,$8,$9::jsonb,$10::jsonb,$11,NULL,$12)
         RETURNING id,name,provider,source_category,access_method,permission_status,created_at`,
        [access.userId,name,provider,category,method,evidence,terms,docs,JSON.stringify(dataTypes),JSON.stringify(markets),interval,str(input.notes,2000) || null],
      );
      reply(res, 201, { success: true, source: inserted.rows[0], note: "Source saved as pending review. It is not approved for automated collection or commercial use." }); return;
    }
    if (req.method === "PATCH" && sourceId && UUID.test(sourceId)) {
      const status = str(input.permissionStatus, 32);
      if (!(STATUSES as readonly string[]).includes(status)) { reply(res, 400, { success: false, error: "Invalid permission status" }); return; }
      const evidence = Object.hasOwn(input, "permissionEvidenceUrl") ? input.permissionEvidenceUrl : undefined;
      if (evidence !== undefined && evidence !== null && !https(evidence)) { reply(res, 400, { success: false, error: "Permission evidence must be an HTTPS URL" }); return; }
      if (status === "approved" && !https(evidence)) { reply(res, 400, { success: false, error: "An HTTPS permission evidence URL is required before approval" }); return; }
      const result = await db.query(
        `UPDATE official_store_data_sources SET permission_status=$1,
          permission_evidence_url=COALESCE($2,permission_evidence_url),
          last_verified_at=CASE WHEN $1='approved' THEN NOW() ELSE last_verified_at END,
          updated_at=NOW()
         WHERE id=$3 AND created_by=$4
         RETURNING id,name,provider,access_method,permission_status,permission_evidence_url,last_verified_at,updated_at`,
        [status,evidence ?? null,sourceId,access.userId],
      );
      if (!result.rows.length) { reply(res, 404, { success: false, error: "Source not found" }); return; }
      reply(res, 200, { success: true, source: result.rows[0] }); return;
    }
    reply(res, 405, { success: false, error: "Method not allowed" });
  } catch (error) {
    console.error("WASLA data source registry error:", error);
    if (!res.headersSent) reply(res, 500, { success: false, error: "Data source registry error" });
    else res.destroy(error instanceof Error ? error : undefined);
  }
}
