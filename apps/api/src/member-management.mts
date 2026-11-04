import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";

import { fromNodeHeaders } from "better-auth/node";

import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

const MANAGEABLE_ROLES = [
  "account_manager",
  "account_employee",
  "account_viewer",
] as const;

type ManageableRole = (typeof MANAGEABLE_ROLES)[number];

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

export async function handleMemberManagement(
  request: IncomingMessage,
  response: ServerResponse,
  accountId: string,
  membershipId: string,
): Promise<void> {
  if (request.method !== "PATCH") {
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

    const body = await readBody(request);

    if (!isObject(body)) {
      respond(response, 400, {
        success: false,
        error: "Invalid request body",
      });
      return;
    }

    const hasRole = Object.hasOwn(body, "role");
    const hasStatus = Object.hasOwn(body, "status");

    if (
      Number(hasRole) + Number(hasStatus) !== 1
    ) {
      respond(response, 400, {
        success: false,
        error: "Provide exactly one field: role or status",
      });
      return;
    }

    if (
      hasRole &&
      (
        typeof body.role !== "string" ||
        !MANAGEABLE_ROLES.includes(
          body.role as ManageableRole,
        )
      )
    ) {
      respond(response, 400, {
        success: false,
        error: "Invalid member role",
      });
      return;
    }

    if (
      hasStatus &&
      !["active", "suspended"].includes(
        String(body.status),
      )
    ) {
      respond(response, 400, {
        success: false,
        error: "Status must be active or suspended",
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
        role: string;
      }>(
        `SELECT
           am.id,
           am.user_id,
           am.status,
           r.name AS role
         FROM account_members am
         INNER JOIN roles r
           ON r.id = am.role_id
          AND r.scope_type = am.role_scope
         WHERE am.id = $1
           AND am.account_id = $2
         FOR UPDATE OF am`,
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

      const member = membershipResult.rows[0];

      if (
        !["account_manager", "account_employee", "account_viewer"].includes(
          member.role,
        )
      ) {
        await client.query("ROLLBACK");

        respond(response, 403, {
          success: false,
          error: "Owner and administrator memberships cannot be changed here",
        });
        return;
      }

      if (
        member.status !== "active" &&
        member.status !== "suspended"
      ) {
        await client.query("ROLLBACK");

        respond(response, 409, {
          success: false,
          error: "Only active or suspended memberships can be changed",
        });
        return;
      }

      const permissionKey = hasRole
        ? "account.member.update"
        : "account.member.remove";

      const access = await client.query<{
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
          permissionKey,
        ],
      );

      if (
        access.rows.length === 0 ||
        !["account_owner", "account_admin"].includes(
          access.rows[0].role,
        )
      ) {
        await client.query("ROLLBACK");

        respond(response, 403, {
          success: false,
          error: "Only account owners and administrators can manage members",
        });
        return;
      }

      let auditAction: string;
      let newValue: string;

      if (hasRole) {
        const roleResult = await client.query<{
          id: string;
        }>(
          `SELECT id
           FROM roles
           WHERE name = $1
             AND scope_type = 'account'
           LIMIT 1`,
          [body.role],
        );

        if (roleResult.rows.length !== 1) {
          throw new Error("Requested role is not configured");
        }

        await client.query(
          `UPDATE account_members
           SET role_id = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [roleResult.rows[0].id, membershipId],
        );

        auditAction = "account.member.role_updated";
        newValue = String(body.role);
      } else {
        const status = String(body.status);

        if (member.status === status) {
          await client.query("ROLLBACK");

          respond(response, 409, {
            success: false,
            error: "Membership already has this status",
          });
          return;
        }

        await client.query(
          `UPDATE account_members
           SET status = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [status, membershipId],
        );

        auditAction = status === "suspended"
          ? "account.member.suspended"
          : "account.member.reactivated";

        newValue = status;
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
          auditAction,
          "account_member",
          membershipId,
          accountId,
          JSON.stringify({
            memberUserId: member.user_id,
            previousRole: member.role,
            previousStatus: member.status,
            newValue,
          }),
        ],
      );

      await client.query("COMMIT");

      respond(response, 200, {
        success: true,
        message: "Member updated successfully",
        membershipId,
        updatedField: hasRole ? "role" : "status",
        value: newValue,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA member management error:", error);

    if (!response.headersSent) {
      respond(response, 500, {
        success: false,
        error: "Could not update member",
      });
    }
  }
}
