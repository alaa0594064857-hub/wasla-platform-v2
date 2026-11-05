import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

type Json = Record<string, unknown>;

function respond(response: ServerResponse, status: number, data: Json): void {
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
    if (size > 12_000) throw new Error("Request body too large");
    body += chunk.toString();
  }
  return JSON.parse(body);
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Relationship storage is separate from account membership and never grants business access. */
export async function ensureNetworkTables(): Promise<void> {
  const db = getDatabasePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS network_friendships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      requester_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status varchar(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      accepted_at timestamptz,
      CONSTRAINT network_friendships_not_self CHECK (requester_user_id <> addressee_user_id),
      CONSTRAINT network_friendships_pair_unique UNIQUE (requester_user_id, addressee_user_id)
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS network_friendships_requester_status_idx
    ON network_friendships (requester_user_id, status, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS network_friendships_addressee_status_idx
    ON network_friendships (addressee_user_id, status, created_at DESC)
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS network_account_follows (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT network_account_follows_unique UNIQUE (user_id, account_id)
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS network_account_follows_user_created_idx
    ON network_account_follows (user_id, created_at DESC)
  `);
}

export async function handleNetworkRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }

  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      respond(response, 401, { success: false, error: "Authentication required" });
      return;
    }

    await ensureNetworkTables();
    const db = getDatabasePool();
    const userId = session.user.id;

    if (request.method === "GET") {
      const url = new URL(request.url ?? "/api/network", "http://localhost");
      const search = (url.searchParams.get("search") ?? "").trim().slice(0, 80);
      const [friends, incomingRequests, outgoingRequests, followingAccounts, people, businesses] = await Promise.all([
        db.query(
          `SELECT f.id, u.id AS user_id, COALESCE(p.display_name, u.name) AS display_name,
                  COALESCE(p.avatar_reference, u.image) AS avatar_reference, f.accepted_at
           FROM network_friendships f
           JOIN users u ON u.id = CASE WHEN f.requester_user_id = $1 THEN f.addressee_user_id ELSE f.requester_user_id END
           LEFT JOIN profiles p ON p.user_id = u.id
           WHERE (f.requester_user_id = $1 OR f.addressee_user_id = $1) AND f.status = 'accepted'
           ORDER BY f.accepted_at DESC NULLS LAST LIMIT 100`,
          [userId],
        ),
        db.query(
          `SELECT f.id, u.id AS user_id, COALESCE(p.display_name, u.name) AS display_name,
                  COALESCE(p.avatar_reference, u.image) AS avatar_reference, f.created_at
           FROM network_friendships f
           JOIN users u ON u.id = f.requester_user_id
           LEFT JOIN profiles p ON p.user_id = u.id
           WHERE f.addressee_user_id = $1 AND f.status = 'pending'
           ORDER BY f.created_at DESC LIMIT 50`,
          [userId],
        ),
        db.query(
          `SELECT f.id, u.id AS user_id, COALESCE(p.display_name, u.name) AS display_name,
                  COALESCE(p.avatar_reference, u.image) AS avatar_reference, f.created_at
           FROM network_friendships f
           JOIN users u ON u.id = f.addressee_user_id
           LEFT JOIN profiles p ON p.user_id = u.id
           WHERE f.requester_user_id = $1 AND f.status = 'pending'
           ORDER BY f.created_at DESC LIMIT 50`,
          [userId],
        ),
        db.query(
          `SELECT a.id AS account_id, a.display_name, a.account_type, a.country_code, nf.created_at
           FROM network_account_follows nf
           JOIN accounts a ON a.id = nf.account_id
           WHERE nf.user_id = $1 AND a.status = 'active'
           ORDER BY nf.created_at DESC LIMIT 100`,
          [userId],
        ),
        db.query(
          `SELECT u.id AS user_id, COALESCE(p.display_name, u.name) AS display_name,
                  COALESCE(p.avatar_reference, u.image) AS avatar_reference,
                  CASE
                    WHEN EXISTS (SELECT 1 FROM network_friendships x WHERE x.status = 'accepted'
                      AND ((x.requester_user_id = $1 AND x.addressee_user_id = u.id)
                        OR (x.requester_user_id = u.id AND x.addressee_user_id = $1))) THEN 'friend'
                    WHEN EXISTS (SELECT 1 FROM network_friendships x WHERE x.status = 'pending'
                      AND x.requester_user_id = $1 AND x.addressee_user_id = u.id) THEN 'outgoing'
                    WHEN EXISTS (SELECT 1 FROM network_friendships x WHERE x.status = 'pending'
                      AND x.requester_user_id = u.id AND x.addressee_user_id = $1) THEN 'incoming'
                    ELSE 'none'
                  END AS relationship
           FROM users u
           LEFT JOIN profiles p ON p.user_id = u.id
           WHERE u.id <> $1 AND u.status = 'active'
             AND ($2 = '' OR COALESCE(p.display_name, u.name) ILIKE '%' || $2 || '%')
           ORDER BY CASE WHEN $2 = '' THEN u.created_at END DESC,
                    COALESCE(p.display_name, u.name) ASC
           LIMIT 20`,
          [userId, search],
        ),
        db.query(
          `SELECT a.id AS account_id, a.display_name, a.account_type, a.country_code,
                  EXISTS (SELECT 1 FROM network_account_follows nf
                    WHERE nf.user_id = $1 AND nf.account_id = a.id) AS is_following
           FROM accounts a
           WHERE a.status = 'active'
             AND NOT EXISTS (SELECT 1 FROM account_members am
               WHERE am.user_id = $1 AND am.account_id = a.id AND am.status = 'active')
             AND ($2 = '' OR a.display_name ILIKE '%' || $2 || '%')
           ORDER BY a.created_at DESC LIMIT 20`,
          [userId, search],
        ),
      ]);

      respond(response, 200, {
        success: true,
        network: {
          friends: friends.rows,
          incomingRequests: incomingRequests.rows,
          outgoingRequests: outgoingRequests.rows,
          followingAccounts: followingAccounts.rows,
          people: people.rows,
          businesses: businesses.rows,
        },
      });
      return;
    }

    const body = await readBody(request);
    if (!isObject(body) || typeof body.action !== "string") {
      respond(response, 400, { success: false, error: "Invalid network action" });
      return;
    }

    const action = body.action;
    if (action === "friend_request") {
      if (!isUuid(body.userId) || body.userId === userId) {
        respond(response, 400, { success: false, error: "Choose a valid member" });
        return;
      }
      const target = body.userId;
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query(
          `SELECT id, requester_user_id, addressee_user_id, status
           FROM network_friendships
           WHERE (requester_user_id = $1 AND addressee_user_id = $2)
              OR (requester_user_id = $2 AND addressee_user_id = $1)
           FOR UPDATE`,
          [userId, target],
        );
        const rows = existing.rows as Array<{ id: string; requester_user_id: string; addressee_user_id: string; status: string }>;
        const accepted = rows.find(row => row.status === "accepted");
        if (accepted) {
          await client.query("COMMIT");
          respond(response, 200, { success: true, relationship: "friend" });
          return;
        }
        const incoming = rows.find(row => row.requester_user_id === target && row.addressee_user_id === userId && row.status === "pending");
        if (incoming) {
          await client.query(
            "UPDATE network_friendships SET status = 'accepted', accepted_at = NOW(), updated_at = NOW() WHERE id = $1",
            [incoming.id],
          );
          await client.query("COMMIT");
          respond(response, 200, { success: true, relationship: "friend", message: "Friend request accepted" });
          return;
        }
        const outgoing = rows.find(row => row.requester_user_id === userId && row.addressee_user_id === target && row.status === "pending");
        if (outgoing) {
          await client.query("COMMIT");
          respond(response, 200, { success: true, relationship: "outgoing" });
          return;
        }
        const ownPrevious = rows.find(row => row.requester_user_id === userId && row.addressee_user_id === target);
        if (ownPrevious) {
          await client.query(
            "UPDATE network_friendships SET status = 'pending', created_at = NOW(), updated_at = NOW(), accepted_at = NULL WHERE id = $1",
            [ownPrevious.id],
          );
        } else {
          await client.query(
            "INSERT INTO network_friendships (requester_user_id, addressee_user_id) VALUES ($1, $2)",
            [userId, target],
          );
        }
        await client.query("COMMIT");
        respond(response, 200, { success: true, relationship: "outgoing" });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return;
    }

    if (action === "accept_request" || action === "decline_request" || action === "cancel_request") {
      if (!isUuid(body.userId)) {
        respond(response, 400, { success: false, error: "Choose a valid member" });
        return;
      }
      const isIncomingAction = action === "accept_request" || action === "decline_request";
      const result = await db.query(
        `UPDATE network_friendships
         SET status = $1, accepted_at = CASE WHEN $1 = 'accepted' THEN NOW() ELSE NULL END, updated_at = NOW()
         WHERE requester_user_id = $2 AND addressee_user_id = $3 AND status = 'pending'
         RETURNING id`,
        [action === "accept_request" ? "accepted" : action === "decline_request" ? "declined" : "cancelled",
          isIncomingAction ? body.userId : userId,
          isIncomingAction ? userId : body.userId],
      );
      if (!result.rowCount) {
        respond(response, 404, { success: false, error: "Pending request not found" });
        return;
      }
      respond(response, 200, { success: true });
      return;
    }

    if (action === "remove_friend") {
      if (!isUuid(body.userId)) {
        respond(response, 400, { success: false, error: "Choose a valid member" });
        return;
      }
      await db.query(
        `DELETE FROM network_friendships
         WHERE status = 'accepted'
           AND ((requester_user_id = $1 AND addressee_user_id = $2)
             OR (requester_user_id = $2 AND addressee_user_id = $1))`,
        [userId, body.userId],
      );
      respond(response, 200, { success: true });
      return;
    }

    if (action === "follow_account" || action === "unfollow_account") {
      if (!isUuid(body.accountId)) {
        respond(response, 400, { success: false, error: "Choose a valid business" });
        return;
      }
      if (action === "follow_account") {
        const account = await db.query(
          "SELECT id FROM accounts WHERE id = $1 AND status = 'active'",
          [body.accountId],
        );
        if (!account.rowCount) {
          respond(response, 404, { success: false, error: "Business not found" });
          return;
        }
        await db.query(
          "INSERT INTO network_account_follows (user_id, account_id) VALUES ($1, $2) ON CONFLICT (user_id, account_id) DO NOTHING",
          [userId, body.accountId],
        );
      } else {
        await db.query(
          "DELETE FROM network_account_follows WHERE user_id = $1 AND account_id = $2",
          [userId, body.accountId],
        );
      }
      respond(response, 200, { success: true });
      return;
    }

    respond(response, 400, { success: false, error: "Unknown network action" });
  } catch (error) {
    console.error("WASLA network API error:", error);
    const tooLarge = error instanceof Error && error.message === "Request body too large";
    respond(response, tooLarge ? 413 : 500, {
      success: false,
      error: tooLarge ? "Request is too large" : "Could not process network request",
    });
  }
}
