import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

function reply(res: ServerResponse, status: number, data: Record<string, unknown>) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
async function bodyOf(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = ""; let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 5_500_000) throw new Error("Body too large");
    body += chunk.toString();
  }
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid body");
  return parsed as Record<string, unknown>;
}
export async function handleBrandsRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET" && req.method !== "PATCH") { reply(res, 405, { success: false, error: "Method not allowed" }); return; }
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) { reply(res, 401, { success: false, error: "Authentication required" }); return; }
    const db = getDatabasePool();
    await db.query('ALTER TABLE "business_profiles" ADD COLUMN IF NOT EXISTS "logo_reference" text');
    if (req.method === "GET") {
      const result = await db.query(
        `SELECT a.id, a.display_name, a.legal_name, a.status, a.country_code,
                bp.description, bp.website, bp.logo_reference
         FROM account_members am
         JOIN accounts a ON a.id = am.account_id
         LEFT JOIN business_profiles bp ON bp.account_id = a.id
         WHERE am.user_id = $1 AND am.status = 'active' AND a.account_type = 'brand'
         ORDER BY a.created_at DESC`,
        [session.user.id],
      );
      reply(res, 200, { success: true, brands: result.rows }); return;
    }
    const data = await bodyOf(req);
    const accountId = data.accountId;
    const logoReference = data.logoReference;
    if (typeof accountId !== "string" || !/^[0-9a-f-]{36}$/i.test(accountId)) {
      reply(res, 400, { success: false, error: "Invalid brand account" }); return;
    }
    if (logoReference !== null && typeof logoReference !== "string") {
      reply(res, 400, { success: false, error: "Invalid logo" }); return;
    }
    if (typeof logoReference === "string") {
      const dataImage = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(logoReference);
      const httpsUrl = /^https:\/\//i.test(logoReference);
      if ((!dataImage && !httpsUrl) || logoReference.length > 5_000_000) {
        reply(res, 400, { success: false, error: "Choose an image under 3 MB or provide an HTTPS image URL" }); return;
      }
    }
    const permission = await db.query(
      `SELECT a.id FROM accounts a
       JOIN account_members am ON am.account_id = a.id
       JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
       WHERE a.id = $1 AND a.account_type = 'brand'
         AND am.user_id = $2 AND am.status = 'active' AND r.name = 'account_owner'
       LIMIT 1`,
      [accountId, session.user.id],
    );
    if (!permission.rowCount) { reply(res, 403, { success: false, error: "Only the brand owner can update its logo" }); return; }
    await db.query(
      `UPDATE business_profiles SET logo_reference = $1, updated_at = NOW() WHERE account_id = $2`,
      [logoReference || null, accountId],
    );
    reply(res, 200, { success: true });
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "Body too large";
    console.error("WASLA brands API error:", error);
    reply(res, tooLarge ? 413 : 500, { success: false, error: tooLarge ? "Logo too large. Choose an image under 3 MB." : "Could not process brand request" });
  }
}
