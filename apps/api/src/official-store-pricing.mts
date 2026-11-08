import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { authorizePlatformPermission } from "./platform-security.mjs";
import { getDatabasePool } from "./database.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CostLine = { type: string; amount: number; currency: string; fxRate?: number; fxRateAsOf?: string; fxSource?: string };

function reply(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });
  response.end(JSON.stringify(data));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk.toString();
    if (raw.length > 24000) throw new Error("BODY_TOO_LARGE");
  }
  const value: unknown = JSON.parse(raw || "{}");
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function validCurrency(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: value }).format(1);
    return true;
  } catch { return false; }
}

export function isValidDestinationCountry(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}

export function isOfferEligibleForDestination(
  offer: Record<string, unknown> | null | undefined,
  productId: string,
  destinationCountry: string,
): boolean {
  if (!offer || offer.product_id !== productId || offer.offer_status !== "approved" ||
      !["available", "limited"].includes(String(offer.availability_status)) ||
      offer.direct_to_customer_confirmed !== true || offer.supplier_identity_verified !== true ||
      offer.specifications_verified !== true || Number(offer.minimum_order_quantity) !== 1 ||
      offer.shipping_cost === null || offer.shipping_cost === undefined ||
      typeof offer.shipping_currency !== "string" || !validCurrency(offer.shipping_currency) || !offer.quote_valid_until ||
      !(new Date(String(offer.quote_valid_until)).getTime() > Date.now()) || !offer.last_verified_at) return false;
  const countries = Array.isArray(offer.ships_to_countries) ? offer.ships_to_countries : [];
  return countries.includes(destinationCountry);
}

function validAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000;
}

/** FX evidence must be recent enough for a customer-price preview (maximum age: 24 hours). */
export function isFreshFxRateTimestamp(value: unknown, now = Date.now()): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now + 300000 && timestamp >= now - 24 * 60 * 60 * 1000;
}

function currencyDigits(currency: string): number {
  return Number(new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2);
}

function convert(amount: number, currency: string, target: string, rate: unknown): number | null {
  if (currency === target) return amount;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || rate > 1_000_000) return null;
  return amount * rate;
}

function normalizeLine(line: CostLine, target: string): { type: string; sourceAmount: number; sourceCurrency: string; fxRate: number; targetAmount: number; fxRateAsOf?: string; fxSource?: string } | null {
  if (!line || typeof line !== "object" || typeof line.type !== "string" || !/^[a-z_]{2,40}$/.test(line.type) ||
      !validAmount(line.amount) || !validCurrency(line.currency)) return null;
  const rate = line.currency === target ? 1 : line.fxRate;
  const amount = convert(line.amount, line.currency, target, rate);
  if (amount === null) return null;
  if (line.currency !== target && (!isFreshFxRateTimestamp(line.fxRateAsOf) || !line.fxSource || line.fxSource.length > 180)) return null;
  return {
    type: line.type, sourceAmount: line.amount, sourceCurrency: line.currency,
    fxRate: Number(rate), targetAmount: amount,
    ...(line.currency !== target ? { fxRateAsOf: line.fxRateAsOf, fxSource: line.fxSource } : {}),
  };
}

export async function ensurePriceApprovalTables(): Promise<void> {
  const db = getDatabasePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS official_store_price_previews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES official_store_products(id) ON DELETE CASCADE,
      offer_id UUID NOT NULL REFERENCES official_store_product_source_offers(id) ON DELETE RESTRICT,
      destination_country CHAR(2) NOT NULL,
      currency CHAR(3) NOT NULL,
      customer_price NUMERIC(18,6) NOT NULL CHECK (customer_price >= 0),
      breakdown JSONB NOT NULL,
      created_by UUID NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS official_store_price_approvals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES official_store_products(id) ON DELETE CASCADE,
      offer_id UUID NOT NULL REFERENCES official_store_product_source_offers(id) ON DELETE RESTRICT,
      destination_country CHAR(2) NOT NULL,
      currency CHAR(3) NOT NULL,
      customer_price NUMERIC(18,6) NOT NULL CHECK (customer_price >= 0),
      breakdown JSONB NOT NULL,
      approved_by UUID NOT NULL,
      approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','revoked'))
    )
  `);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS official_store_one_active_price_per_destination
    ON official_store_price_approvals(product_id, destination_country) WHERE status = 'active'`);
  await db.query(`CREATE INDEX IF NOT EXISTS official_store_price_approvals_public_lookup
    ON official_store_price_approvals(destination_country, status, product_id)`);
}

