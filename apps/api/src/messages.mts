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
    if (size > 12_000) throw new Error("Request body too large");
    body += chunk.toString();
  }
  return JSON.parse(body);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function ensureMessagesTables(): Promise<void> {
  const db = getDatabasePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS message_conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      participant_low uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      participant_high uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      participant_low_last_read_at timestamptz,
      participant_high_last_read_at timestamptz,
      CONSTRAINT message_conversations_distinct CHECK (participant_low < participant_high),
      CONSTRAINT message_conversations_pair_unique UNIQUE (participant_low, participant_high)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid NOT NULL REFERENCES message_conversations(id) ON DELETE CASCADE,
      sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`ALTER TABLE message_conversations ADD COLUMN IF NOT EXISTS participant_low_last_read_at timestamptz`);
  await db.query(`ALTER TABLE message_conversations ADD COLUMN IF NOT EXISTS participant_high_last_read_at timestamptz`);
  await db.query(`CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages (conversation_id, created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS message_conversations_low_updated_idx ON message_conversations (participant_low, updated_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS message_conversations_high_updated_idx ON message_conversations (participant_high, updated_at DESC)`);
}

export async function handleMessagesRequest(
  request: IncomingMessage,
  response: ServerResponse,
  conversationId?: string,
): Promise<void> {
  if (!["GET", "POST"].includes(request.method ?? "")) {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }

  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      respond(response, 401, { success: false, error: "Authentication required" });
      return;
    }

    const db = getDatabasePool();
    const userId = session.user.id;

    if (!conversationId && request.method === "GET") {
      const url = new URL(request.url ?? "/api/messages", "http://localhost");
      if (url.searchParams.has("recipients")) {
        const query = (url.searchParams.get("recipients") ?? "").trim().slice(0, 80);
        if (query.length < 2) {
          respond(response, 200, { success: true, recipients: [] });
          return;
        }
        const pattern = `%${query}%`;
        const matches = await db.query(
          `WITH account_contacts AS (
             SELECT u.id AS recipient_id, a.display_name,
                    'business'::text AS entity_type, a.account_type::text AS category,
                    ROW_NUMBER() OVER (
                      PARTITION BY a.id
                      ORDER BY CASE r.name WHEN 'account_owner' THEN 0 WHEN 'account_admin' THEN 1 ELSE 2 END
                    ) AS rn
             FROM accounts a
             INNER JOIN account_members am ON am.account_id = a.id AND am.status = 'active'
             INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
             INNER JOIN users u ON u.id = am.user_id AND u.status = 'active' AND u.email_verified = TRUE
             WHERE a.status = 'active' AND r.name IN ('account_owner', 'account_admin', 'account_manager')
               AND a.display_name ILIKE $1
           ),
           store_contacts AS (
             SELECT u.id AS recipient_id, s.name AS display_name,
                    'store'::text AS entity_type, 'store'::text AS category,
                    ROW_NUMBER() OVER (
                      PARTITION BY s.id
                      ORDER BY CASE r.name WHEN 'store_owner' THEN 0 WHEN 'store_admin' THEN 1 ELSE 2 END
                    ) AS rn
             FROM stores s
             INNER JOIN store_members sm ON sm.store_id = s.id AND sm.status = 'active'
             INNER JOIN roles r ON r.id = sm.role_id AND r.scope_type = sm.role_scope
             INNER JOIN users u ON u.id = sm.user_id AND u.status = 'active' AND u.email_verified = TRUE
             WHERE s.status = 'active' AND r.name IN ('store_owner', 'store_admin', 'store_manager')
               AND s.name ILIKE $1
           ),
           candidates AS (
             SELECT u.id AS recipient_id, COALESCE(p.display_name, u.name) AS display_name,
                    'person'::text AS entity_type, NULL::text AS category
             FROM users u
             LEFT JOIN profiles p ON p.user_id = u.id
             WHERE u.status = 'active' AND u.email_verified = TRUE
               AND COALESCE(p.display_name, u.name) ILIKE $1
             UNION ALL
             SELECT recipient_id, display_name, entity_type, category
             FROM account_contacts WHERE rn = 1
             UNION ALL
             SELECT recipient_id, display_name, entity_type, category
             FROM store_contacts WHERE rn = 1
           )
           SELECT recipient_id, display_name, entity_type, category
           FROM candidates WHERE recipient_id <> $2
           ORDER BY display_name ASC LIMIT 30`,
          [pattern, userId],
        );
        respond(response, 200, { success: true, recipients: matches.rows });
        return;
      }
      const result = await db.query(
        `SELECT c.id, c.updated_at,
          peer.id AS peer_id,
          COALESCE(peer_profile.display_name, peer.name) AS peer_name,
          COALESCE(peer_profile.avatar_reference, peer.image) AS peer_image,
          latest.body AS last_message, latest.created_at AS last_message_at,
          (SELECT COUNT(*)::int FROM messages unread
            WHERE unread.conversation_id = c.id
              AND unread.sender_id <> $1
              AND unread.created_at > COALESCE(
                CASE WHEN c.participant_low = $1
                  THEN c.participant_low_last_read_at
                  ELSE c.participant_high_last_read_at
                END,
                'epoch'::timestamptz
              )) AS unread_count
         FROM message_conversations c
         JOIN users peer ON peer.id = CASE
           WHEN c.participant_low = $1 THEN c.participant_high ELSE c.participant_low END
         LEFT JOIN profiles peer_profile ON peer_profile.user_id = peer.id
         LEFT JOIN LATERAL (
           SELECT body, created_at FROM messages
           WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
         ) latest ON TRUE
         WHERE c.participant_low = $1 OR c.participant_high = $1
         ORDER BY COALESCE(latest.created_at, c.updated_at) DESC
         LIMIT 100`,
        [userId],
      );
      respond(response, 200, {
        success: true,
        conversations: result.rows,
        unreadCount: result.rows.reduce((total, conversation) => total + Number(conversation.unread_count ?? 0), 0),
      });
      return;
    }

    if (!conversationId && request.method === "POST") {
      const body = await readBody(request);
      if (!isObject(body)) {
        respond(response, 400, { success: false, error: "A recipientId or productId is required" });
        return;
      }
      const hasRecipient = typeof body.recipientId === "string";
      const hasProduct = typeof body.productId === "string";
      if (hasRecipient === hasProduct) {
        respond(response, 400, { success: false, error: "Provide exactly one recipientId or productId" });
        return;
      }
      let recipientId: string;
      if (hasProduct) {
        if (!/^[0-9a-f-]{36}$/i.test(body.productId as string)) {
          respond(response, 400, { success: false, error: "Invalid productId" });
          return;
        }
        const seller = await db.query(
          `SELECT COALESCE(store_owner.user_id, store_admin.user_id, store_manager.user_id, account_owner.user_id, account_admin.user_id, account_manager.user_id) AS recipient_id
           FROM store_products p
           INNER JOIN stores s ON s.id = p.store_id AND s.status = 'active'
           INNER JOIN accounts a ON a.id = s.account_id AND a.status = 'active'
           LEFT JOIN LATERAL (
             SELECT sm.user_id FROM store_members sm
             INNER JOIN users u ON u.id = sm.user_id AND u.status = 'active' AND u.email_verified = TRUE
             INNER JOIN roles r ON r.id = sm.role_id AND r.scope_type = sm.role_scope AND r.name = 'store_owner'
             WHERE sm.store_id = s.id AND sm.status = 'active'
             ORDER BY sm.created_at ASC LIMIT 1
           ) store_owner ON TRUE
           LEFT JOIN LATERAL (
             SELECT sm.user_id FROM store_members sm
             INNER JOIN users u ON u.id = sm.user_id AND u.status = 'active' AND u.email_verified = TRUE
             INNER JOIN roles r ON r.id = sm.role_id AND r.scope_type = sm.role_scope AND r.name = 'store_admin'
             WHERE sm.store_id = s.id AND sm.status = 'active'
             ORDER BY sm.created_at ASC LIMIT 1
           ) store_admin ON TRUE
           LEFT JOIN LATERAL (
             SELECT sm.user_id FROM store_members sm
             INNER JOIN users u ON u.id = sm.user_id AND u.status = 'active' AND u.email_verified = TRUE
             INNER JOIN roles r ON r.id = sm.role_id AND r.scope_type = sm.role_scope AND r.name = 'store_manager'
             WHERE sm.store_id = s.id AND sm.status = 'active'
             ORDER BY sm.created_at ASC LIMIT 1
           ) store_manager ON TRUE
           LEFT JOIN LATERAL (
             SELECT am.user_id FROM account_members am
             INNER JOIN users u ON u.id = am.user_id AND u.status = 'active' AND u.email_verified = TRUE
             INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope AND r.name = 'account_owner'
             WHERE am.account_id = a.id AND am.status = 'active'
             ORDER BY am.created_at ASC LIMIT 1
           ) account_owner ON TRUE
           LEFT JOIN LATERAL (
             SELECT am.user_id FROM account_members am
             INNER JOIN users u ON u.id = am.user_id AND u.status = 'active' AND u.email_verified = TRUE
             INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope AND r.name = 'account_admin'
             WHERE am.account_id = a.id AND am.status = 'active'
             ORDER BY am.created_at ASC LIMIT 1
           ) account_admin ON TRUE
           LEFT JOIN LATERAL (
             SELECT am.user_id FROM account_members am
             INNER JOIN users u ON u.id = am.user_id AND u.status = 'active' AND u.email_verified = TRUE
             INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope AND r.name = 'account_manager'
             WHERE am.account_id = a.id AND am.status = 'active'
             ORDER BY am.created_at ASC LIMIT 1
           ) account_manager ON TRUE
           WHERE p.id = $1 AND p.status = 'active'
           LIMIT 1`,
          [body.productId],
        );
        const sellerUserId = seller.rows[0]?.recipient_id as string | null | undefined;
        if (!sellerUserId) {
          respond(response, 404, { success: false, error: "Product seller is unavailable" });
          return;
        }
        recipientId = sellerUserId;
      } else {
        if (!/^[0-9a-f-]{36}$/i.test(body.recipientId as string)) {
          respond(response, 400, { success: false, error: "Invalid recipientId" });
          return;
        }
        recipientId = body.recipientId as string;
        const recipient = await db.query(
          `SELECT id FROM users WHERE id = $1 AND status = 'active' AND email_verified = TRUE LIMIT 1`,
          [recipientId],
        );
        if (!recipient.rowCount) {
          respond(response, 404, { success: false, error: "Recipient not found or unavailable" });
          return;
        }
      }
      if (recipientId === userId) {
        respond(response, 400, { success: false, error: "You cannot start a conversation with yourself" });
        return;
      }
      const [low, high] = [userId, recipientId].sort();
      const result = await db.query(
        `INSERT INTO message_conversations (participant_low, participant_high)
         VALUES ($1, $2)
         ON CONFLICT (participant_low, participant_high)
         DO UPDATE SET updated_at = message_conversations.updated_at
         RETURNING id`,
        [low, high],
      );
      respond(response, 200, { success: true, conversationId: result.rows[0].id });
      return;
    }

    if (!conversationId || !/^[0-9a-f-]{36}$/i.test(conversationId)) {
      respond(response, 400, { success: false, error: "Invalid conversation id" });
      return;
    }

    const membership = await db.query(
      `SELECT id, participant_low, participant_high FROM message_conversations
       WHERE id = $1 AND (participant_low = $2 OR participant_high = $2) LIMIT 1`,
      [conversationId, userId],
    );
    if (!membership.rowCount) {
      respond(response, 404, { success: false, error: "Conversation not found" });
      return;
    }
    const recipientUserId = membership.rows[0].participant_low === userId
      ? membership.rows[0].participant_high
      : membership.rows[0].participant_low;

    if (request.method === "GET") {
      await db.query(
        `UPDATE message_conversations
         SET participant_low_last_read_at = CASE WHEN participant_low = $2 THEN NOW() ELSE participant_low_last_read_at END,
             participant_high_last_read_at = CASE WHEN participant_high = $2 THEN NOW() ELSE participant_high_last_read_at END
         WHERE id = $1 AND (participant_low = $2 OR participant_high = $2)`,
        [conversationId, userId],
      );
      const result = await db.query(
        `SELECT m.id, m.sender_id, m.body, m.created_at,
                COALESCE(p.display_name, u.name) AS sender_name,
                COALESCE(p.avatar_reference, u.image) AS sender_image
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         LEFT JOIN profiles p ON p.user_id = u.id
         WHERE m.conversation_id = $1
         ORDER BY m.created_at ASC LIMIT 500`,
        [conversationId],
      );
      respond(response, 200, { success: true, messages: result.rows });
      return;
    }

    const body = await readBody(request);
    if (!isObject(body) || typeof body.body !== "string" ||
        body.body.trim().length < 1 || body.body.trim().length > 5000) {
      respond(response, 400, { success: false, error: "Message must be between 1 and 5000 characters" });
      return;
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO messages (conversation_id, sender_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, sender_id, body, created_at`,
        [conversationId, userId, body.body.trim()],
      );
      await client.query(
        `UPDATE message_conversations SET updated_at = NOW() WHERE id = $1`,
        [conversationId],
      );
      await client.query(
        `INSERT INTO notifications (
           user_id, type, title_ar, title_en, body_ar, body_en,
           action_url, resource_id, metadata
         )
         VALUES ($1, 'message_received', 'رسالة جديدة', 'New message',
                 'لديك رسالة جديدة في محادثاتك.', 'You received a new private message.',
                 '/messages', $2, $3::jsonb)`,
        [recipientUserId, conversationId, JSON.stringify({ conversationId, senderUserId: userId })],
      );
      await client.query("COMMIT");
      respond(response, 201, { success: true, message: inserted.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA messages API error:", error);
    const tooLarge = error instanceof Error && error.message === "Request body too large";
    const invalidJson = error instanceof SyntaxError;
    respond(response, tooLarge ? 413 : invalidJson ? 400 : 500, {
      success: false,
      error: tooLarge ? "Request body too large"
        : invalidJson ? "Invalid JSON request body"
        : "Could not process messaging request",
    });
  }
}
