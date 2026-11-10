import type { IncomingMessage, ServerResponse } from "node:http";
import type { PoolClient } from "pg";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

export type NotificationInput = {
  userId: string;
  type: "account_invitation" | "message_received" | "product_inquiry" | "friend_request" | "trade_deal" | "official_store_order" | "member_store_order";
  titleAr: string;
  titleEn: string;
  bodyAr?: string | null;
  bodyEn?: string | null;
  actionUrl: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
};

function reply(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  response.end(JSON.stringify(data));
}

function validInternalPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

export async function ensureNotificationsTable(): Promise<void> {
  const db = getDatabasePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type varchar(64) NOT NULL CHECK (type IN ('account_invitation', 'message_received', 'product_inquiry', 'friend_request')),
      title_ar varchar(180) NOT NULL,
      title_en varchar(180) NOT NULL,
      body_ar text,
      body_en text,
      action_url varchar(500) NOT NULL,
      resource_id uuid,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT notifications_action_path_check CHECK (left(action_url, 1) = '/' AND left(action_url, 2) <> '//')
    )
  `);
  await db.query(`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check`);
  await db.query(`ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('account_invitation', 'message_received', 'product_inquiry', 'friend_request', 'trade_deal', 'official_store_order', 'member_store_order'))`);
  await db.query(`CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications (user_id, created_at DESC) WHERE read_at IS NULL`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS notification_push_devices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token varchar(255) NOT NULL UNIQUE,
      platform varchar(16) NOT NULL CHECK (platform IN ('ios', 'android')),
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS notification_push_devices_user_idx ON notification_push_devices (user_id)`);
}

export async function createNotification(client: PoolClient, input: NotificationInput): Promise<void> {
  if (!validInternalPath(input.actionUrl)) throw new Error("Notification action must be an internal path");
  await client.query(
    `INSERT INTO notifications
       (user_id, type, title_ar, title_en, body_ar, body_en, action_url, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      input.userId, input.type, input.titleAr, input.titleEn,
      input.bodyAr ?? null, input.bodyEn ?? null, input.actionUrl,
      input.resourceId ?? null, JSON.stringify(input.metadata ?? {}),
    ],
  );
}


async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 8192) return null;
    chunks.push(buffer);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

const EXPO_PUSH_TOKEN_PATTERN = /^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{8,200}\]$/;

async function handlePushDeviceRequest(
  request: IncomingMessage,
  response: ServerResponse,
  userId: string,
): Promise<void> {
  if (request.method !== "POST" && request.method !== "DELETE") {
    reply(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  const body = await readJsonBody(request);
  if (!body || typeof body.token !== "string" || !EXPO_PUSH_TOKEN_PATTERN.test(body.token)) {
    reply(response, 400, { success: false, error: "A valid Expo push token is required" });
    return;
  }
  if (request.method === "POST") {
    if (body.platform !== "ios" && body.platform !== "android") {
      reply(response, 400, { success: false, error: "Platform must be ios or android" });
      return;
    }
    await getDatabasePool().query(
      `INSERT INTO notification_push_devices (user_id, token, platform, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (token) DO UPDATE
       SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = NOW()`,
      [userId, body.token, body.platform],
    );
    reply(response, 200, { success: true, registered: true });
    return;
  }
  const result = await getDatabasePool().query(
    `DELETE FROM notification_push_devices WHERE token = $1 AND user_id = $2`,
    [body.token, userId],
  );
  reply(response, 200, { success: true, removed: (result.rowCount ?? 0) > 0 });
}

export async function handleNotificationsRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const path = new URL(request.url ?? "/api/notifications", "http://localhost").pathname;
  const isDevicePath = path === "/api/notifications/devices";
  const allowedMethods = isDevicePath ? ["POST", "DELETE"] : ["GET", "PATCH"];
  if (!allowedMethods.includes(request.method ?? "")) {
    reply(response, 405, { success: false, error: "Method not allowed" });
    return;
  }
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      reply(response, 401, { success: false, error: "Authentication required" });
      return;
    }
    const db = getDatabasePool();
    if (isDevicePath) {
      await handlePushDeviceRequest(request, response, session.user.id);
      return;
    }

    if (request.method === "GET") {
      const [items, unread] = await Promise.all([
        db.query(
          `SELECT id, type, title_ar AS "titleAr", title_en AS "titleEn",
                  body_ar AS "bodyAr", body_en AS "bodyEn",
                  action_url AS "actionUrl", resource_id AS "resourceId",
                  read_at AS "readAt", created_at AS "createdAt"
           FROM notifications
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 50`,
          [session.user.id],
        ),
        db.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
          [session.user.id],
        ),
      ]);
      reply(response, 200, {
        success: true,
        notifications: items.rows,
        unreadCount: Number(unread.rows[0]?.total ?? 0),
      });
      return;
    }

    if (path === "/api/notifications/read-all") {
      const result = await db.query(
        `UPDATE notifications SET read_at = NOW()
         WHERE user_id = $1 AND read_at IS NULL`,
        [session.user.id],
      );
      reply(response, 200, { success: true, markedRead: result.rowCount ?? 0 });
      return;
    }

    const match = path.match(/^\/api\/notifications\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/read$/i);
    if (!match) {
      reply(response, 404, { success: false, error: "Notification not found" });
      return;
    }
    const result = await db.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND user_id = $2
       RETURNING id, read_at AS "readAt"`,
      [match[1], session.user.id],
    );
    if (!result.rowCount) {
      reply(response, 404, { success: false, error: "Notification not found" });
      return;
    }
    reply(response, 200, { success: true, notification: result.rows[0] });
  } catch (error) {
    console.error("WASLA notifications API error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Could not process notifications" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