async function handleApprovePrice(request: IncomingMessage, response: ServerResponse, userId: string): Promise<void> {
  let body: Record<string, unknown> | null;
  try { body = await readBody(request); } catch { reply(response, 400, { success: false, error: "Invalid request body" }); return; }
  if (!body || typeof body.previewId !== "string" || !UUID.test(body.previewId)) {
    reply(response, 400, { success: false, error: "A valid price preview ID is required" }); return;
  }
  const db = getDatabasePool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const previewResult = await client.query(
      `SELECT id, product_id, offer_id, destination_country, currency, trim_scale(customer_price)::text AS customer_price, breakdown
       FROM official_store_price_previews WHERE id = $1 AND created_by = $2 AND expires_at > NOW() FOR UPDATE`,
      [body.previewId, userId],
    );
    const preview = previewResult.rows[0] as {
      id: string; product_id: string; offer_id: string; destination_country: string;
      currency: string; customer_price: string; breakdown: Record<string, unknown>;
    } | undefined;
    if (!preview) {
      await client.query("ROLLBACK");
      reply(response, 409, { success: false, error: "Price preview expired or unavailable. Recalculate before approval." }); return;
    }
    const offerResult = await client.query(
      `SELECT id, product_id, supplier_price::text AS supplier_price, supplier_currency,
              shipping_cost::text AS shipping_cost, shipping_currency, minimum_order_quantity,
              ships_to_countries, direct_to_customer_confirmed, supplier_identity_verified,
              specifications_verified, quote_valid_until, last_verified_at, availability_status, offer_status
       FROM official_store_product_source_offers WHERE id = $1 AND product_id = $2 FOR UPDATE`,
      [preview.offer_id, preview.product_id],
    );
    const offer = offerResult.rows[0] as Record<string, unknown> | undefined;
    if (!offer || !isOfferEligibleForDestination(offer, preview.product_id, preview.destination_country)) {
      await client.query("ROLLBACK");
      reply(response, 409, { success: false, error: "Supplier offer is no longer eligible. Recalculate with a current approved offer." }); return;
    }
    await client.query(
      `UPDATE official_store_price_approvals SET status = 'superseded'
       WHERE product_id = $1 AND destination_country = $2 AND status = 'active'`,
      [preview.product_id, preview.destination_country],
    );
    const approved = await client.query(
      `INSERT INTO official_store_price_approvals
        (product_id, offer_id, destination_country, currency, customer_price, breakdown, approved_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
       RETURNING id, product_id, offer_id, destination_country, currency, trim_scale(customer_price)::text AS customer_price, approved_at, status`,
      [preview.product_id, preview.offer_id, preview.destination_country, preview.currency, preview.customer_price, JSON.stringify(preview.breakdown), userId],
    );
    await client.query(
      `INSERT INTO official_store_activity_log (actor_type, actor_user_id, product_id, action, details)
       VALUES ('human',$1,$2,'official_store.price.approved',$3::jsonb)`,
      [userId, preview.product_id, JSON.stringify({ approvalId: approved.rows[0].id, offerId: preview.offer_id, destinationCountry: preview.destination_country, currency: preview.currency, customerPrice: preview.customer_price })],
    );
    await client.query("DELETE FROM official_store_price_previews WHERE id = $1", [preview.id]);
    await client.query("COMMIT");
    reply(response, 200, { success: true, approval: approved.rows[0], publishable: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

/** Owner-only deterministic price preview. It never publishes a price or places an order. */
export async function handleOfficialStorePricingRequest(request: IncomingMessage, response: ServerResponse, action: "preview" | "approve" = "preview"): Promise<void> {
  try {
    const access = await authorizePlatformPermission(request, response, "platform.manage");
    if (!access) return;
    if (request.method !== "POST") { reply(response, 405, { success: false, error: "Method not allowed" }); return; }
    if (action === "approve") { await handleApprovePrice(request, response, access.userId); return; }
    let body: Record<string, unknown> | null;
    try { body = await readBody(request); }
    catch (error) {
      reply(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400,
        { success: false, error: "Invalid request body" }); return;
    }
    if (!body || typeof body.productId !== "string" || !UUID.test(body.productId) ||
        typeof body.offerId !== "string" || !UUID.test(body.offerId) ||
        !validCurrency(body.displayCurrency) ||
        !isValidDestinationCountry(body.destinationCountry) ||
        typeof body.marginPercent !== "number" || !Number.isFinite(body.marginPercent) ||
        body.marginPercent < 0 || body.marginPercent > 500 ||
        !validAmount(body.fixedMargin ?? 0) ||
        (body.costs !== undefined && (!Array.isArray(body.costs) || body.costs.length > 20))) {
      reply(response, 400, { success: false, error: "Select a verified supplier offer and provide a destination country, display currency, margin and up to 20 additional cost lines" }); return;
    }
    const db = getDatabasePool();
    const offerResult = await db.query(
      `SELECT id, product_id, supplier_price::text AS supplier_price, supplier_currency,
              shipping_cost::text AS shipping_cost, shipping_currency, minimum_order_quantity,
              ships_to_countries, direct_to_customer_confirmed, supplier_identity_verified,
              specifications_verified, quote_valid_until, last_verified_at, availability_status,
              offer_status
       FROM official_store_product_source_offers
       WHERE id = $1 AND product_id = $2
         AND offer_status = 'approved'
         AND availability_status IN ('available', 'limited')
         AND direct_to_customer_confirmed = TRUE
         AND supplier_identity_verified = TRUE
         AND specifications_verified = TRUE
         AND minimum_order_quantity = 1
         AND shipping_cost IS NOT NULL AND shipping_currency IS NOT NULL
         AND quote_valid_until > NOW() AND last_verified_at IS NOT NULL
       LIMIT 1`,
      [body.offerId, body.productId],
    );
    const offer = offerResult.rows[0] as {
      supplier_price: string; supplier_currency: string; shipping_cost: string;
      shipping_currency: string; ships_to_countries: unknown;
    } | undefined;
    if (!offer || !isOfferEligibleForDestination(offer as unknown as Record<string, unknown>, body.productId, body.destinationCountry)) {
      reply(response, 409, { success: false, error: "The selected offer is not approved, verified, current, or available for this destination country" }); return;
    }
    // Supplier and shipping costs always come from the verified offer, never from editable client fields.
    const supplierCost = Number(offer.supplier_price);
    const supplierCurrency = offer.supplier_currency;
    const shippingCost = Number(offer.shipping_cost);
    const shippingCurrency = offer.shipping_currency;
    const target = body.displayCurrency as string;
    const destinationCountry = body.destinationCountry as string;
    const productId = body.productId as string;
    const offerId = body.offerId as string;
    const marginPercent = body.marginPercent as number;
    if (!validAmount(supplierCost) || !validCurrency(supplierCurrency) ||
        !validAmount(shippingCost) || !validCurrency(shippingCurrency)) {
      reply(response, 409, { success: false, error: "The verified supplier offer contains invalid cost data" }); return;
    }
    let supplierFxRate = 1;
    let shippingFxRate = 1;
    const supplierFxSource = body.supplierFxSource;
    const shippingFxSource = body.shippingFxSource;
    if (supplierCurrency !== target) {
      if (typeof body.supplierFxRate !== "number" || !Number.isFinite(body.supplierFxRate) || body.supplierFxRate <= 0 || body.supplierFxRate > 1_000_000 ||
          !isFreshFxRateTimestamp(body.supplierFxRateAsOf) ||
          typeof supplierFxSource !== "string" || !supplierFxSource.trim() || supplierFxSource.length > 180) {
        reply(response, 400, { success: false, error: "Supplier currency conversion requires a positive FX rate with a source timestamp no older than 24 hours and a source reference" }); return;
      }
      supplierFxRate = body.supplierFxRate;
    }
    if (shippingCurrency !== target) {
      if (typeof body.shippingFxRate !== "number" || !Number.isFinite(body.shippingFxRate) || body.shippingFxRate <= 0 || body.shippingFxRate > 1_000_000 ||
          !isFreshFxRateTimestamp(body.shippingFxRateAsOf) ||
          typeof shippingFxSource !== "string" || !shippingFxSource.trim() || shippingFxSource.length > 180) {
        reply(response, 400, { success: false, error: "Shipping currency conversion requires a positive FX rate with a source timestamp no older than 24 hours and a source reference" }); return;
      }
      shippingFxRate = body.shippingFxRate;
    }
    const supplier = supplierCost * supplierFxRate;
    const shipping = shippingCost * shippingFxRate;
    if (!validAmount(supplier) || !validAmount(shipping)) {
      reply(response, 400, { success: false, error: "Converted supplier or shipping cost is outside the supported range" }); return;
    }
    const rawCosts = (body.costs ?? []) as CostLine[];
    const costs = rawCosts.map(line => normalizeLine(line, target));
    if (costs.some(line => line === null)) {
      reply(response, 400, { success: false, error: "Each additional cost needs a valid amount, ISO currency and FX provenance no older than 24 hours when conversion is required" }); return;
    }
    const additional = (costs as NonNullable<typeof costs[number]>[]).reduce((sum, line) => sum + line.targetAmount, 0);
    const costSubtotal = supplier + shipping + additional;
    if (!validAmount(costSubtotal)) {
      reply(response, 400, { success: false, error: "Total landed cost is outside the supported range" }); return;
    }
    const margin = costSubtotal * (marginPercent / 100) + Number(body.fixedMargin ?? 0);
    const digits = currencyDigits(target);
    const factor = 10 ** digits;
    const finalPrice = Math.ceil((costSubtotal + margin) * factor - 1e-10) / factor;
    const roundedCost = Math.round(costSubtotal * factor) / factor;
    const roundedMargin = Math.round(margin * factor) / factor;
    if (!validAmount(finalPrice) || finalPrice <= 0) {
      reply(response, 400, { success: false, error: "The calculated customer price must be positive and within the supported range" }); return;
    }
    const grossMarginPercent = Number(((finalPrice - roundedCost) / finalPrice * 100).toFixed(2));
    const previewId = randomUUID();
    const breakdown = {
         supplierCost: { amount: supplierCost, currency: supplierCurrency, convertedAmount: supplier, fxRate: supplierFxRate,
          ...(supplierCurrency !== target ? { fxRateAsOf: body.supplierFxRateAsOf, fxSource: supplierFxSource } : {}) },
        shippingCost: { amount: shippingCost, currency: shippingCurrency, convertedAmount: shipping, fxRate: shippingFxRate,
          ...(shippingCurrency !== target ? { fxRateAsOf: body.shippingFxRateAsOf, fxSource: shippingFxSource } : {}) },
        additionalCosts: costs, costSubtotal: roundedCost,
        margin: { percent: marginPercent, fixedAmount: body.fixedMargin ?? 0, total: roundedMargin },
        finalCustomerPrice: finalPrice,
        grossMarginPercent,
      };
    await db.query(
      `INSERT INTO official_store_price_previews
        (id, product_id, offer_id, destination_country, currency, customer_price, breakdown, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [previewId, productId, offerId, destinationCountry, target, finalPrice, JSON.stringify(breakdown), access.userId],
    );
    reply(response, 200, {
      success: true, previewOnly: true, published: false, previewId, productId, offerId, currency: target, destinationCountry,
      breakdown,
      warnings: ["Taxes, customs, duties and payment fees are not estimated; add verified amounts as explicit cost lines.", "FX rates are supplied by the operator and must be timestamped within the last 24 hours; no live exchange-rate feed is assumed.", "This preview uses the selected verified supplier offer but does not approve a customer price, update the catalogue, expose supplier details to customers, publish products or place orders."],
    });
  } catch (error) {
    console.error("WASLA official store pricing error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Pricing preview service error" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
