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

export async function handleProfileRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (
    request.method !== "GET" &&
    request.method !== "PATCH"
  ) {
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

    const database = getDatabasePool();

    if (request.method === "GET") {
      const result = await database.query(
        `SELECT display_name, avatar_reference
         FROM profiles
         WHERE user_id = $1
         LIMIT 1`,
        [session.user.id],
      );

      const profile = result.rows[0];

      respond(response, 200, {
        success: true,
        profile: {
          userId: session.user.id,
          displayName:
            profile?.display_name ?? session.user.name,
          avatarReference:
            profile?.avatar_reference ?? null,
          email: session.user.email,
        },
      });

      return;
    }

    const body = await readBody(request);

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      respond(response, 400, {
        success: false,
        error: "Invalid request body",
      });
      return;
    }

    const data = body as Record<string, unknown>;
    const displayName = data.displayName;
    const avatarReference = data.avatarReference;

    if (
      typeof displayName !== "string" ||
      displayName.trim().length < 2 ||
      displayName.trim().length > 160
    ) {
      respond(response, 400, {
        success: false,
        error: "Display name must be between 2 and 160 characters",
      });
      return;
    }

    if (
      avatarReference !== undefined &&
      avatarReference !== null &&
      (
        typeof avatarReference !== "string" ||
        avatarReference.length > 2048
      )
    ) {
      respond(response, 400, {
        success: false,
        error: "Invalid avatar reference",
      });
      return;
    }

    await database.query(
      `INSERT INTO profiles (
         user_id,
         display_name,
         avatar_reference,
         updated_at
       )
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         display_name = EXCLUDED.display_name,
         avatar_reference = EXCLUDED.avatar_reference,
         updated_at = NOW()`,
      [
        session.user.id,
        displayName.trim(),
        typeof avatarReference === "string"
          ? avatarReference
          : null,
      ],
    );

    respond(response, 200, {
      success: true,
      message: "Profile updated",
    });
  } catch (error) {
    console.error("WASLA profile API error:", error);

    respond(response, 500, {
      success: false,
      error: "Could not process profile request",
    });
  }
}
