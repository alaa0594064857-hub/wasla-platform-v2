import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

type Policy = {
  acceptsReturns: boolean;
  acceptsExchanges: boolean;
  requestWindowDays: number;
  itemConditionsAr: string;
  itemConditionsEn: string;
  exclusionsAr: string;
  exclusionsEn: string;
  buyerInstructionsAr: string;
  buyerInstructionsEn: string;
  contactInstructionsAr: string;
  contactInstructionsEn: string;
};

function send(res: ServerResponse, status: number, data: Record<string, unknown>) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "", size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 16000) throw new Error("too_large");
    raw += chunk.toString();
  }
  const value: unknown = JSON.parse(raw);
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function validatePolicy(value: unknown): { policy?: Policy; error?: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: "Policy must be an object" };
  }
  const input = value as Record<string, unknown>;
  if (typeof input.acceptsReturns !== "boolean" || typeof input.acceptsExchanges !== "boolean") {
    return { error: "Return and exchange settings must be boolean values" };
  }
  if (!Number.isInteger(input.requestWindowDays) ||
      Number(input.requestWindowDays) < 1 || Number(input.requestWindowDays) > 365) {
    return { error: "Request window must be between 1 and 365 days" };
  }
  const fields = [
    "itemConditionsAr", "itemConditionsEn", "exclusionsAr", "exclusionsEn",
    "buyerInstructionsAr", "buyerInstructionsEn", "contactInstructionsAr", "contactInstructionsEn",
  ] as const;
  const policy: Record<string, unknown> = {
    acceptsReturns: input.acceptsReturns,
    acceptsExchanges: input.acceptsExchanges,
    requestWindowDays: Number(input.requestWindowDays),
  };
  for (const field of fields) {
    const raw = input[field];
    if (typeof raw !== "string" || raw.length > 1500) {
      return { error: field + " must be text no longer than 1500 characters" };
    }
    policy[field] = raw.trim();
  }
  return { policy: policy as Policy };
}

const managePermission = `EXISTS (
  SELECT 1 FROM stores s WHERE s.id = $1 AND (
    EXISTS (
      SELECT 1 FROM account_members am
      JOIN roles r ON r.id=am.role_id AND r.scope_type=am.role_scope
      JOIN role_permissions rp ON rp.role_id=r.id AND rp.scope_type=r.scope_type
      JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
      WHERE am.account_id=s.account_id AND am.user_id=$2 AND am.status='active'
        AND p.permission_key=ANY($3::text[])
    )
    OR EXISTS (
      SELECT 1 FROM store_members sm
      JOIN roles r ON r.id=sm.role_id AND r.scope_type=sm.role_scope
      JOIN role_permissions rp ON rp.role_id=r.id AND rp.scope_type=r.scope_type
      JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
      WHERE sm.store_id=s.id AND sm.user_id=$2 AND sm.status='active'
        AND p.permission_key=ANY($3::text[])
    )
  )
)`;

const permissions = ["store.settings.manage", "account.settings.manage"];

