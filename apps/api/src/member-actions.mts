import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";

import { fromNodeHeaders } from "better-auth/node";

import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

type Action = "accept" | "revoke";

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

export async function handleMemberAction(
  request: IncomingMessage,
  response: ServerResponse,
  accountId: string,
  membershipId: string,
  action: Action,
): Promise<void> {
  if (request.method !== "POST") {
    respond(response, 405, {
      success: false,
      error: "Method not allowed",
    });
    return;
  }

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (
    !uuidPattern.test(accountId) ||
    !uuidPattern.test(membershipId)
  ) {
    respond(response, 400, {
      success: false,
      error: "Invalid account or membership ID",
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
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const membershipResult = await client.query<{
        id: string;
        user_id: string;
        status: string;
      }>(
        `SELECT id, user_id, status
         FROM account_members
         WHERE id = $1
           AND account_id = $2
         FOR UPDATE`,
        [membershipId, accountId],
      );

      if (membershipResult.rows.length === 0) {
        await client.query("ROLLBACK");

        respond(response, 404, {
          success: false,
          error: "Membership not found",
        });
        return;
      }

      const membership = membershipResult.rows[0];

      if (membership.status !== "invited") {
        await client.query("ROLLBACK");

        respond(response, 409, {
          success: false,
          error: "This invitation is no longer pending",
        });
        return;
      }

      if (action === "accept") {
        if (membership.user_id !== session.user.id) {
          await client.query("ROLLBACK");

          respond(response, 403, {
            success: false,
            error: "Only the invited user can accept this invitation",
          });
          return;
        }

        await client.query(
          `UPDATE account_members
           SET status = 'active',
               joined_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [membershipId],
        );
      } else {
        const permission = await client.query<{
          role: string;
        }>(
          `SELECT r.name AS role
           FROM account_members am
           INNER JOIN roles r
             ON r.id = am.role_id
            AND r.scope_type = am.role_scope
           INNER JOIN role_permissions rp
             ON rp.role_id = r.id
            AND rp.scope_type = r.scope_type
           INNER JOIN permissions p
             ON p.id = rp.permission_id
            AND p.scope_type = rp.scope_type
           WHERE am.account_id = $1
             AND am.user_id = $2
             AND am.status = 'active'
             AND p.permission_key = 'account.member.remove'
           LIMIT 1`,
          [accountId, session.user.id],
        );

        if (
          permission.rows.length === 0 ||
          !["account_owner", "account_admin"].includes(
            permission.rows[0].role,
          )
        ) {
          await client.query("ROLLBACK");

          respond(response, 403, {
            success: false,
            error: "Only account owners and administrators can revoke invitations",
          });
          return;
        }

        await client.query(
          `UPDATE account_members
           SET status = 'revoked',
               updated_at = NOW()
           WHERE id = $1`,
          [membershipId],
        );
      }

      await client.query(
        `INSERT INTO audit_logs (
           actor_user_id,
           action,
           resource_type,
           resource_id,
           account_id,
           metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          session.user.id,
          action === "accept"
            ? "account.member.accepted"
            : "account.member.invitation_revoked",
          "account_member",
          membershipId,
          accountId,
          JSON.stringify({
            memberUserId: membership.user_id,
          }),
        ],
      );

      await client.query("COMMIT");

      respond(response, 200, {
        success: true,
        message: action === "accept"
          ? "Invitation accepted successfully"
          : "Invitation revoked successfully",
        membershipId,
        status: action === "accept" ? "active" : "revoked",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA member action error:", error);

    if (!response.headersSent) {
      respond(response, 500, {
        success: false,
        error: "Could not process membership action",
      });
    }
  }
}
