import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

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
    if (size > 12_000) throw new Error("Request body too large");
    body += chunk.toString();
  }
  return JSON.parse(body);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeSlug(name: string): string {
  const base = name.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return base || "store";
}

export async function handleStoresRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") {
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

    const pool = getDatabasePool();
    if (request.method === "GET") {
      const result = await pool.query(
        `SELECT
           s.id, s.account_id, s.name, s.slug, s.status, s.created_at,
           a.display_name AS account_name,
           r.name AS account_role,
           smr.name AS store_role
         FROM stores s
         INNER JOIN accounts a ON a.id = s.account_id
         LEFT JOIN account_members am
           ON am.account_id = a.id AND am.user_id = $1 AND am.status = 'active'
         LEFT JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
         LEFT JOIN store_members sm ON sm.store_id = s.id
           AND sm.user_id = $1 AND sm.status = 'active'
         LEFT JOIN roles smr ON smr.id = sm.role_id AND smr.scope_type = sm.role_scope
         WHERE s.status <> 'deactivated'
           AND (
             EXISTS (
               SELECT 1 FROM account_members member
               INNER JOIN roles member_role ON member_role.id = member.role_id AND member_role.scope_type = member.role_scope
               INNER JOIN role_permissions rp ON rp.role_id = member_role.id AND rp.scope_type = member_role.scope_type
               INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
               WHERE member.account_id = s.account_id AND member.user_id = $1
                 AND member.status = 'active' AND p.permission_key = 'account.read'
             )
             OR EXISTS (
               SELECT 1 FROM store_members member
               INNER JOIN roles member_role ON member_role.id = member.role_id AND member_role.scope_type = member.role_scope
               INNER JOIN role_permissions rp ON rp.role_id = member_role.id AND rp.scope_type = member_role.scope_type
               INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
               WHERE member.store_id = s.id AND member.user_id = $1
                 AND member.status = 'active' AND p.permission_key = 'store.read'
             )
           )
         ORDER BY s.created_at DESC`,
        [session.user.id],
      );
      respond(response, 200, { success: true, stores: result.rows });
      return;
    }

    let body: unknown;
    try {
      body = await readBody(request);
    } catch {
      respond(response, 400, { success: false, error: "Invalid request body" });
      return;
    }
    if (!isObject(body)) {
      respond(response, 400, { success: false, error: "Invalid request body" });
      return;
    }

    const accountId = body.accountId;
    const name = body.name;
    if (typeof accountId !== "string" || !/^[0-9a-f-]{36}$/i.test(accountId)) {
      respond(response, 400, { success: false, error: "A valid business account is required" });
      return;
    }
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 120) {
      respond(response, 400, { success: false, error: "Store name must be between 2 and 120 characters" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const account = await client.query<{ id: string }>(
        `SELECT a.id
         FROM accounts a
         WHERE a.id = $1
           AND EXISTS (
             SELECT 1
             FROM account_members am
             INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
             INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
             INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
             WHERE am.account_id = a.id
               AND am.user_id = $2
               AND am.status = 'active'
               AND p.permission_key = 'account.business.update'
           )
         FOR UPDATE OF a`,
        [accountId, session.user.id],
      );
      if (account.rowCount !== 1) {
        await client.query("ROLLBACK");
        respond(response, 403, { success: false, error: "You cannot create a store for this account" });
        return;
      }

      const storeRole = await client.query<{ id: string }>(
        "SELECT id FROM roles WHERE name = 'store_owner' AND scope_type = 'store' LIMIT 1",
      );
      if (storeRole.rowCount !== 1) throw new Error("Store owner role is not configured");

      const baseSlug = makeSlug(name.trim());
      let slug = baseSlug;
      const exists = await client.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM stores WHERE slug = $1) AS exists",
        [slug],
      );
      if (exists.rows[0]?.exists) slug = `${baseSlug.slice(0, 80)}-${randomUUID().slice(0, 8)}`;

      const created = await client.query(
        `INSERT INTO stores (account_id, name, slug)
         VALUES ($1, $2, $3)
         RETURNING id, account_id, name, slug, status, created_at`,
        [accountId, name.trim(), slug],
      );
      const store = created.rows[0];

      await client.query(
        `INSERT INTO store_members (store_id, user_id, role_id, role_scope, status)
         VALUES ($1, $2, $3, 'store', 'active')`,
        [store.id, session.user.id, storeRole.rows[0].id],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, store_id, metadata)
         VALUES ($1, 'store.created', 'store', $2, $3, $2, $4)`,
        [session.user.id, store.id, accountId, JSON.stringify({ name: store.name, slug: store.slug })],
      );
      await client.query("COMMIT");
      respond(response, 201, { success: true, store });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA stores API error:", error);
    respond(response, 500, { success: false, error: "Could not process store request" });
  }
}

export async function handleStoreDetailRequest(
  request: IncomingMessage,
  response: ServerResponse,
  slug: string,
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
    const pool = getDatabasePool();
    if (request.method === "GET") {
      const result = await pool.query(
        `SELECT s.id, s.account_id, s.name, s.slug, s.status, s.created_at,
                a.display_name AS account_name, a.country_code,
                bp.description AS business_description, bp.website,
                r.name AS account_role, sr.name AS store_role
         FROM stores s
         INNER JOIN accounts a ON a.id = s.account_id
         LEFT JOIN business_profiles bp ON bp.account_id = a.id
         LEFT JOIN account_members am ON am.account_id = a.id
           AND am.user_id = $2 AND am.status = 'active'
         LEFT JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
         LEFT JOIN store_members sm ON sm.store_id = s.id
           AND sm.user_id = $2 AND sm.status = 'active'
         LEFT JOIN roles sr ON sr.id = sm.role_id AND sr.scope_type = sm.role_scope
         WHERE s.slug = $1 AND s.status <> 'deactivated'
           AND (
             EXISTS (
               SELECT 1 FROM account_members member
               INNER JOIN roles member_role ON member_role.id = member.role_id AND member_role.scope_type = member.role_scope
               INNER JOIN role_permissions rp ON rp.role_id = member_role.id AND rp.scope_type = member_role.scope_type
               INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
               WHERE member.account_id = s.account_id AND member.user_id = $2
                 AND member.status = 'active' AND p.permission_key = 'account.read'
             )
             OR EXISTS (
               SELECT 1 FROM store_members member
               INNER JOIN roles member_role ON member_role.id = member.role_id AND member_role.scope_type = member.role_scope
               INNER JOIN role_permissions rp ON rp.role_id = member_role.id AND rp.scope_type = member_role.scope_type
               INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
               WHERE member.store_id = s.id AND member.user_id = $2
                 AND member.status = 'active' AND p.permission_key = 'store.read'
             )
           )
         LIMIT 1`,
        [slug, session.user.id],
      );
      if (result.rowCount !== 1) {
        respond(response, 404, { success: false, error: "Store not found" });
        return;
      }
      respond(response, 200, { success: true, store: result.rows[0] });
      return;
    }

    let body: unknown;
    try { body = await readBody(request); }
    catch {
      respond(response, 400, { success: false, error: "Invalid request body" });
      return;
    }
    if (!isObject(body) || typeof body.name !== "string" ||
        body.name.trim().length < 2 || body.name.trim().length > 120) {
      respond(response, 400, { success: false, error: "Store name must be between 2 and 120 characters" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE stores s
         SET name = $1, updated_at = NOW()
         WHERE s.slug = $2 AND s.status = 'active'
           AND (
             EXISTS (
               SELECT 1 FROM account_members am
               INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
               INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.scope_type = r.scope_type
               INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
               WHERE am.account_id = s.account_id AND am.user_id = $3
                 AND am.status = 'active' AND p.permission_key = 'account.business.update'
             )
             OR EXISTS (
               SELECT 1 FROM store_members sm
               INNER JOIN roles sr ON sr.id = sm.role_id AND sr.scope_type = sm.role_scope
               INNER JOIN role_permissions rp ON rp.role_id = sr.id AND rp.scope_type = sr.scope_type
               INNER JOIN permissions p ON p.id = rp.permission_id AND p.scope_type = rp.scope_type
               WHERE sm.store_id = s.id AND sm.user_id = $3
                 AND sm.status = 'active' AND p.permission_key = 'store.update'
             )
           )
         RETURNING id, account_id, name, slug, status, created_at, updated_at`,
        [body.name.trim(), slug, session.user.id],
      );
      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK");
        respond(response, 403, { success: false, error: "You cannot manage this store" });
        return;
      }
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, store_id, metadata)
         VALUES ($1, 'store.updated', 'store', $2, $3, $2, $4)`,
        [session.user.id, updated.rows[0].id, updated.rows[0].account_id,
         JSON.stringify({ name: updated.rows[0].name })],
      );
      await client.query("COMMIT");
      respond(response, 200, { success: true, store: updated.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA store detail API error:", error);
    respond(response, 500, { success: false, error: "Could not process store request" });
  }
}