/** Public reads expose only the published policy; management writes are versioned and audited. */
export async function handleMemberStoreReturnPolicy(
  req: IncomingMessage,
  res: ServerResponse,
  slug: string,
  mode: "public" | "manage",
  action: "read" | "save" | "publish" | "unpublish",
) {
  if (mode === "public") {
    if (req.method !== "GET" || action !== "read") {
      send(res, 405, { success: false, error: "Method not allowed" }); return;
    }
    const result = await getDatabasePool().query(
      `SELECT return_policy AS policy, return_policy_version AS version,
              return_policy_published_at AS "publishedAt"
       FROM stores WHERE slug=$1 AND status='active'`,
      [slug],
    );
    if (!result.rowCount) { send(res, 404, { success: false, error: "Store not found" }); return; }
    const row = result.rows[0];
    send(res, 200, {
      success: true,
      status: row.policy ? "published" : "not_provided",
      policy: row.policy ?? null,
      version: row.policy ? row.version : null,
      publishedAt: row.policy ? row.publishedAt : null,
      disclosure: row.policy ? null : "contact_seller_policy_not_provided",
    });
    return;
  }

  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) { send(res, 401, { success: false, error: "Authentication required" }); return; }
  const expectedMethod = action === "read" ? "GET" : action === "save" ? "PUT" : "POST";
  if (req.method !== expectedMethod) { send(res, 405, { success: false, error: "Method not allowed" }); return; }

  let input: Record<string, unknown> | null = null;
  if (action === "save") {
    try { input = await readBody(req); }
    catch (error) {
      send(res, error instanceof Error && error.message === "too_large" ? 413 : 400,
        { success: false, error: "Invalid request body" }); return;
    }
    if (!input) { send(res, 400, { success: false, error: "Invalid request body" }); return; }
    const checked = validatePolicy(input.policy);
    if (!checked.policy) { send(res, 400, { success: false, error: checked.error }); return; }
    input.policy = checked.policy;
  }

  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const storeResult = await client.query(
      `SELECT id, account_id AS "accountId", return_policy AS "returnPolicy", return_policy_version AS "returnPolicyVersion" FROM stores
       WHERE slug=$1 AND status='active' FOR UPDATE`,
      [slug],
    );
    if (!storeResult.rowCount) {
      await client.query("ROLLBACK");
      send(res, 404, { success: false, error: "Store not found" }); return;
    }
    const store = storeResult.rows[0];
    const allowed = await client.query(
      `SELECT ${managePermission} AS allowed`,
      [store.id, session.user.id, permissions],
    );
    if (!allowed.rows[0]?.allowed) {
      await client.query("ROLLBACK");
      send(res, 403, { success: false, error: "Store settings permission required" }); return;
    }

    if (action === "read") {
      const versions = await client.query(
        `SELECT id, version, policy, publication_status AS "publicationStatus",
                created_at AS "createdAt", published_at AS "publishedAt"
         FROM member_store_return_policy_versions
         WHERE store_id=$1 ORDER BY version DESC LIMIT 20`,
        [store.id],
      );
      await client.query("COMMIT");
      send(res, 200, { success: true, publishedPolicy: store.returnPolicy ?? null,
        publishedVersion: store.returnPolicyVersion, versions: versions.rows });
      return;
    }

    if (action === "save") {
      const inserted = await client.query(
        `INSERT INTO member_store_return_policy_versions
           (store_id, version, policy, publication_status, created_by)
         SELECT $1, COALESCE(MAX(version),0)+1, $2::jsonb, 'draft', $3
         FROM member_store_return_policy_versions WHERE store_id=$1
         RETURNING id, version, policy, publication_status AS "publicationStatus", created_at AS "createdAt"`,
        [store.id, JSON.stringify(input!.policy), session.user.id],
      );
      const row = inserted.rows[0];
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, store_id, metadata)
         VALUES ($1, 'store.return_policy.updated', 'store_return_policy_version', $2, $3, $4, $5::jsonb)`,
        [session.user.id, row.id, store.accountId, store.id, JSON.stringify({ version: row.version })],
      );
      await client.query("COMMIT");
      send(res, 201, { success: true, draft: row });
      return;
    }

    if (action === "publish") {
      const draft = await client.query(
        `SELECT id, version, policy FROM member_store_return_policy_versions
         WHERE store_id=$1 AND publication_status='draft'
         ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [store.id],
      );
      if (!draft.rowCount) {
        await client.query("ROLLBACK");
        send(res, 409, { success: false, error: "No saved draft is available to publish" }); return;
      }
      const row = draft.rows[0];
      await client.query(
        `UPDATE member_store_return_policy_versions SET publication_status='withdrawn'
         WHERE store_id=$1 AND id<>$2 AND publication_status IN ('published','draft')`,
        [store.id, row.id],
      );
      await client.query(
        `UPDATE member_store_return_policy_versions
         SET publication_status='published', published_at=NOW() WHERE id=$1`,
        [row.id],
      );
      await client.query(
        `UPDATE stores SET return_policy=$1::jsonb, return_policy_version=$2,
           return_policy_published_at=NOW(), updated_at=NOW() WHERE id=$3`,
        [JSON.stringify(row.policy), row.version, store.id],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, store_id, metadata)
         VALUES ($1, 'store.return_policy.published', 'store_return_policy_version', $2, $3, $4, $5::jsonb)`,
        [session.user.id, row.id, store.accountId, store.id, JSON.stringify({ version: row.version })],
      );
      await client.query("COMMIT");
      send(res, 200, { success: true, published: { version: row.version, policy: row.policy } });
      return;
    }

    const active = await client.query(
      `SELECT id, version FROM member_store_return_policy_versions
       WHERE store_id=$1 AND publication_status='published' ORDER BY version DESC LIMIT 1 FOR UPDATE`,
      [store.id],
    );
    if (!active.rowCount) {
      await client.query("ROLLBACK");
      send(res, 409, { success: false, error: "Store has no published policy" }); return;
    }
    await client.query(
      `UPDATE member_store_return_policy_versions SET publication_status='withdrawn'
       WHERE id=$1`, [active.rows[0].id],
    );
    await client.query(
      `UPDATE stores SET return_policy=NULL, return_policy_published_at=NULL, updated_at=NOW()
       WHERE id=$1`, [store.id],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, store_id, metadata)
       VALUES ($1, 'store.return_policy.unpublished', 'store_return_policy_version', $2, $3, $4, $5::jsonb)`,
      [session.user.id, active.rows[0].id, store.accountId, store.id,
       JSON.stringify({ version: active.rows[0].version })],
    );
    await client.query("COMMIT");
    send(res, 200, { success: true, status: "not_provided" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("WASLA return policy transaction failed:", error);
    if (!res.headersSent) send(res, 500, { success: false, error: "Return policy service error" });
  } finally {
    client.release();
  }
}
