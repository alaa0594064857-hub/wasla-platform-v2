import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";

import { fromNodeHeaders } from "better-auth/node";

import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

const ACCOUNT_TYPES = [
  "company",
  "supplier",
  "manufacturer",
  "trader",
  "brand",
] as const;

function respond(
  response: ServerResponse,
  status: number,
  data: Record<string, unknown>,
): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  response.end(JSON.stringify(data));
}

async function readBody(
  request: IncomingMessage,
): Promise<unknown> {
  let body = "";
  let size = 0;

  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);

    if (size > 15_000) {
      throw new Error("Request body too large");
    }

    body += chunk.toString();
  }

  return JSON.parse(body);
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function handleAccountsRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (
    request.method !== "GET" &&
    request.method !== "POST"
  ) {
    respond(response, 405, {
      success: false,
      error: "Method not allowed",
    });
    return;
  }

  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session) {
      respond(response, 401, {
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const pool = getDatabasePool();

    if (request.method === "GET") {
      const result = await pool.query(
        `SELECT
           a.id,
           a.account_type,
           a.legal_name,
           a.display_name,
           a.status,
           a.country_code,
           am.status AS membership_status,
           r.name AS role,
           bp.description,
           bp.website,
           bp.verification_status
         FROM account_members am
         INNER JOIN accounts a
           ON a.id = am.account_id
         INNER JOIN roles r
           ON r.id = am.role_id
          AND r.scope_type = am.role_scope
         LEFT JOIN business_profiles bp
           ON bp.account_id = a.id
         INNER JOIN role_permissions rp
           ON rp.role_id = r.id
          AND rp.scope_type = r.scope_type
         INNER JOIN permissions p
           ON p.id = rp.permission_id
          AND p.scope_type = rp.scope_type
         WHERE am.user_id = $1
           AND am.status = 'active'
           AND p.permission_key = 'account.read'
         ORDER BY a.created_at DESC`,
        [session.user.id],
      );

      const accounts = result.rows.filter(
        (row, index, rows) =>
          rows.findIndex(
            (item) => item.id === row.id,
          ) === index,
      );

      respond(response, 200, {
        success: true,
        accounts,
      });

      return;
    }

    const body = await readBody(request);

    if (!isObject(body)) {
      respond(response, 400, {
        success: false,
        error: "Invalid request body",
      });
      return;
    }

    const {
      accountType,
      legalName,
      displayName,
      countryCode,
      description,
      website,
    } = body;

    if (
      typeof accountType !== "string" ||
      !ACCOUNT_TYPES.includes(
        accountType as (typeof ACCOUNT_TYPES)[number],
      )
    ) {
      respond(response, 400, {
        success: false,
        error: "Invalid account type",
      });
      return;
    }

    if (
      typeof legalName !== "string" ||
      legalName.trim().length < 2 ||
      legalName.trim().length > 255
    ) {
      respond(response, 400, {
        success: false,
        error: "Legal name must be between 2 and 255 characters",
      });
      return;
    }

    if (
      typeof displayName !== "string" ||
      displayName.trim().length < 2 ||
      displayName.trim().length > 255
    ) {
      respond(response, 400, {
        success: false,
        error: "Display name must be between 2 and 255 characters",
      });
      return;
    }

    if (
      countryCode !== undefined &&
      countryCode !== null &&
      (
        typeof countryCode !== "string" ||
        !/^[A-Za-z]{2}$/.test(countryCode)
      )
    ) {
      respond(response, 400, {
        success: false,
        error: "Country code must contain two letters",
      });
      return;
    }

    if (
      description !== undefined &&
      description !== null &&
      (
        typeof description !== "string" ||
        description.length > 5000
      )
    ) {
      respond(response, 400, {
        success: false,
        error: "Invalid business description",
      });
      return;
    }

    if (
      website !== undefined &&
      website !== null &&
      (
        typeof website !== "string" ||
        website.length > 2048
      )
    ) {
      respond(response, 400, {
        success: false,
        error: "Invalid website",
      });
      return;
    }

    if (
      typeof website === "string" &&
      website.trim() !== ""
    ) {
      try {
        const parsedWebsite = new URL(website);

        if (
          parsedWebsite.protocol !== "https:" &&
          parsedWebsite.protocol !== "http:"
        ) {
          throw new Error("Invalid protocol");
        }
      } catch {
        respond(response, 400, {
          success: false,
          error: "Website must be a valid HTTP or HTTPS URL",
        });
        return;
      }
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const ownerRole = await client.query<{
        id: string;
      }>(
        `SELECT id
         FROM roles
         WHERE name = 'account_owner'
           AND scope_type = 'account'
         LIMIT 1`,
      );

      if (ownerRole.rows.length !== 1) {
        throw new Error(
          "Account owner role is not configured",
        );
      }

      const accountResult = await client.query<{
        id: string;
        account_type: string;
        legal_name: string;
        display_name: string;
        status: string;
        country_code: string | null;
      }>(
        `INSERT INTO accounts (
           account_type,
           legal_name,
           display_name,
           country_code
         )
         VALUES ($1, $2, $3, $4)
         RETURNING
           id,
           account_type,
           legal_name,
           display_name,
           status,
           country_code`,
        [
          accountType,
          legalName.trim(),
          displayName.trim(),
          typeof countryCode === "string"
            ? countryCode.toUpperCase()
            : null,
        ],
      );

      const account = accountResult.rows[0];

      await client.query(
        `INSERT INTO business_profiles (
           account_id,
           description,
           website
         )
         VALUES ($1, $2, $3)`,
        [
          account.id,
          typeof description === "string"
            ? description.trim()
            : null,
          typeof website === "string" && website.trim()
            ? website.trim()
            : null,
        ],
      );

      await client.query(
        `INSERT INTO account_members (
           account_id,
           user_id,
           role_id,
           role_scope,
           status,
           invited_by,
           joined_at
         )
         VALUES ($1, $2, $3, 'account', 'active', $2, NOW())`,
        [
          account.id,
          session.user.id,
          ownerRole.rows[0].id,
        ],
      );

      await client.query(
        `INSERT INTO audit_logs (
           actor_user_id,
           action,
           resource_type,
           resource_id,
           account_id,
           metadata
         )
         VALUES ($1, $2, $3, $4, $4, $5)`,
        [
          session.user.id,
          "account.created",
          "account",
          account.id,
          JSON.stringify({
            accountType,
            ownerUserId: session.user.id,
          }),
        ],
      );

      await client.query("COMMIT");

      respond(response, 201, {
        success: true,
        message: "Business account created",
        account: {
          ...account,
          role: "account_owner",
          membershipStatus: "active",
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA accounts API error:", error);

    respond(response, 500, {
      success: false,
      error: "Could not process business account request",
    });
  }
}
