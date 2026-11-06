import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

export type PlatformAuthorization = {
  userId: string;
  roleNames: string[];
  permissions: string[];
};

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

/**
 * Server-side, deny-by-default platform authorization.
 * Never trusts role names, IDs, or permission claims supplied by the client.
 */
export async function authorizePlatformPermission(
  request: IncomingMessage,
  response: ServerResponse,
  requiredPermission: string,
): Promise<PlatformAuthorization | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });

  if (!session) {
    reply(response, 401, { success: false, error: "Authentication required" });
    return null;
  }

  const result = await getDatabasePool().query<{
    user_id: string;
    role_name: string;
    permission_key: string;
  }>(
    `SELECT u.id AS user_id, r.name AS role_name, p.permission_key
     FROM users u
     INNER JOIN platform_role_assignments pra
       ON pra.user_id = u.id AND pra.status = 'active' AND pra.role_scope = 'platform'
     INNER JOIN roles r
       ON r.id = pra.role_id AND r.scope_type = 'platform'
     INNER JOIN role_permissions rp
       ON rp.role_id = r.id AND rp.scope_type = 'platform'
     INNER JOIN permissions p
       ON p.id = rp.permission_id AND p.scope_type = 'platform'
     WHERE u.id = $1
       AND u.status = 'active'
       AND u.email_verified = TRUE
     ORDER BY r.name, p.permission_key`,
    [session.user.id],
  );

  const permissions = [...new Set(result.rows.map((row) => row.permission_key))];
  const roleNames = [...new Set(result.rows.map((row) => row.role_name))];

  if (!permissions.includes(requiredPermission)) {
    reply(response, 403, { success: false, error: "Insufficient platform permissions" });
    return null;
  }

  return { userId: session.user.id, roleNames, permissions };
}

/** Protected diagnostic endpoint; reveals only the caller's own effective platform access. */
export async function handlePlatformSecurityRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET") {
    reply(response, 405, { success: false, error: "Method not allowed" });
    return;
  }

  try {
    const access = await authorizePlatformPermission(request, response, "platform.security.read");
    if (!access) return;

    reply(response, 200, {
      success: true,
      platformAccess: {
        roles: access.roleNames,
        permissions: access.permissions,
      },
    });
  } catch (error) {
    console.error("WASLA platform authorization error:", error);
    if (!response.headersSent) {
      reply(response, 500, { success: false, error: "Platform security service error" });
    } else {
      response.destroy(error instanceof Error ? error : undefined);
    }
  }
}
