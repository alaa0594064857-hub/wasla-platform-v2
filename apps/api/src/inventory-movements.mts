import type { IncomingMessage, ServerResponse } from "node:http";
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
function canManageSql() {
  return `(
    EXISTS (
      SELECT 1 FROM account_members am
      INNER JOIN roles r ON r.id = am.role_id AND r.scope_type = am.role_scope
      WHERE am.account_id = s.account_id AND am.user_id = $2
        AND am.status = 'active'
        AND r.name IN ('account_owner', 'account_manager')
    )
    OR EXISTS (
      SELECT 1 FROM store_members sm
      INNER JOIN roles sr ON sr.id = sm.role_id AND sr.scope_type = sm.role_scope
      WHERE sm.store_id = s.id AND sm.user_id = $2
        AND sm.status = 'active' AND sr.name IN ('store_owner', 'store_manager')
    )
  )`;
}

export async function handleInventoryMovementsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  slug: string,
  productId: string,
): Promise<void> {
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
    const pool = getDatabasePool();
    if (request.method === "GET") {
      const access = await pool.query(
        `SELECT p.id, p.store_id AS "storeId"
         FROM store_products p
         INNER JOIN stores s ON s.id = p.store_id
         WHERE p.id = $3 AND s.slug = $1 AND s.status = 'active'
           AND ${canManageSql()}
         LIMIT 1`,
        [slug, session.user.id, productId],
      );
      if (access.rowCount !== 1) {
        respond(response, 404, { success: false, error: "Product not found or access denied" });
        return;
      }
      const result = await pool.query(
        `SELECT id, product_id AS "productId", movement_type AS "movementType",
                quantity_delta AS "quantityDelta", quantity_before AS "quantityBefore",
                quantity_after AS "quantityAfter", reason,
                reference_code AS "referenceCode", actor_user_id AS "actorUserId",
                created_at AS "createdAt"
         FROM store_inventory_movements
         WHERE store_id = $1 AND product_id = $2
         ORDER BY created_at DESC, id DESC
         LIMIT 100`,
        [access.rows[0].storeId, productId],
      );
      respond(response, 200, { success: true, movements: result.rows });
      return;
    }

    let body: unknown;
    try { body = await readBody(request); }
    catch {
      respond(response, 400, { success: false, error: "Invalid request body" });
      return;
    }
    if (!isObject(body)) {
      respond(response, 400, { success: false, error: "Invalid movement data" });
      return;
    }
    const movementType = body.movementType;
    const delta = body.quantityDelta;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const referenceCode = body.referenceCode === undefined || body.referenceCode === null
      ? null : typeof body.referenceCode === "string" ? body.referenceCode.trim() : undefined;
    if (
      !["inbound", "outbound", "adjustment"].includes(String(movementType)) ||
      !Number.isSafeInteger(delta) || delta === 0 ||
      (movementType === "inbound" && (delta as number) < 0) ||
      (movementType === "outbound" && (delta as number) > 0) ||
      reason.length < 3 || reason.length > 500 ||
      referenceCode === undefined || (referenceCode !== null && referenceCode.length > 120)
    ) {
      respond(response, 400, { success: false, error: "Provide a valid movement type, non-zero signed quantity, reason, and optional reference code" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const product = await client.query(
        `SELECT p.id, p.store_id AS "storeId", s.account_id AS "accountId",
                p.stock_quantity AS "quantityBefore"
         FROM store_products p
         INNER JOIN stores s ON s.id = p.store_id
         WHERE p.id = $3 AND s.slug = $1 AND s.status = 'active'
           AND ${canManageSql()}
         FOR UPDATE OF p`,
        [slug, session.user.id, productId],
      );
      if (product.rowCount !== 1) {
        await client.query("ROLLBACK");
        respond(response, 404, { success: false, error: "Product not found or access denied" });
        return;
      }
      const current = product.rows[0];
      const before = Number(current.quantityBefore);
      const after = before + (delta as number);
      if (!Number.isSafeInteger(after) || after < 0 || after > 2_147_483_647) {
        await client.query("ROLLBACK");
        respond(response, 409, { success: false, error: "The movement would result in an invalid stock quantity" });
        return;
      }
      await client.query(
        "UPDATE store_products SET stock_quantity = $1, updated_at = NOW() WHERE id = $2",
        [after, productId],
      );
      const movement = await client.query(
        `INSERT INTO store_inventory_movements
          (store_id, product_id, actor_user_id, movement_type, quantity_delta,
           quantity_before, quantity_after, reason, reference_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, product_id AS "productId", movement_type AS "movementType",
           quantity_delta AS "quantityDelta", quantity_before AS "quantityBefore",
           quantity_after AS "quantityAfter", reason, reference_code AS "referenceCode",
           actor_user_id AS "actorUserId", created_at AS "createdAt"`,
        [current.storeId, productId, session.user.id, movementType, delta, before, after, reason, referenceCode],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, store_id, metadata)
         VALUES ($1, 'inventory.movement.created', 'inventory_movement', $2, $3, $4, $5)`,
        [session.user.id, movement.rows[0].id, current.accountId, current.storeId,
         JSON.stringify({ productId, movementType, quantityDelta: delta, quantityBefore: before, quantityAfter: after })],
      );
      await client.query("COMMIT");
      respond(response, 201, { success: true, movement: movement.rows[0], stockQuantity: after });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA inventory movements API error:", error);
    respond(response, 500, { success: false, error: "Could not process inventory movement" });
  }
}
