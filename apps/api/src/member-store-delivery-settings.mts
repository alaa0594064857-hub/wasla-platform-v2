import type { IncomingMessage, ServerResponse } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

function send(res: ServerResponse, status: number, data: Record<string, unknown>) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(data));
}
async function bodyOf(req: IncomingMessage): Promise<unknown> {
  let raw = ""; let size = 0;
  for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 12000) throw new Error("Body too large"); raw += chunk.toString(); }
  return JSON.parse(raw);
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export async function handleStoreDeliverySettingsRequest(req: IncomingMessage, res: ServerResponse, slug: string): Promise<void> {
  if (req.method !== "GET" && req.method !== "PATCH") { send(res, 405, { success: false, error: "Method not allowed" }); return; }
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) { send(res, 401, { success: false, error: "Authentication required" }); return; }
  const pool = getDatabasePool();
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS member_store_delivery_settings (
      store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
      delivery_enabled boolean NOT NULL DEFAULT false,
      pickup_enabled boolean NOT NULL DEFAULT false,
      service_areas jsonb NOT NULL DEFAULT '[]'::jsonb,
      delivery_fee numeric(12,2),
      fee_currency varchar(3) NOT NULL DEFAULT 'USD',
      preparation_days integer NOT NULL DEFAULT 0 CHECK (preparation_days BETWEEN 0 AND 90),
      delivery_note_ar varchar(1000),
      delivery_note_en varchar(1000),
      updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      CHECK (delivery_fee IS NULL OR delivery_fee >= 0),
      CHECK (delivery_enabled OR pickup_enabled)
    )`);
    const store = await client.query<{ id: string; account_id: string }>(
      "SELECT id, account_id FROM stores WHERE slug = $1 AND status = 'active' LIMIT 1", [slug],
    );
    if (!store.rowCount) { send(res, 404, { success: false, error: "Store not found" }); return; }
    const storeId = store.rows[0].id;
    if (req.method === "GET") {
      const access = await client.query(
        `SELECT 1 FROM stores s WHERE s.id = $1 AND (
          EXISTS (SELECT 1 FROM account_members am JOIN roles r ON r.id=am.role_id AND r.scope_type=am.role_scope
            JOIN role_permissions rp ON rp.role_id=r.id AND rp.scope_type=r.scope_type
            JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
            WHERE am.account_id=s.account_id AND am.user_id=$2 AND am.status='active'
              AND p.permission_key IN ('account.read','account.business.update'))
          OR EXISTS (SELECT 1 FROM store_members sm JOIN roles r ON r.id=sm.role_id AND r.scope_type=sm.role_scope
            JOIN role_permissions rp ON rp.role_id=r.id AND rp.scope_type=r.scope_type
            JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
            WHERE sm.store_id=s.id AND sm.user_id=$2 AND sm.status='active'
              AND p.permission_key IN ('store.read','store.update'))
        ) LIMIT 1`, [storeId, session.user.id],
      );
      if (!access.rowCount) { send(res, 403, { success: false, error: "You cannot view this store" }); return; }
      const result = await client.query(
        `SELECT delivery_enabled AS "deliveryEnabled", pickup_enabled AS "pickupEnabled",
          service_areas AS "serviceAreas", delivery_fee::text AS "deliveryFee",
          fee_currency AS "feeCurrency", preparation_days AS "preparationDays",
          delivery_note_ar AS "deliveryNoteAr", delivery_note_en AS "deliveryNoteEn",
          updated_at AS "updatedAt"
         FROM member_store_delivery_settings WHERE store_id=$1`, [storeId],
      );
      send(res, 200, { success: true, settings: result.rows[0] ?? {
        deliveryEnabled: false, pickupEnabled: false, serviceAreas: [], deliveryFee: null,
        feeCurrency: "USD", preparationDays: 0, deliveryNoteAr: null, deliveryNoteEn: null, updatedAt: null,
      }});
      return;
    }
    let body: unknown;
    try { body = await bodyOf(req); } catch { send(res, 400, { success: false, error: "Invalid request body" }); return; }
    if (!object(body)) { send(res, 400, { success: false, error: "Invalid request body" }); return; }
    const deliveryEnabled = body.deliveryEnabled;
    const pickupEnabled = body.pickupEnabled;
    const serviceAreas = body.serviceAreas;
    const deliveryFee = body.deliveryFee;
    const feeCurrency = body.feeCurrency;
    const preparationDays = body.preparationDays;
    const deliveryNoteAr = body.deliveryNoteAr;
    const deliveryNoteEn = body.deliveryNoteEn;
    if (typeof deliveryEnabled !== "boolean" || typeof pickupEnabled !== "boolean" || (!deliveryEnabled && !pickupEnabled)) {
      send(res, 400, { success: false, error: "Enable delivery, pickup, or both" }); return;
    }
    if (!Array.isArray(serviceAreas) || serviceAreas.length > 50 ||
        serviceAreas.some(area => typeof area !== "string" || area.trim().length < 2 || area.trim().length > 100) ||
        (deliveryEnabled && serviceAreas.length === 0)) {
      send(res, 400, { success: false, error: "Add at least one valid service area when delivery is enabled" }); return;
    }
    if (deliveryFee !== null && deliveryFee !== "" &&
        (typeof deliveryFee !== "string" || !/^\d{1,10}(?:\.\d{1,2})?$/.test(deliveryFee))) {
      send(res, 400, { success: false, error: "Enter a valid delivery fee or leave it blank for confirmation" }); return;
    }
    if (typeof feeCurrency !== "string" || !/^[A-Z]{3}$/.test(feeCurrency) ||
        !Number.isInteger(preparationDays) || (preparationDays as number) < 0 || (preparationDays as number) > 90 ||
        (deliveryNoteAr !== null && deliveryNoteAr !== undefined && (typeof deliveryNoteAr !== "string" || deliveryNoteAr.length > 1000)) ||
        (deliveryNoteEn !== null && deliveryNoteEn !== undefined && (typeof deliveryNoteEn !== "string" || deliveryNoteEn.length > 1000))) {
      send(res, 400, { success: false, error: "Check currency, preparation time, and notes" }); return;
    }
    await client.query("BEGIN");
    const permission = await client.query(
      `SELECT s.id FROM stores s WHERE s.id=$1 AND (
        EXISTS (SELECT 1 FROM account_members am JOIN roles r ON r.id=am.role_id AND r.scope_type=am.role_scope
          JOIN role_permissions rp ON rp.role_id=r.id AND rp.scope_type=r.scope_type
          JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
          WHERE am.account_id=s.account_id AND am.user_id=$2 AND am.status='active'
            AND p.permission_key='account.business.update')
        OR EXISTS (SELECT 1 FROM store_members sm JOIN roles r ON r.id=sm.role_id AND r.scope_type=sm.role_scope
          JOIN role_permissions rp ON rp.role_id=r.id AND rp.scope_type=r.scope_type
          JOIN permissions p ON p.id=rp.permission_id AND p.scope_type=rp.scope_type
          WHERE sm.store_id=s.id AND sm.user_id=$2 AND sm.status='active'
            AND p.permission_key='store.update')
      ) FOR UPDATE OF s`, [storeId, session.user.id],
    );
    if (!permission.rowCount) { await client.query("ROLLBACK"); send(res, 403, { success: false, error: "You cannot manage this store" }); return; }
    const saved = await client.query(
      `INSERT INTO member_store_delivery_settings
       (store_id, delivery_enabled, pickup_enabled, service_areas, delivery_fee, fee_currency,
        preparation_days, delivery_note_ar, delivery_note_en, updated_by, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (store_id) DO UPDATE SET delivery_enabled=EXCLUDED.delivery_enabled,
        pickup_enabled=EXCLUDED.pickup_enabled, service_areas=EXCLUDED.service_areas,
        delivery_fee=EXCLUDED.delivery_fee, fee_currency=EXCLUDED.fee_currency,
        preparation_days=EXCLUDED.preparation_days, delivery_note_ar=EXCLUDED.delivery_note_ar,
        delivery_note_en=EXCLUDED.delivery_note_en, updated_by=EXCLUDED.updated_by, updated_at=NOW()
       RETURNING delivery_enabled AS "deliveryEnabled", pickup_enabled AS "pickupEnabled",
        service_areas AS "serviceAreas", delivery_fee::text AS "deliveryFee",
        fee_currency AS "feeCurrency", preparation_days AS "preparationDays",
        delivery_note_ar AS "deliveryNoteAr", delivery_note_en AS "deliveryNoteEn", updated_at AS "updatedAt"`,
      [storeId, deliveryEnabled, pickupEnabled, JSON.stringify(serviceAreas.map(a => a.trim())), deliveryFee === "" ? null : deliveryFee,
       feeCurrency, preparationDays, deliveryNoteAr ?? null, deliveryNoteEn ?? null, session.user.id],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, account_id, store_id, metadata)
       VALUES ($1,'store.delivery_settings.updated','store_delivery_settings',$2,$3,$2,$4::jsonb)`,
      [session.user.id, storeId, store.rows[0].account_id, JSON.stringify({ deliveryEnabled, pickupEnabled, serviceAreaCount: serviceAreas.length, feeCurrency, preparationDays })],
    );
    await client.query("COMMIT");
    send(res, 200, { success: true, settings: saved.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("WASLA store delivery settings error:", error);
    send(res, 500, { success: false, error: "Could not save delivery settings" });
  } finally { client.release(); }
}

/** Public storefront projection: exposes only merchant-published fulfilment options. */
export async function handlePublicStoreDeliverySettingsRequest(_req: IncomingMessage, res: ServerResponse, slug: string): Promise<void> {
  const pool = getDatabasePool();
  try {
    const result = await pool.query(
      `SELECT d.delivery_enabled AS "deliveryEnabled", d.pickup_enabled AS "pickupEnabled",
        d.service_areas AS "serviceAreas", d.delivery_fee::text AS "deliveryFee",
        d.fee_currency AS "feeCurrency", d.preparation_days AS "preparationDays",
        d.delivery_note_ar AS "deliveryNoteAr", d.delivery_note_en AS "deliveryNoteEn"
       FROM stores s JOIN member_store_delivery_settings d ON d.store_id=s.id
       WHERE s.slug=$1 AND s.status='active' AND (d.delivery_enabled OR d.pickup_enabled)
       LIMIT 1`, [slug],
    );
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify({ success: true, settings: result.rows[0] ?? null }));
  } catch (error) {
    if ((error as { code?: string })?.code === "42P01") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ success: true, settings: null }));
      return;
    }
    console.error("WASLA public store delivery settings error:", error);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ success: false, error: "Could not load delivery options" }));
  }
}
