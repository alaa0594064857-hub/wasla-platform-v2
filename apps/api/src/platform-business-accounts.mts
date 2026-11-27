import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { authorizePlatformPermission } from "./platform-security.mjs";
import { getDatabasePool } from "./database.js";

function reply(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  response.end(JSON.stringify(data));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  let body = "";
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 12_000) return null;
    body += chunk.toString();
  }
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

/** Owner-only business verification queue and auditable review decision. */
export async function handlePlatformBusinessAccountsRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "PATCH") {
    reply(response, 405, { success: false, error: "Method not allowed" });
    return;
  }

  try {
    const access = await authorizePlatformPermission(request, response, "platform.manage");
    if (!access) return;
    if (!access.roleNames.includes("platform_owner")) {
      reply(response, 403, { success: false, error: "Platform owner access required" });
      return;
    }
    const pool = getDatabasePool();

    if (request.method === "GET") {
      const result = await pool.query(
        `SELECT a.id, a.account_type, a.legal_name, a.display_name, a.status,
                a.country_code, a.created_at,
                bp.description, bp.website, bp.contact_information,
                bp.verification_status,
                COUNT(DISTINCT s.id)::int AS store_count,
                COUNT(DISTINCT CASE WHEN am.status = 'active' AND r.name = 'account_owner' AND u.status = 'active' AND u.email_verified = TRUE THEN am.user_id END)::int AS active_owner_count
         FROM accounts a
         LEFT JOIN business_profiles bp ON bp.account_id = a.id
         LEFT JOIN stores s ON s.account_id = a.id AND s.status <> 'deactivated'
         LEFT JOIN account_members am ON am.account_id = a.id
         LEFT JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
         LEFT JOIN users u ON u.id = am.user_id
         WHERE a.status IN ('pending_verification', 'active', 'suspended')
         GROUP BY a.id, bp.description, bp.website, bp.contact_information, bp.verification_status
         ORDER BY CASE a.status WHEN 'pending_verification' THEN 0 WHEN 'suspended' THEN 1 ELSE 2 END,
                  a.created_at DESC
         LIMIT 200`,
      );
      reply(response, 200, { success: true, accounts: result.rows });
      return;
    }

    const body = await readBody(request);
    const accountId = body?.accountId;
    const decision = body?.decision;
    const note = typeof body?.reviewNote === "string" ? body.reviewNote.trim() : "";
    if (typeof accountId !== "string" || !/^[0-9a-f-]{36}$/i.test(accountId) ||
        (decision !== "approve" && decision !== "reject") || note.length < 20 || note.length > 1000 ||
        body?.confirmReviewed !== true) {
      reply(response, 400, { success: false, error: "A valid decision, a 20–1000 character review note, and explicit evidence-review confirmation are required" });
      return;
    }

    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session?.user?.id) {
      reply(response, 401, { success: false, error: "Authentication required" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<{
        id: string; status: string; account_type: string; verification_status: string | null;
        owner_count: number;
      }>(
        `SELECT a.id, a.status, a.account_type::text AS account_type,
                bp.verification_status::text AS verification_status,
                (SELECT COUNT(DISTINCT am.user_id)::int
                 FROM account_members am
                 INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
                 INNER JOIN users u ON u.id = am.user_id AND u.status = 'active' AND u.email_verified = TRUE
                 WHERE am.account_id = a.id AND am.status = 'active' AND r.name = 'account_owner') AS owner_count
         FROM accounts a
         LEFT JOIN business_profiles bp ON bp.account_id = a.id
         WHERE a.id = $1
         FOR UPDATE OF a`,
        [accountId],
      );
      const account = selected.rows[0];
      if (!account) {
        await client.query("ROLLBACK");
        reply(response, 404, { success: false, error: "Business account not found" });
        return;
      }
      if (account.status !== "pending_verification") {
        await client.query("ROLLBACK");
        reply(response, 409, { success: false, error: "Only accounts awaiting verification can receive this decision" });
        return;
      }
      if (account.owner_count < 1) {
        await client.query("ROLLBACK");
        reply(response, 409, { success: false, error: "The account has no active owner; resolve ownership before review" });
        return;
      }

      const nextVerification = decision === "approve" ? "verified" : "rejected";
      const nextStatus = decision === "approve" ? "active" : "suspended";
      const profile = await client.query(
        `UPDATE business_profiles SET verification_status = $2, updated_at = NOW()
         WHERE account_id = $1 RETURNING account_id`,
        [accountId, nextVerification],
      );
      if (profile.rowCount !== 1) {
        await client.query("ROLLBACK");
        reply(response, 409, { success: false, error: "Business profile is missing; account was not changed" });
        return;
      }
      await client.query(
        "UPDATE accounts SET status = $2, updated_at = NOW() WHERE id = $1",
        [accountId, nextStatus],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, metadata)
         VALUES ($1, $2, 'business_account', $3, $3, $4::jsonb)`,
        [session.user.id, decision === "approve" ? "business.account.verified_and_activated" : "business.account.verification_rejected",
         accountId, JSON.stringify({ previousStatus: account.status, nextStatus, previousVerificationStatus: account.verification_status, nextVerification, reviewNote: note })],
      );
      await client.query("COMMIT");
      reply(response, 200, { success: true, accountId, status: nextStatus, verificationStatus: nextVerification });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA platform business account review error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Could not process business account review" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
