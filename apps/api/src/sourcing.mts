import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import type { PoolClient } from "pg";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUNTRY = /^[A-Z]{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

function reply(res: ServerResponse, status: number, data: Record<string, unknown>): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "";
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 30_000) throw new Error("BODY_TOO_LARGE");
    raw += chunk.toString();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function validText(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

async function sessionUser(req: IncomingMessage): Promise<string | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  return session?.user?.id ?? null;
}

export async function handleSourcingCollection(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    reply(res, 405, { success: false, error: "Method not allowed" });
    return;
  }
  try {
    const userId = await sessionUser(req);
    if (!userId) { reply(res, 401, { success: false, error: "Authentication required" }); return; }
    const db = getDatabasePool();
    if (req.method === "GET") {
      const result = await db.query(
        `SELECT id, item_name, description, specifications, quantity, unit,
                destination_country_code, destination_city, requested_currency,
                status, created_at, updated_at
         FROM sourcing_requests WHERE buyer_user_id = $1
         ORDER BY created_at DESC LIMIT 100`,
        [userId],
      );
      reply(res, 200, { success: true, requests: result.rows });
      return;
    }

    const body = await readBody(req);
    if (!body) { reply(res, 400, { success: false, error: "Invalid request body" }); return; }
    const itemName = body.itemName;
    const quantity = body.quantity;
    const unit = body.unit;
    const country = typeof body.destinationCountryCode === "string" ? body.destinationCountryCode.toUpperCase() : "";
    const city = body.destinationCity;
    const currency = body.requestedCurrency == null || body.requestedCurrency === ""
      ? null
      : typeof body.requestedCurrency === "string" ? body.requestedCurrency.toUpperCase() : "";
    const idempotencyKey = req.headers["idempotency-key"] ??
      (typeof body.idempotencyKey === "string" ? body.idempotencyKey : "");
    if (!validText(itemName, 2, 180) || typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity <= 0 ||
        !validText(unit, 1, 40) || !COUNTRY.test(country) || !validText(city, 2, 120) ||
        (currency !== null && (typeof currency !== "string" || !CURRENCY.test(currency))) ||
        typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      reply(res, 400, { success: false, error: "Please provide a valid item, quantity, unit, destination and idempotency key" });
      return;
    }
    const description = body.description == null ? null : body.description;
    if (description !== null && !validText(description, 1, 5000)) {
      reply(res, 400, { success: false, error: "Description must be 5000 characters or fewer" }); return;
    }
    const specifications = body.specifications ?? {};
    const deliveryLocation = body.deliveryLocation ?? {};
    if (typeof specifications !== "object" || specifications === null || Array.isArray(specifications) ||
        typeof deliveryLocation !== "object" || deliveryLocation === null || Array.isArray(deliveryLocation)) {
      reply(res, 400, { success: false, error: "Specifications and delivery location must be objects" }); return;
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO sourcing_requests
         (buyer_user_id, item_name, description, specifications, quantity, unit,
          destination_country_code, destination_city, delivery_location_snapshot,
          requested_currency, status, idempotency_key, submitted_at)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9::jsonb,$10,'submitted',$11,NOW())
         ON CONFLICT (buyer_user_id, idempotency_key) DO NOTHING
         RETURNING id, item_name, quantity, unit, destination_country_code, destination_city, status, created_at`,
        [userId, itemName.trim(), description, JSON.stringify(specifications), quantity, unit.trim(),
         country, city.trim(), JSON.stringify(deliveryLocation), currency, idempotencyKey],
      );
      if (inserted.rows.length === 0) {
        await client.query("ROLLBACK");
        const existing = await db.query(
          `SELECT id, item_name, quantity, unit, destination_country_code, destination_city, status, created_at
           FROM sourcing_requests WHERE buyer_user_id = $1 AND idempotency_key = $2 LIMIT 1`,
          [userId, idempotencyKey],
        );
        if (!existing.rows.length) {
          reply(res, 409, { success: false, error: "Idempotency key could not be resolved" });
          return;
        }
        reply(res, 200, { success: true, replayed: true, request: existing.rows[0] });
        return;
      }
      const created = inserted.rows[0];
      await client.query(
        `INSERT INTO sourcing_request_events (request_id, actor_user_id, event_type, to_status, metadata)
         VALUES ($1,$2,'request.submitted','submitted',$3::jsonb)`,
        [created.id, userId, JSON.stringify({ origin: "buyer" })],
      );
      await client.query("COMMIT");
      reply(res, 201, { success: true, request: created });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("WASLA sourcing collection API error:", error);
    const tooLarge = error instanceof Error && error.message === "BODY_TOO_LARGE";
    reply(res, tooLarge ? 413 : 500, { success: false, error: tooLarge ? "Request body is too large" : "Could not process sourcing request" });
  }
}

export async function handleSourcingRequestDetail(req: IncomingMessage, res: ServerResponse, requestId: string): Promise<void> {
  if (req.method !== "GET") { reply(res, 405, { success: false, error: "Method not allowed" }); return; }
  if (!UUID.test(requestId)) { reply(res, 400, { success: false, error: "Invalid request ID" }); return; }
  try {
    const userId = await sessionUser(req);
    if (!userId) { reply(res, 401, { success: false, error: "Authentication required" }); return; }
    const db = getDatabasePool();
    const requestResult = await db.query(
      `SELECT * FROM sourcing_requests WHERE id = $1 AND buyer_user_id = $2 LIMIT 1`,
      [requestId, userId],
    );
    if (!requestResult.rows.length) { reply(res, 404, { success: false, error: "Sourcing request not found" }); return; }
    const offers = await db.query(
      `SELECT o.id, o.supplier_account_id, a.display_name AS supplier_name,
              o.origin_country_code, o.offered_quantity, o.unit_price, o.currency,
              o.shipping_amount, o.lead_time_days, o.availability_confirmed_at,
              o.availability_valid_until, o.quote_valid_until, o.status, o.terms_snapshot
       FROM supplier_offers o
       INNER JOIN accounts a ON a.id = o.supplier_account_id
       WHERE o.request_id = $1 AND o.status NOT IN ('draft','withdrawn')
       ORDER BY o.created_at ASC`,
      [requestId],
    );
    reply(res, 200, { success: true, request: requestResult.rows[0], offers: offers.rows });
  } catch (error) {
    console.error("WASLA sourcing detail API error:", error);
    reply(res, 500, { success: false, error: "Could not load sourcing request" });
  }
}

export async function handleSupplierOffer(req: IncomingMessage, res: ServerResponse, requestId: string): Promise<void> {
  if (req.method !== "POST") { reply(res, 405, { success: false, error: "Method not allowed" }); return; }
  if (!UUID.test(requestId)) { reply(res, 400, { success: false, error: "Invalid request ID" }); return; }
  let client: PoolClient | undefined;
  try {
    const userId = await sessionUser(req);
    if (!userId) { reply(res, 401, { success: false, error: "Authentication required" }); return; }
    const body = await readBody(req);
    if (!body) { reply(res, 400, { success: false, error: "Invalid request body" }); return; }
    const accountId = body.supplierAccountId;
    const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : "";
    const quantity = body.offeredQuantity;
    const unitPrice = body.unitPrice;
    const shipping = body.shippingAmount ?? 0;
    const leadTime = body.leadTimeDays ?? null;
    if (typeof accountId !== "string" || !UUID.test(accountId) || !CURRENCY.test(currency) ||
        typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity <= 0 ||
        typeof unitPrice !== "number" && typeof unitPrice !== "string" ||
        !Number.isFinite(Number(unitPrice)) || Number(unitPrice) < 0 ||
        typeof shipping !== "number" && typeof shipping !== "string" ||
        !Number.isFinite(Number(shipping)) || Number(shipping) < 0 ||
        (leadTime !== null && (typeof leadTime !== "number" || !Number.isSafeInteger(leadTime) || leadTime < 0))) {
      reply(res, 400, { success: false, error: "Invalid supplier offer details" }); return;
    }
    const terms = body.termsSnapshot ?? {};
    if (typeof terms !== "object" || terms === null || Array.isArray(terms)) {
      reply(res, 400, { success: false, error: "Offer terms must be an object" }); return;
    }
    const db = getDatabasePool();
    client = await db.connect();
    await client.query("BEGIN");
    const membership = await client.query(
      `SELECT a.id, a.account_type, a.status, a.country_code
       FROM account_members am
       INNER JOIN accounts a ON a.id = am.account_id
       WHERE am.account_id = $1 AND am.user_id = $2
         AND am.status = 'active' AND a.status = 'active'
         AND a.account_type IN ('supplier','manufacturer')
       LIMIT 1`,
      [accountId, userId],
    );
    if (!membership.rows.length) {
      await client.query("ROLLBACK"); reply(res, 403, { success: false, error: "An active supplier or manufacturer account membership is required" }); return;
    }
    const origin = typeof membership.rows[0].country_code === "string" ? membership.rows[0].country_code.toUpperCase() : "";
    if (!COUNTRY.test(origin)) {
      await client.query("ROLLBACK"); reply(res, 409, { success: false, error: "Set a valid country on the supplier account before submitting offers" }); return;
    }
    const target = await client.query(
      `SELECT id, buyer_user_id, quantity, unit, status, destination_country_code
       FROM sourcing_requests WHERE id = $1 FOR UPDATE`,
      [requestId],
    );
    if (!target.rows.length || !["submitted","searching","offers_available"].includes(target.rows[0].status)) {
      await client.query("ROLLBACK"); reply(res, 404, { success: false, error: "Open sourcing request not found" }); return;
    }
    if (target.rows[0].buyer_user_id === userId) {
      await client.query("ROLLBACK"); reply(res, 403, { success: false, error: "Buyers cannot submit supplier offers to their own request" }); return;
    }
    const inserted = await client.query(
      `INSERT INTO supplier_offers
       (request_id, supplier_account_id, submitted_by_user_id, origin_country_code,
        offered_quantity, unit_price, currency, shipping_amount, lead_time_days,
        status, terms_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'availability_pending',$10::jsonb)
       RETURNING id, request_id, supplier_account_id, origin_country_code,
                 offered_quantity, unit_price, currency, shipping_amount, lead_time_days, status, created_at`,
      [requestId, accountId, userId, origin, quantity, String(unitPrice), currency,
       String(shipping), leadTime, JSON.stringify(terms)],
    );
    await client.query(
      `INSERT INTO sourcing_request_events (request_id, actor_user_id, event_type, metadata)
       VALUES ($1,$2,'supplier.offer_submitted',$3::jsonb)`,
      [requestId, userId, JSON.stringify({ offerId: inserted.rows[0].id, supplierAccountId: accountId })],
    );
    await client.query("COMMIT");
    reply(res, 201, { success: true, offer: inserted.rows[0], availability: "pending_supplier_confirmation" });
  } catch (error) {
    if (client) { try { await client.query("ROLLBACK"); } catch {} }
    console.error("WASLA supplier offer API error:", error);
    const tooLarge = error instanceof Error && error.message === "BODY_TOO_LARGE";
    reply(res, tooLarge ? 413 : 500, { success: false, error: tooLarge ? "Request body is too large" : "Could not submit supplier offer" });
  } finally {
    client?.release();
  }
}

export async function handleSupplierAvailability(req: IncomingMessage, res: ServerResponse, offerId: string): Promise<void> {
  if (req.method !== "PATCH") { reply(res, 405, { success: false, error: "Method not allowed" }); return; }
  if (!UUID.test(offerId)) { reply(res, 400, { success: false, error: "Invalid offer ID" }); return; }
  let client: PoolClient | undefined;
  try {
    const userId = await sessionUser(req);
    if (!userId) { reply(res, 401, { success: false, error: "Authentication required" }); return; }
    const body = await readBody(req);
    if (!body || (body.availability !== "available" && body.availability !== "unavailable")) {
      reply(res, 400, { success: false, error: "Availability must be available or unavailable" }); return;
    }
    const availabilityUntil = body.availabilityValidUntil;
    const quoteUntil = body.quoteValidUntil;
    if ((availabilityUntil !== undefined && availabilityUntil !== null && !validDate(availabilityUntil)) ||
        (quoteUntil !== undefined && quoteUntil !== null && !validDate(quoteUntil))) {
      reply(res, 400, { success: false, error: "Validity dates must be valid ISO date values" }); return;
    }
    if (body.availability === "available" && availabilityUntil && Date.parse(availabilityUntil as string) <= Date.now()) {
      reply(res, 400, { success: false, error: "Availability validity must be in the future" }); return;
    }
    if (quoteUntil && Date.parse(quoteUntil as string) <= Date.now()) {
      reply(res, 400, { success: false, error: "Quote validity must be in the future" }); return;
    }
    const db = getDatabasePool();
    client = await db.connect();
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE supplier_offers o
       SET status = $1,
           availability_confirmed_at = CASE WHEN $1 = 'available' THEN NOW() ELSE NULL END,
           availability_valid_until = $2,
           quote_valid_until = $3,
           updated_at = NOW()
       WHERE o.id = $4 AND o.submitted_by_user_id = $5
         AND o.status IN ('availability_pending','available','unavailable')
         AND EXISTS (
           SELECT 1 FROM account_members am
           INNER JOIN accounts a ON a.id = am.account_id
           WHERE am.account_id = o.supplier_account_id
             AND am.user_id = $5 AND am.status = 'active'
             AND a.status = 'active' AND a.account_type IN ('supplier','manufacturer')
         )
         AND EXISTS (
           SELECT 1 FROM sourcing_requests sr
           WHERE sr.id = o.request_id AND sr.status IN ('submitted','searching','offers_available')
         )
       RETURNING o.id, o.request_id, o.status, o.availability_confirmed_at,
                 o.availability_valid_until, o.quote_valid_until`,
      [body.availability, availabilityUntil ?? null, quoteUntil ?? null, offerId, userId],
    );
    if (!updated.rows.length) {
      await client.query("ROLLBACK");
      reply(res, 404, { success: false, error: "Offer not found or supplier access revoked" });
      return;
    }
    const row = updated.rows[0];
    if (row.status === "available") {
      await client.query(
        `UPDATE sourcing_requests SET status = 'offers_available', updated_at = NOW()
         WHERE id = $1 AND status IN ('submitted','searching')`,
        [row.request_id],
      );
    }
    await client.query(
      `INSERT INTO sourcing_request_events (request_id, actor_user_id, event_type, to_status, metadata)
       VALUES ($1,$2,'supplier.availability_confirmed',$3,$4::jsonb)`,
      [row.request_id, userId, row.status, JSON.stringify({ offerId, availabilityValidUntil: row.availability_valid_until, quoteValidUntil: row.quote_valid_until })],
    );
    await client.query("COMMIT");
    reply(res, 200, { success: true, offer: row });
  } catch (error) {
    if (client) { try { await client.query("ROLLBACK"); } catch {} }
    console.error("WASLA supplier availability API error:", error);
    const tooLarge = error instanceof Error && error.message === "BODY_TOO_LARGE";
    reply(res, tooLarge ? 413 : 500, { success: false, error: tooLarge ? "Request body is too large" : "Could not update supplier availability" });
  } finally {
    client?.release();
  }
}


