import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

function reply(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });
  response.end(JSON.stringify(data));
}

/** Read-only, permission-gated user directory for the platform console. */
export async function handlePlatformUsersRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET") {
    reply(response, 405, { success: false, error: "Method not allowed" });
    return;
  }

  try {
    const access = await authorizePlatformPermission(request, response, "platform.users.read");
    if (!access) return;

    const url = new URL(request.url ?? "/api/platform/users", "http://localhost");
    const rawPage = url.searchParams.get("page") ?? "1";
    const rawLimit = url.searchParams.get("limit") ?? "25";
    const page = /^\d+$/.test(rawPage) ? Number(rawPage) : 0;
    const limit = /^\d+$/.test(rawLimit) ? Number(rawLimit) : 0;
    const search = (url.searchParams.get("search") ?? "").trim().slice(0, 120);

    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      reply(response, 400, { success: false, error: "Invalid pagination parameters" });
      return;
    }

    const pool = getDatabasePool();
    const pattern = search || null;
    const count = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM users u
       WHERE ($1::text IS NULL OR POSITION(LOWER($1) IN LOWER(u.name)) > 0 OR POSITION(LOWER($1) IN LOWER(u.email)) > 0)`,
      [pattern],
    );
    const rows = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.email_verified,
         u.status,
         u.registration_type,
         u.preferred_locale,
         u.created_at,
         EXISTS (
           SELECT 1
           FROM platform_role_assignments pra
           INNER JOIN roles r ON r.id = pra.role_id AND r.scope_type = 'platform'
           WHERE pra.user_id = u.id
             AND pra.status = 'active'
             AND r.name = 'platform_owner'
         ) AS is_platform_owner
       FROM users u
       WHERE ($1::text IS NULL OR POSITION(LOWER($1) IN LOWER(u.name)) > 0 OR POSITION(LOWER($1) IN LOWER(u.email)) > 0)
       ORDER BY u.created_at DESC, u.id
       LIMIT $2 OFFSET $3`,
      [pattern, limit, (page - 1) * limit],
    );

    reply(response, 200, {
      success: true,
      users: rows.rows,
      pagination: {
        page,
        limit,
        total: Number(count.rows[0]?.total ?? 0),
        totalPages: Math.ceil(Number(count.rows[0]?.total ?? 0) / limit),
      },
    });
  } catch (error) {
    console.error("WASLA platform users API error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Could not load platform users" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
