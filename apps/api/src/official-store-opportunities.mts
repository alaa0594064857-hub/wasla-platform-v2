import type { IncomingMessage, ServerResponse } from "node:http";
import { authorizePlatformPermission } from "./platform-security.mjs";
import { getDatabasePool } from "./database.js";

function reply(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(data));
}
async function readBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk.toString();
    if (raw.length > 12000) throw new Error("BODY_TOO_LARGE");
  }
  const value: unknown = JSON.parse(raw || "{}");
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
const str = (v: unknown, max = 240) => typeof v === "string" ? v.trim().slice(0, max) : "";
const num = (v: unknown) => typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
const validHttps = (v: string) => { try { const u = new URL(v); return u.protocol === "https:" && !!u.hostname && !u.username && !u.password; } catch { return false; } };

/** Transparent, owner-only product opportunity assessment. It does not fetch, publish or purchase products. */
export async function handleOfficialStoreOpportunityAssessment(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const access = await authorizePlatformPermission(request, response, "platform.manage");
    if (!access) return;
    await getDatabasePool().query(`
      CREATE TABLE IF NOT EXISTS official_store_product_opportunities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title varchar(240) NOT NULL,
        market varchar(80) NOT NULL,
        currency varchar(3) NOT NULL,
        score integer NOT NULL,
        recommendation varchar(40) NOT NULL,
        assessment jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    if (request.method === "GET") {
      const saved = await getDatabasePool().query(
        `SELECT id, title, market, currency, score, recommendation, assessment, created_at
         FROM official_store_product_opportunities
         WHERE owner_user_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [access.userId],
      );
      reply(response, 200, { success: true, opportunities: saved.rows });
      return;
    }
    if (request.method !== "POST") { reply(response, 405, { success: false, error: "Method not allowed" }); return; }
    let body: Record<string, unknown> | null;
    try { body = await readBody(request); } catch (error) {
      reply(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, { success: false, error: "Invalid JSON body" }); return;
    }
    if (!body) { reply(response, 400, { success: false, error: "A JSON object is required" }); return; }
    const title = str(body.title);
    const market = str(body.market, 80);
    const evidenceUrl = str(body.demandEvidenceUrl, 2000);
    const evidenceDate = str(body.demandEvidenceDate, 40);
    const signal = num(body.demandSignalStrength);
    const currency = str(body.currency, 3).toUpperCase();
    const sellingPrice = num(body.sellingPrice);
    const supplierCost = num(body.supplierCost);
    const shippingCost = num(body.shippingCost);
    const extraCosts = num(body.extraCosts ?? 0);
    if (title.length < 3 || !market || !validHttps(evidenceUrl) || !Number.isFinite(Date.parse(evidenceDate)) ||
        !Number.isInteger(signal) || signal < 1 || signal > 5 ||
        !/^[A-Z]{3}$/.test(currency) ||
        ![sellingPrice, supplierCost, shippingCost, extraCosts].every(Number.isFinite) ||
        sellingPrice <= 0 || supplierCost < 0 || shippingCost < 0 || extraCosts < 0 ||
        [sellingPrice, supplierCost, shippingCost, extraCosts].some(n => Math.round(n * 100) !== n * 100)) {
      reply(response, 400, { success: false, error: "Enter a title, market, HTTPS demand evidence, evidence date, 1–5 signal strength, ISO currency and valid costs/prices." }); return;
    }
    const ageDays = Math.max(0, (Date.now() - Date.parse(evidenceDate)) / 86400000);
    const freshness = ageDays <= 30 ? 1 : ageDays <= 90 ? 0.75 : ageDays <= 180 ? 0.45 : 0.2;
    const demandScore = Math.round(signal / 5 * 40 * freshness);
    const landedCost = supplierCost + shippingCost + extraCosts;
    const grossProfit = sellingPrice - landedCost;
    const grossMarginPercent = grossProfit / sellingPrice * 100;
    const marginScore = grossMarginPercent >= 40 ? 25 : grossMarginPercent >= 30 ? 21 : grossMarginPercent >= 20 ? 16 : grossMarginPercent >= 10 ? 9 : grossMarginPercent > 0 ? 4 : 0;
    const checks = [
      ["supplier_identity_verified", body.supplierIdentityVerified === true, 3],
      ["exact_specifications_verified", body.specificationsVerified === true, 3],
      ["direct_shipping_confirmed", body.directShippingConfirmed === true, 2],
      ["returns_and_after_sales_confirmed", body.returnsConfirmed === true, 2],
    ] as const;
    const riskScore = checks.reduce((sum, item) => sum + (item[1] ? item[2] : 0), 0);
    const totalScore = demandScore + marginScore + riskScore;
    const missing: string[] = checks.filter(item => !item[1]).map(item => item[0]);
    if (ageDays > 90) missing.push("refresh_demand_evidence");
    if (grossMarginPercent < 20) missing.push("review_margin_and_missing_costs");
    if (!str(body.supplierEvidenceUrl, 2000) || !validHttps(str(body.supplierEvidenceUrl, 2000))) missing.push("supplier_identity_evidence_required");
    if (!str(body.specificationEvidenceUrl, 2000) || !validHttps(str(body.specificationEvidenceUrl, 2000))) missing.push("product_specification_evidence_required");
    const recommendation = totalScore >= 75 && missing.length === 0 ? "owner_review_recommended" :
      totalScore >= 55 ? "needs_more_evidence" : "low_priority_or_reject";
    const assessment = {
      success: true, assessmentOnly: true, title, market, currency,
      evidence: { url: evidenceUrl, date: new Date(Date.parse(evidenceDate)).toISOString(), ageDays: Math.round(ageDays), freshnessFactor: freshness, sourceType: str(body.demandSourceType, 40) || "owner_supplied" },
      score: { total: totalScore, maximum: 75, demand: demandScore, demandMaximum: 40, grossMargin: marginScore, grossMarginMaximum: 25, supplierReadiness: riskScore, supplierReadinessMaximum: 10 },
      economics: { landedCost: Math.round(landedCost * 100) / 100, grossProfitBeforeUnenteredCosts: Math.round(grossProfit * 100) / 100, grossMarginPercent: Math.round(grossMarginPercent * 100) / 100, note: "Gross estimate only; taxes, duties, payment fees, returns, advertising and other unentered costs may reduce profit." },
      recommendation, missingChecks: missing, verificationChecks: checks.map(([key, passed]) => ({ key, passed })),
      disclaimer: "Manual evidence-based assessment only. No live marketplace data was fetched, no supplier was independently verified, and no listing, order, payment or purchase was created.",
    };
    const saved = await getDatabasePool().query(
      `INSERT INTO official_store_product_opportunities
        (owner_user_id, title, market, currency, score, recommendation, assessment)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING id, created_at`,
      [access.userId, title, market, currency, totalScore, recommendation, JSON.stringify(assessment)],
    );
    reply(response, 200, { ...assessment, saved: true, opportunityId: saved.rows[0].id, createdAt: saved.rows[0].created_at });
  } catch (error) {
    console.error("Official store opportunity assessment error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Opportunity assessment failed" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
