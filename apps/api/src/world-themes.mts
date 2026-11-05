import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

const worlds = new Set([
  "global", "store", "shops", "business", "trade",
  "messages", "ai", "command", "profile",
]);
const themes = new Set([
  "default", "midnight", "ocean", "gold", "light", "graphite",
]);

function respond(response: ServerResponse, status: number, data: Record<string, unknown>) {
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
    if (size > 4000) throw new Error("Request body too large");
    body += chunk.toString();
  }
  return JSON.parse(body);
}

export async function handleWorldThemesRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "PATCH") {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }

  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) {
      respond(response, 401, { success: false, error: "Authentication required" });
      return;
    }

    const database = getDatabasePool();
    if (request.method === "GET") {
      const result = await database.query(
        `SELECT world_key AS "worldKey", theme_key AS "themeKey"
         FROM user_world_themes WHERE user_id = $1`,
        [session.user.id],
      );
      respond(response, 200, { success: true, themes: result.rows });
      return;
    }

    let body: unknown;
    try {
      body = await readBody(request);
    } catch {
      respond(response, 400, { success: false, error: "Invalid request body" });
      return;
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      respond(response, 400, { success: false, error: "Invalid request body" });
      return;
    }

    const { worldKey, themeKey } = body as Record<string, unknown>;
    if (typeof worldKey !== "string" || !worlds.has(worldKey)) {
      respond(response, 400, { success: false, error: "Unsupported world" });
      return;
    }
    if (typeof themeKey !== "string" || !themes.has(themeKey)) {
      respond(response, 400, { success: false, error: "Unsupported theme" });
      return;
    }

    await database.query(
      `INSERT INTO user_world_themes (user_id, world_key, theme_key, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, world_key)
       DO UPDATE SET theme_key = EXCLUDED.theme_key, updated_at = NOW()`,
      [session.user.id, worldKey, themeKey],
    );
    respond(response, 200, { success: true, worldKey, themeKey });
  } catch (error) {
    console.error("WASLA world themes API error:", error);
    respond(response, 500, { success: false, error: "Could not process theme preference" });
  }
}
