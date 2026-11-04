import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";

import { fromNodeHeaders } from "better-auth/node";

import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

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

export async function handleInvitationsRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET") {
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

    const result = await pool.query(
      `SELECT
         am.id AS membership_id,
         am.account_id,
         am.status,
         am.created_at AS invited_at,
         a.account_type,
         a.legal_name,
         a.display_name,
         a.country_code,
         r.name AS role,
         inviter.name AS invited_by_name,
         inviter.email AS invited_by_email
       FROM account_members am
       INNER JOIN accounts a
         ON a.id = am.account_id
       INNER JOIN roles r
         ON r.id = am.role_id
        AND r.scope_type = am.role_scope
       LEFT JOIN users inviter
         ON inviter.id = am.invited_by
       WHERE am.user_id = $1
         AND am.status = 'invited'
         AND am.role_scope = 'account'
       ORDER BY am.created_at DESC`,
      [session.user.id],
    );

    respond(response, 200, {
      success: true,
      invitations: result.rows,
    });
  } catch (error) {
    console.error("WASLA invitations API error:", error);

    if (!response.headersSent) {
      respond(response, 500, {
        success: false,
        error: "Could not load invitations",
      });
    }
  }
}
