import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

function respond(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  let body = "";
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 15_000) throw new Error("Request body too large");
    body += chunk.toString();
  }
  return JSON.parse(body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) return undefined;
  return value.trim();
}

function validWebsite(value: unknown): string | null | undefined {
  const text = optionalText(value, 2048);
  if (text === undefined || text === null) return text;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? text : undefined;
  } catch {
    return undefined;
  }
}

const CONTACT_FIELDS = ["email", "phone", "whatsapp", "address", "city"] as const;

export async function handleBusinessAccountDetailRequest(
  request: IncomingMessage,
  response: ServerResponse,
  accountId: string,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "PATCH") {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) {
    respond(response, 400, { success: false, error: "Invalid account ID" });
    return;
  }

  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      respond(response, 401, { success: false, error: "Authentication required" });
      return;
    }

    const db = getDatabasePool();
    const access = await db.query(
      `SELECT a.id, a.account_type, a.legal_name, a.display_name, a.country_code, a.status,
              am.status AS membership_status, r.name AS role,
              bp.description, bp.website, bp.contact_information, bp.verification_status
       FROM accounts a
       INNER JOIN account_members am ON am.account_id = a.id
       INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
       LEFT JOIN business_profiles bp ON bp.account_id = a.id
       WHERE a.id = $1 AND am.user_id = $2 AND am.status = 'active'
       LIMIT 1`,
      [accountId, session.user.id],
    );
    if (access.rows.length !== 1) {
      respond(response, 404, { success: false, error: "Business account not found" });
      return;
    }
    const account = access.rows[0];
    if (request.method === "GET") {
      respond(response, 200, { success: true, account });
      return;
    }
    if (!["account_owner", "account_admin"].includes(String(account.role))) {
      respond(response, 403, { success: false, error: "Only the account owner or administrator can edit business details" });
      return;
    }

    const body = await readBody(request);
    if (!isRecord(body)) {
      respond(response, 400, { success: false, error: "Invalid request body" });
      return;
    }
    const legalName = optionalText(body.legalName, 255);
    const displayName = optionalText(body.displayName, 255);
    const countryCode = optionalText(body.countryCode, 2);
    const description = optionalText(body.description, 5000);
    const website = validWebsite(body.website);
    if (legalName === undefined || !legalName || legalName.length < 2 ||
        displayName === undefined || !displayName || displayName.length < 2 ||
        countryCode === undefined || (countryCode !== null && !/^[A-Za-z]{2}$/.test(countryCode)) ||
        description === undefined || website === undefined) {
      respond(response, 400, { success: false, error: "Please check the business name, country code, description, and website" });
      return;
    }

    const rawContact = body.contactInformation;
    if (!isRecord(rawContact)) {
      respond(response, 400, { success: false, error: "Contact information must be an object" });
      return;
    }
    const contactInformation: Record<string, string> = {};
    for (const field of CONTACT_FIELDS) {
      const value = optionalText(rawContact[field], field === "address" ? 500 : 255);
      if (value === undefined) {
        respond(response, 400, { success: false, error: `Invalid ${field} value` });
        return;
      }
      if (value) contactInformation[field] = value;
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE accounts SET legal_name = $2, display_name = $3, country_code = $4, updated_at = NOW()
         WHERE id = $1`,
        [accountId, legalName, displayName, countryCode?.toUpperCase() ?? null],
      );
      await client.query(
        `INSERT INTO business_profiles (account_id, description, website, contact_information, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, NOW())
         ON CONFLICT (account_id) DO UPDATE SET
           description = EXCLUDED.description,
           website = EXCLUDED.website,
           contact_information = EXCLUDED.contact_information,
           updated_at = NOW()`,
        [accountId, description, website, JSON.stringify(contactInformation)],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, metadata)
         VALUES ($1, 'account.business_details_updated', 'account', $2, $2, $3::jsonb)`,
        [session.user.id, accountId, JSON.stringify({ fields: ["legal_name", "display_name", "country_code", "description", "website", "contact_information"] })],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    respond(response, 200, { success: true, message: "Business details updated. Verification status is unchanged." });
  } catch (error) {
    console.error("WASLA business account detail API error:", error);
    const invalidJson = error instanceof SyntaxError;
    const tooLarge = error instanceof Error && error.message === "Request body too large";
    respond(response, tooLarge ? 413 : invalidJson ? 400 : 500, {
      success: false,
      error: tooLarge ? "Request body is too large" : invalidJson ? "Invalid JSON body" : "Could not process business account request",
    });
  }
}
