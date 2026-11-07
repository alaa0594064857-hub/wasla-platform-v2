import type { IncomingMessage, ServerResponse } from "node:http";
import { authorizePlatformPermission } from "./platform-security.mjs";

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
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
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

/** Owner-only deterministic price preview. It never publishes a price or places an order. */
export async function handleOfficialStorePricingRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const access = await authorizePlatformPermission(request, response, "platform.manage");
    if (!access) return;
    if (request.method !== "POST") { reply(response, 405, { success: false, error: "Method not allowed" }); return; }
    let body: Record<string, unknown> | null;
    try { body = await readBody(request); }
    catch (error) {
      reply(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400,
        { success: false, error: "Invalid request body" }); return;
    }
    if (!body || !validAmount(body.supplierCost) || !validCurrency(body.supplierCurrency) ||
        !validAmount(body.shippingCost) || !validCurrency(body.shippingCurrency) ||
        !validCurrency(body.displayCurrency) ||
        typeof body.marginPercent !== "number" || !Number.isFinite(body.marginPercent) ||
        body.marginPercent < 0 || body.marginPercent > 500 ||
        !validAmount(body.fixedMargin ?? 0) ||
        (body.costs !== undefined && (!Array.isArray(body.costs) || body.costs.length > 20))) {
      reply(response, 400, { success: false, error: "Provide valid supplier/shipping costs, ISO currencies, margin percentage, fixed margin and up to 20 additional cost lines" }); return;
    }
    const target = body.displayCurrency;
    let supplierFxRate = 1;
    let shippingFxRate = 1;
    if (body.supplierCurrency !== target) {
      if (typeof body.supplierFxRate !== "number" || !Number.isFinite(body.supplierFxRate) || body.supplierFxRate <= 0 ||
          !isFreshFxRateTimestamp(body.supplierFxRateAsOf) ||
          typeof body.supplierFxSource !== "string" || !body.supplierFxSource.trim() || body.supplierFxSource.length > 180) {
        reply(response, 400, { success: false, error: "Supplier currency conversion requires a positive FX rate with a source timestamp no older than 24 hours and a source reference" }); return;
      }
      supplierFxRate = body.supplierFxRate;
    }
    if (body.shippingCurrency !== target) {
      if (typeof body.shippingFxRate !== "number" || !Number.isFinite(body.shippingFxRate) || body.shippingFxRate <= 0 ||
          !isFreshFxRateTimestamp(body.shippingFxRateAsOf) ||
          typeof body.shippingFxSource !== "string" || !body.shippingFxSource.trim() || body.shippingFxSource.length > 180) {
        reply(response, 400, { success: false, error: "Shipping currency conversion requires a positive FX rate with a source timestamp no older than 24 hours and a source reference" }); return;
      }
      shippingFxRate = body.shippingFxRate;
    }
    const supplier = body.supplierCost * supplierFxRate;
    const shipping = body.shippingCost * shippingFxRate;
    const rawCosts = (body.costs ?? []) as CostLine[];
    const costs = rawCosts.map(line => normalizeLine(line, target));
    if (costs.some(line => line === null)) {
      reply(response, 400, { success: false, error: "Each additional cost needs a valid amount, ISO currency and FX provenance no older than 24 hours when conversion is required" }); return;
    }
    const additional = (costs as NonNullable<typeof costs[number]>[]).reduce((sum, line) => sum + line.targetAmount, 0);
    const costSubtotal = supplier + shipping + additional;
    const margin = costSubtotal * (body.marginPercent / 100) + Number(body.fixedMargin ?? 0);
    const digits = currencyDigits(target);
    const factor = 10 ** digits;
    const finalPrice = Math.ceil((costSubtotal + margin) * factor - 1e-10) / factor;
    const roundedCost = Math.round(costSubtotal * factor) / factor;
    const roundedMargin = Math.round(margin * factor) / factor;
    const grossMarginPercent = finalPrice > 0
      ? Number(((finalPrice - roundedCost) / finalPrice * 100).toFixed(2))
      : 0;
    reply(response, 200, {
      success: true, previewOnly: true, published: false, currency: target,
      breakdown: {
        supplierCost: { amount: body.supplierCost, currency: body.supplierCurrency, convertedAmount: supplier, fxRate: supplierFxRate,
          ...(body.supplierCurrency !== target ? { fxRateAsOf: body.supplierFxRateAsOf, fxSource: body.supplierFxSource } : {}) },
        shippingCost: { amount: body.shippingCost, currency: body.shippingCurrency, convertedAmount: shipping, fxRate: shippingFxRate,
          ...(body.shippingCurrency !== target ? { fxRateAsOf: body.shippingFxRateAsOf, fxSource: body.shippingFxSource } : {}) },
        additionalCosts: costs, costSubtotal: roundedCost,
        margin: { percent: body.marginPercent, fixedAmount: body.fixedMargin ?? 0, total: roundedMargin },
        finalCustomerPrice: finalPrice,
        grossMarginPercent,
      },
      warnings: ["Taxes, customs, duties and payment fees are not estimated; add verified amounts as explicit cost lines.", "FX rates are supplied by the operator and must be timestamped within the last 24 hours; no live exchange-rate feed is assumed.", "This preview does not update the catalogue, expose supplier details to customers, publish products or place orders."],
    });
  } catch (error) {
    console.error("WASLA official store pricing error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Pricing preview service error" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