export async function handleAcceptSupplierOffer(req: IncomingMessage, res: ServerResponse, requestId: string): Promise<void> {
  if (req.method !== "POST") { reply(res, 405, { success: false, error: "Method not allowed" }); return; }
  if (!UUID.test(requestId)) { reply(res, 400, { success: false, error: "Invalid request ID" }); return; }
  let client: PoolClient | undefined;
  try {
    const userId = await sessionUser(req);
    if (!userId) { reply(res, 401, { success: false, error: "Authentication required" }); return; }
    const body = await readBody(req);
    if (!body || typeof body.offerId !== "string" || !UUID.test(body.offerId)) {
      reply(res, 400, { success: false, error: "A valid offer ID is required" }); return;
    }
    const headerKey = req.headers["idempotency-key"];
    const idempotencyKey = typeof headerKey === "string" ? headerKey : body.idempotencyKey;
    if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      reply(res, 400, { success: false, error: "A valid idempotency key is required" }); return;
    }

    const pool = getDatabasePool();
    client = await pool.connect();
    await client.query("BEGIN");

    const requestResult = await client.query(
      `SELECT id, buyer_user_id, item_name, description, specifications, quantity,
              unit, destination_country_code, destination_city, delivery_location_snapshot,
              status
       FROM sourcing_requests WHERE id = $1 FOR UPDATE`,
      [requestId],
    );
    if (!requestResult.rows.length) {
      await client.query("ROLLBACK"); reply(res, 404, { success: false, error: "Sourcing request not found" }); return;
    }
    const sourcingRequest = requestResult.rows[0];
    if (sourcingRequest.buyer_user_id !== userId) {
      await client.query("ROLLBACK"); reply(res, 403, { success: false, error: "Only the buyer can accept an offer" }); return;
    }

    // Recheck after locking the request so concurrent retries with the same key replay safely.
    const prior = await client.query(
      `SELECT id, order_number, request_id, accepted_offer_id, status, currency,
              subtotal, shipping_total, grand_total, commercial_snapshot, created_at
       FROM sourcing_orders WHERE buyer_user_id = $1 AND idempotency_key = $2 LIMIT 1`,
      [userId, idempotencyKey],
    );
    if (prior.rows.length) {
      await client.query("COMMIT");
      reply(res, 200, { success: true, replayed: true, order: prior.rows[0], payment: "not_started" });
      return;
    }
    if (!["submitted", "searching", "offers_available"].includes(sourcingRequest.status)) {
      await client.query("ROLLBACK"); reply(res, 409, { success: false, error: "This sourcing request is no longer accepting offers" }); return;
    }

    const offerResult = await client.query(
      `SELECT o.*, a.display_name AS supplier_name, a.status AS supplier_account_status,
              a.account_type AS supplier_account_type
       FROM supplier_offers o
       INNER JOIN accounts a ON a.id = o.supplier_account_id
       WHERE o.id = $1 AND o.request_id = $2
       FOR UPDATE OF o`,
      [body.offerId, requestId],
    );
    if (!offerResult.rows.length) {
      await client.query("ROLLBACK"); reply(res, 404, { success: false, error: "Supplier offer not found" }); return;
    }
    const offer = offerResult.rows[0];
    const activeMembership = await client.query(
      `SELECT 1
       FROM account_members am
       INNER JOIN accounts a ON a.id = am.account_id
       WHERE am.account_id = $1 AND am.user_id = $2
         AND am.status = 'active' AND a.status = 'active'
         AND a.account_type IN ('supplier','manufacturer')
       LIMIT 1`,
      [offer.supplier_account_id, offer.submitted_by_user_id],
    );
    if (!activeMembership.rows.length) {
      await client.query("ROLLBACK");
      reply(res, 409, { success: false, error: "Supplier membership is no longer active" });
      return;
    }
    const now = Date.now();
    const validAvailability = offer.availability_valid_until === null || new Date(offer.availability_valid_until).getTime() > now;
    const validQuote = offer.quote_valid_until === null || new Date(offer.quote_valid_until).getTime() > now;
    if (offer.status !== "available" || !offer.availability_confirmed_at || !validAvailability || !validQuote ||
        Number(offer.offered_quantity) < Number(sourcingRequest.quantity) ||
        offer.supplier_account_status !== "active" ||
        !["supplier", "manufacturer"].includes(offer.supplier_account_type)) {
      await client.query("ROLLBACK");
      reply(res, 409, { success: false, error: "Offer is not currently eligible: supplier confirmation, quantity, account status or quote validity is insufficient" });
      return;
    }

    const totals = await client.query(
      `SELECT ROUND($1::numeric * $2::numeric, 2)::text AS subtotal,
              $3::numeric(14,2)::text AS shipping_total,
              ROUND(($1::numeric * $2::numeric) + $3::numeric, 2)::text AS grand_total`,
      [offer.unit_price, sourcingRequest.quantity, offer.shipping_amount],
    );
    const amount = totals.rows[0];
    const crossBorder = offer.origin_country_code !== sourcingRequest.destination_country_code;
    const snapshot = {
      itemName: sourcingRequest.item_name,
      description: sourcingRequest.description,
      specifications: sourcingRequest.specifications,
      quantity: sourcingRequest.quantity,
      unit: sourcingRequest.unit,
      destination: {
        countryCode: sourcingRequest.destination_country_code,
        city: sourcingRequest.destination_city,
        location: sourcingRequest.delivery_location_snapshot,
      },
      supplier: {
        accountId: offer.supplier_account_id,
        name: offer.supplier_name,
        originCountryCode: offer.origin_country_code,
      },
      offer: {
        offerId: offer.id,
        offeredQuantity: offer.offered_quantity,
        unitPrice: offer.unit_price,
        currency: offer.currency,
        shippingAmount: offer.shipping_amount,
        leadTimeDays: offer.lead_time_days,
        terms: offer.terms_snapshot,
        availabilityConfirmedAt: offer.availability_confirmed_at,
        availabilityValidUntil: offer.availability_valid_until,
        quoteValidUntil: offer.quote_valid_until,
      },
      fulfilment: { crossBorder },
      totals: amount,
    };
    const orderNumber = `WS-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
    await client.query(
      `UPDATE supplier_offers SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
      [offer.id],
    );
    await client.query(
      `UPDATE supplier_offers SET status = 'rejected', updated_at = NOW()
       WHERE request_id = $1 AND id <> $2
         AND status IN ('draft','submitted','availability_pending','available')`,
      [requestId, offer.id],
    );
    await client.query(
      `UPDATE sourcing_requests SET status = 'buyer_selected', updated_at = NOW() WHERE id = $1`,
      [requestId],
    );
    const created = await client.query(
      `INSERT INTO sourcing_orders
       (order_number, request_id, accepted_offer_id, buyer_user_id, supplier_account_id,
        status, currency, subtotal, shipping_total, grand_total, commercial_snapshot, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,'awaiting_payment',$6,$7,$8,$9,$10::jsonb,$11)
       RETURNING id, order_number, request_id, accepted_offer_id, status, currency,
                 subtotal, shipping_total, grand_total, commercial_snapshot, created_at`,
      [orderNumber, requestId, offer.id, userId, offer.supplier_account_id, offer.currency,
       amount.subtotal, amount.shipping_total, amount.grand_total, JSON.stringify(snapshot), idempotencyKey],
    );
    await client.query(
      `INSERT INTO sourcing_request_events (request_id, actor_user_id, event_type, from_status, to_status, metadata)
       VALUES ($1,$2,'buyer.offer_accepted',$3,'buyer_selected',$4::jsonb)`,
      [requestId, userId, sourcingRequest.status, JSON.stringify({ offerId: offer.id, orderId: created.rows[0].id })],
    );
    await client.query("COMMIT");
    reply(res, 201, { success: true, order: created.rows[0], payment: "not_started" });
  } catch (error) {
    if (client) { try { await client.query("ROLLBACK"); } catch {} }
    console.error("WASLA accept supplier offer API error:", error);
    reply(res, 500, { success: false, error: "Could not accept supplier offer" });
  } finally {
    client?.release();
  }
}
