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
    if (size > 5_500_000) throw new Error("Request body too large");
    body += chunk.toString();
  }
  return JSON.parse(body);
}

async function ensureProfileColumns(): Promise<void> {
  const db = getDatabasePool();
  await db.query('ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "bio" text');
  await db.query('ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "website" text');
  await db.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "social_links" jsonb NOT NULL DEFAULT '{}'::jsonb`);
}

function safeOptionalUrl(value: unknown, max = 2048): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function handleProfileRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "PATCH") {
    respond(response, 405, { success: false, error: "Method not allowed" });
    return;
  }

  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      respond(response, 401, { success: false, error: "Authentication required" });
      return;
    }

    await ensureProfileColumns();
    const db = getDatabasePool();

    if (request.method === "GET") {
      const result = await db.query(
        `SELECT display_name, avatar_reference, bio, website, social_links
         FROM profiles WHERE user_id = $1 LIMIT 1`,
        [session.user.id],
      );
      const profile = result.rows[0];
      respond(response, 200, {
        success: true,
        profile: {
          userId: session.user.id,
          displayName: profile?.display_name ?? session.user.name,
          avatarReference: profile?.avatar_reference ?? session.user.image ?? null,
          bio: profile?.bio ?? "",
          website: profile?.website ?? "",
          socialLinks: profile?.social_links ?? {},
          email: session.user.email,
        },
      });
      return;
    }

    const body = await readBody(request);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      respond(response, 400, { success: false, error: "Invalid request body" });
      return;
    }

    const data = body as Record<string, unknown>;
    const displayName = data.displayName;
    const avatarReference = data.avatarReference;
    const bio = data.bio;
    const website = safeOptionalUrl(data.website);
    const rawLinks = data.socialLinks;

    if (typeof displayName !== "string" || displayName.trim().length < 2 || displayName.trim().length > 160) {
      respond(response, 400, { success: false, error: "Display name must be between 2 and 160 characters" });
      return;
    }
    if (typeof bio !== "string" || bio.length > 500) {
      respond(response, 400, { success: false, error: "Bio must be 500 characters or fewer" });
      return;
    }
    if (website === undefined) {
      respond(response, 400, { success: false, error: "Website must be a valid HTTP or HTTPS URL" });
      return;
    }
    if (avatarReference !== null && typeof avatarReference !== "string") {
      respond(response, 400, { success: false, error: "Invalid avatar" });
      return;
    }
    if (typeof avatarReference === "string") {
      const isImageData = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(avatarReference);
      const isHttpsUrl = /^https:\/\//i.test(avatarReference);
      if ((!isImageData && !isHttpsUrl) || avatarReference.length > 5_000_000) {
        respond(response, 400, { success: false, error: "Use a valid image file or HTTPS image URL" });
        return;
      }
    }
    if (typeof rawLinks !== "object" || rawLinks === null || Array.isArray(rawLinks)) {
      respond(response, 400, { success: false, error: "Invalid social links" });
      return;
    }

    const socialLinks: Record<string, string> = {};
    for (const key of ["instagram", "facebook", "linkedin", "x", "youtube", "tiktok"]) {
      const value = (rawLinks as Record<string, unknown>)[key];
      if (value === undefined || value === null || value === "") continue;
      const valid = safeOptionalUrl(value, 2048);
      if (valid === undefined) {
        respond(response, 400, { success: false, error: "Social links must be valid HTTP or HTTPS URLs" });
        return;
      }
      if (valid) socialLinks[key] = valid;
    }

    await db.query(
      `INSERT INTO profiles (user_id, display_name, avatar_reference, bio, website, social_links, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         avatar_reference = EXCLUDED.avatar_reference,
         bio = EXCLUDED.bio,
         website = EXCLUDED.website,
         social_links = EXCLUDED.social_links,
         updated_at = NOW()`,
      [session.user.id, displayName.trim(), avatarReference || null, bio.trim(), website ?? null, JSON.stringify(socialLinks)],
    );

    respond(response, 200, { success: true, message: "Profile updated" });
  } catch (error) {
    console.error("WASLA profile API error:", error);
    const message = error instanceof Error && error.message === "Request body too large"
      ? "Profile image is too large. Choose an image under 3 MB."
      : "Could not process profile request";
    respond(response, error instanceof Error && error.message === "Request body too large" ? 413 : 500, {
      success: false,
      error: message,
    });
  }
}
