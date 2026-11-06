import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(res: ServerResponse, status: number, data: Record<string, unknown>): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}

async function currentUser(req: IncomingMessage): Promise<string | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  return session?.user?.id ?? null;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "";
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 12_000) throw new Error("BODY_TOO_LARGE");
    raw += chunk.toString();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/** Lists only conversations in which the authenticated user is a participant. */
export async function handleMessagesCollection(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    reply(res, 405, { success: false, error: "Method not allowed" });
    return;
  }
  try {
    const userId = await currentUser(req);
    if (!userId) { reply(res, 401, { success: false, error: "Authentication required" }); return; }
    const db = getDatabasePool();

    if (req.method === "GET") {
      const result = await db.query(
        `SELECT c.id, c.updated_at,
                other.id AS other_user_id, other.name AS other_user_name,
                last_message.body AS last_message,
                last_message.created_at AS last_message_at,
                (SELECT COUNT(*)::int FROM messages unread
                 WHERE unread.conversation_id = c.id
                   AND unread.sender_user_id <> $1
                   AND unread.read_at IS NULL) AS unread_count
         FROM message_conversations c
         JOIN users other ON other.id = CASE
           WHEN c.participant_a_id = $1 THEN c.participant_b_id
           ELSE c.participant_a_id END
         LEFT JOIN LATERAL (
           SELECT body, created_at FROM messages
           WHERE conversation_id = c.id
           ORDER BY created_at DESC LIMIT 1
         ) last_message ON TRUE
         WHERE c.participant_a_id = $1 OR c.participant_b_id = $1
         ORDER BY COALESCE(last_message.created_at, c.updated_at) DESC
         LIMIT 100`,
        [userId],
      );
      reply(res, 200, { success: true, conversations: result.rows });
      return;
    }

    const body = await readBody(req);
    const recipientId = body?.recipientUserId;
    if (typeof recipientId !== "string" || !UUID.test(recipientId) || recipientId === userId) {
      reply(res, 400, { success: false, error: "A valid, different recipient is required" });
      return;
    }
    const recipient = await db.query(
      `SELECT id FROM users WHERE id = $1 AND status = 'active' LIMIT 1`,
      [recipientId],
    );
    if (!recipient.rows.length) {
      reply(res, 404, { success: false, error: "Recipient not found or unavailable" });
      return;
    }

    const [participantA, participantB] = [userId, recipientId].sort();
    const created = await db.query(
      `INSERT INTO message_conversations (participant_a_id, participant_b_id)
       VALUES ($1, $2)
       ON CONFLICT (participant_a_id, participant_b_id)
       DO UPDATE SET updated_at = message_conversations.updated_at
       RETURNING id, participant_a_id, participant_b_id, created_at, updated_at`,
      [participantA, participantB],
    );
    reply(res, 200, { success: true, conversation: created.rows[0] });
  } catch (error) {
    console.error("WASLA messages collection error:", error);
    const tooLarge = error instanceof Error && error.message === "BODY_TOO_LARGE";
    reply(res, tooLarge ? 413 : 500, {
      success: false,
      error: tooLarge ? "Request body is too large" : "Could not process messages request",
    });
  }
}

/** Reads or sends messages only after verifying conversation membership. */
export async function handleConversationMessages(
  req: IncomingMessage,
  res: ServerResponse,
  conversationId: string,
): Promise<void> {
  if (!UUID.test(conversationId)) {
    reply(res, 400, { success: false, error: "Invalid conversation ID" });
    return;
  }
  if (req.method !== "GET" && req.method !== "POST") {
    reply(res, 405, { success: false, error: "Method not allowed" });
    return;
  }
  try {
    const userId = await currentUser(req);
    if (!userId) { reply(res, 401, { success: false, error: "Authentication required" }); return; }
    const db = getDatabasePool();
    const membership = await db.query(
      `SELECT id FROM message_conversations
       WHERE id = $1 AND (participant_a_id = $2 OR participant_b_id = $2)
       LIMIT 1`,
      [conversationId, userId],
    );
    if (!membership.rows.length) {
      reply(res, 404, { success: false, error: "Conversation not found" });
      return;
    }

    if (req.method === "GET") {
      await db.query(
        `UPDATE messages SET read_at = NOW()
         WHERE conversation_id = $1 AND sender_user_id <> $2 AND read_at IS NULL`,
        [conversationId, userId],
      );
      const result = await db.query(
        `SELECT id, sender_user_id, body, read_at, created_at
         FROM (
           SELECT id, sender_user_id, body, read_at, created_at
           FROM messages WHERE conversation_id = $1
           ORDER BY created_at DESC LIMIT 100
         ) recent
         ORDER BY created_at ASC`,
        [conversationId],
      );
      reply(res, 200, { success: true, messages: result.rows });
      return;
    }

    const body = await readBody(req);
    const message = body?.body;
    if (typeof message !== "string" || !message.trim() || message.trim().length > 5000) {
      reply(res, 400, { success: false, error: "Message must contain 1 to 5000 characters" });
      return;
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO messages (conversation_id, sender_user_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, sender_user_id, body, read_at, created_at`,
        [conversationId, userId, message.trim()],
      );
      await client.query(
        "UPDATE message_conversations SET updated_at = NOW() WHERE id = $1",
        [conversationId],
      );
      await client.query("COMMIT");
      reply(res, 201, { success: true, message: inserted.rows[0] });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA conversation messages error:", error);
    const tooLarge = error instanceof Error && error.message === "BODY_TOO_LARGE";
    reply(res, tooLarge ? 413 : 500, {
      success: false,
      error: tooLarge ? "Request body is too large" : "Could not process conversation",
    });
  }
}
