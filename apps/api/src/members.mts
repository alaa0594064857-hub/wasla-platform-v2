import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";

import { fromNodeHeaders } from "better-auth/node";

import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

const ALLOWED_INVITE_ROLES = [
  "account_manager",
  "account_employee",
  "account_viewer",
] as const;

type InviteRole = (typeof ALLOWED_INVITE_ROLES)[number];

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

    if (size > 10_000) {
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

export async function handleMembersRequest(
  request: IncomingMessage,
  response: ServerResponse,
  accountId: string,
): Promise<void> {
  if (!["GET", "POST"].includes(request.method ?? "")) {
    respond(response, 405, {
      success: false,
      error: "Method not allowed",
    });
    return;
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      accountId,
    )
  ) {
    respond(response, 400, {
      success: false,
      error: "Invalid account ID",
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

    const requiredPermission =
      request.method === "GET"
        ? "account.member.read"
        : "account.member.invite";

    const access = await pool.query<{
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
         AND p.permission_key = $3
       LIMIT 1`,
      [
        accountId,
        session.user.id,
        requiredPermission,
      ],
    );

    if (access.rows.length === 0) {
      respond(response, 403, {
        success: false,
        error: "You do not have permission to perform this action",
      });
      return;
    }

    if (request.method === "GET") {
      const result = await pool.query(
        `SELECT
           am.id AS membership_id,
           u.id AS user_id,
           u.name,
           u.email,
           am.status,
           r.name AS role,
           am.joined_at,
           am.created_at
         FROM account_members am
         INNER JOIN users u
           ON u.id = am.user_id
         INNER JOIN roles r
           ON r.id = am.role_id
          AND r.scope_type = am.role_scope
         WHERE am.account_id = $1
         ORDER BY am.created_at ASC`,
        [accountId],
      );

      respond(response, 200, {
        success: true,
        members: result.rows,
      });

      return;
    }

    // Only account owners and administrators may invite.
    if (
      !["account_owner", "account_admin"].includes(
        access.rows[0].role,
      )
    ) {
      respond(response, 403, {
        success: false,
        error: "Only account owners and administrators can invite members",
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

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const role =
      typeof body.role === "string"
        ? body.role
        : "";

    if (
      email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      respond(response, 400, {
        success: false,
        error: "A valid email address is required",
      });
      return;
    }

    if (
      !ALLOWED_INVITE_ROLES.includes(
        role as InviteRole,
      )
    ) {
      respond(response, 400, {
        success: false,
        error: "Invalid invitation role",
      });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const userResult = await client.query<{
        id: string;
        name: string;
        email: string;
      }>(
        `SELECT id, name, email
         FROM users
         WHERE LOWER(email) = $1
           AND status = 'active'
           AND email_verified = TRUE
         LIMIT 1`,
        [email],
      );

      if (userResult.rows.length === 0) {
        await client.query("ROLLBACK");

        respond(response, 404, {
          success: false,
          error: "No active verified WASLA user exists with this email",
        });

        return;
      }

      const targetUser = userResult.rows[0];

      const roleResult = await client.query<{
        id: string;
      }>(
        `SELECT id
         FROM roles
         WHERE name = $1
           AND scope_type = 'account'
         LIMIT 1`,
        [role],
      );

      if (roleResult.rows.length !== 1) {
        throw new Error("Invitation role is not configured");
      }

      const existing = await client.query<{
        id: string;
        status: string;
      }>(
        `SELECT id, status
         FROM account_members
         WHERE account_id = $1
           AND user_id = $2
         FOR UPDATE`,
        [accountId, targetUser.id],
      );

      if (
        existing.rows.length > 0 &&
        ["active", "invited", "suspended"].includes(
          existing.rows[0].status,
        )
      ) {
        await client.query("ROLLBACK");

        respond(response, 409, {
          success: false,
          error: "This user already has an account membership",
        });

        return;
      }

      let membership;

      if (existing.rows.length > 0) {
        const restored = await client.query(
          `UPDATE account_members
           SET role_id = $1,
               status = 'invited',
               invited_by = $2,
               joined_at = NULL,
               updated_at = NOW()
           WHERE id = $3
           RETURNING id, status`,
          [
            roleResult.rows[0].id,
            session.user.id,
            existing.rows[0].id,
          ],
        );

        membership = restored.rows[0];
      } else {
        const inserted = await client.query(
          `INSERT INTO account_members (
             account_id,
             user_id,
             role_id,
             role_scope,
             status,
             invited_by
           )
           VALUES ($1, $2, $3, 'account', 'invited', $4)
           RETURNING id, status`,
          [
            accountId,
            targetUser.id,
            roleResult.rows[0].id,
            session.user.id,
          ],
        );

        membership = inserted.rows[0];
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
          "account.member.invited",
          "account_member",
          membership.id,
          accountId,
          JSON.stringify({
            invitedUserId: targetUser.id,
            invitedEmail: targetUser.email,
            assignedRole: role,
          }),
        ],
      );

      await client.query(
        `INSERT INTO notifications (
           user_id, type, title_ar, title_en, body_ar, body_en,
           action_url, resource_id, metadata
         )
         VALUES ($1, 'account_invitation', 'دعوة جديدة للانضمام إلى حساب', 'New business account invitation',
                 $2, $3, '/invitations', $4, $5::jsonb)`,
        [
          targetUser.id,
          `تمت دعوتك للانضمام إلى حساب تجاري بدور ${role}.`,
          `You have been invited to join a business account as ${role}.`,
          membership.id,
          JSON.stringify({ accountId, membershipId: membership.id, assignedRole: role }),
        ],
      );

      await client.query("COMMIT");

      respond(response, 201, {
        success: true,
        message: "Member invitation created",
        member: {
          membershipId: membership.id,
          userId: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          role,
          status: membership.status,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA members API error:", error);

    if (!response.headersSent) {
      respond(response, 500, {
        success: false,
        error: "Could not process member request",
      });
    }
  }
}
