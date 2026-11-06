import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

type PlanInput = {
  code: string;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  amount: number;
  currency: string;
  billingInterval: "month" | "year" | "one_time";
  intervalCount?: number;
  trialDays?: number;
  entitlements?: Record<string, unknown>;
  isActive?: boolean;
  isPublic?: boolean;
  sortOrder?: number;
};

const editableFields = [
  "code", "nameAr", "nameEn", "descriptionAr", "descriptionEn",
  "amount", "currency", "billingInterval", "intervalCount", "trialDays",
  "entitlements", "isActive", "isPublic", "sortOrder",
] as const;

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
    if (raw.length > 20000) throw new Error("BODY_TOO_LARGE");
  }
  const parsed: unknown = JSON.parse(raw || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function validatePlan(input: Record<string, unknown>, partial = false): string | null {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  const required = ["code", "nameAr", "nameEn", "amount", "currency", "billingInterval"];
  if (!partial && required.some((key) => !has(key))) return "Missing required plan fields";
  if (has("code") && (typeof input.code !== "string" || !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(input.code))) return "Invalid plan code";
  if (has("nameAr") && (typeof input.nameAr !== "string" || !input.nameAr.trim() || input.nameAr.length > 160)) return "Invalid Arabic plan name";
  if (has("nameEn") && (typeof input.nameEn !== "string" || !input.nameEn.trim() || input.nameEn.length > 160)) return "Invalid English plan name";
  for (const key of ["descriptionAr", "descriptionEn"]) {
    if (has(key) && input[key] !== null && (typeof input[key] !== "string" || input[key].length > 5000)) return "Invalid plan description";
  }
  if (has("amount") && (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount < 0 || input.amount > 1000000000 || Math.round(input.amount * 100) !== input.amount * 100)) return "Invalid plan amount";
  if (has("currency") && (typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency))) return "Currency must be a 3-letter uppercase code";
  if (has("billingInterval") && !["month", "year", "one_time"].includes(String(input.billingInterval))) return "Invalid billing interval";
  if (has("intervalCount") && (!Number.isInteger(input.intervalCount) || Number(input.intervalCount) < 1 || Number(input.intervalCount) > 36)) return "Invalid billing interval count";
  if (has("trialDays") && (!Number.isInteger(input.trialDays) || Number(input.trialDays) < 0 || Number(input.trialDays) > 90)) return "Invalid trial days";
  if (has("sortOrder") && (!Number.isInteger(input.sortOrder) || Math.abs(Number(input.sortOrder)) > 100000)) return "Invalid sort order";
  if (has("entitlements") && (!input.entitlements || typeof input.entitlements !== "object" || Array.isArray(input.entitlements) || JSON.stringify(input.entitlements).length > 10000)) return "Entitlements must be a JSON object under 10 KB";
  if (has("isActive") && typeof input.isActive !== "boolean") return "Invalid active flag";
  if (has("isPublic") && typeof input.isPublic !== "boolean") return "Invalid public flag";
  if (input.isPublic === true && input.isActive === false) return "A public plan must be active";
  return null;
}

const columns: Record<(typeof editableFields)[number], string> = {
  code: "code", nameAr: "name_ar", nameEn: "name_en",
  descriptionAr: "description_ar", descriptionEn: "description_en",
  amount: "amount", currency: "currency", billingInterval: "billing_interval",
  intervalCount: "interval_count", trialDays: "trial_days",
  entitlements: "entitlements", isActive: "is_active", isPublic: "is_public",
  sortOrder: "sort_order",
};

function valuesFor(input: Record<string, unknown>, keys: readonly string[]): unknown[] {
  return keys.map((key) => key === "entitlements" ? JSON.stringify(input[key]) : input[key]);
}

/** Owner-only subscription plan administration plus a read-only public catalogue. */
export async function handleSubscriptionPlansRequest(
  request: IncomingMessage,
  response: ServerResponse,
  planId?: string,
  publicCatalogue = false,
): Promise<void> {
  try {
    if (publicCatalogue) {
      if (request.method !== "GET") {
        reply(response, 405, { success: false, error: "Method not allowed" });
        return;
      }
      const result = await getDatabasePool().query(
        `SELECT id, code, name_ar, name_en, description_ar, description_en,
                amount::text AS amount, currency, billing_interval, interval_count,
                trial_days, entitlements, sort_order
         FROM subscription_plans
         WHERE is_active = TRUE AND is_public = TRUE
         ORDER BY sort_order ASC, amount ASC, code ASC`,
      );
      reply(response, 200, { success: true, plans: result.rows });
      return;
    }

    const access = await authorizePlatformPermission(request, response, "platform.manage");
    if (!access) return;

    const db = getDatabasePool();
    if (request.method === "GET" && !planId) {
      const result = await db.query(
        `SELECT id, code, name_ar, name_en, description_ar, description_en,
                amount::text AS amount, currency, billing_interval, interval_count,
                trial_days, entitlements, is_active, is_public, sort_order,
                created_at, updated_at
         FROM subscription_plans
         ORDER BY sort_order ASC, created_at ASC`,
      );
      reply(response, 200, { success: true, plans: result.rows, billingEnabled: false });
      return;
    }

    if (request.method !== "POST" && !(request.method === "PATCH" && planId)) {
      reply(response, 405, { success: false, error: "Method not allowed" });
      return;
    }

    let body: Record<string, unknown> | null;
    try { body = await readBody(request); }
    catch (error) {
      reply(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, { success: false, error: "Invalid request body" });
      return;
    }
    if (!body) {
      reply(response, 400, { success: false, error: "A JSON object is required" });
      return;
    }
    const input: Record<string, unknown> = {};
    for (const key of editableFields) if (Object.prototype.hasOwnProperty.call(body, key)) input[key] = body[key];
    const validationError = validatePlan(input, request.method === "PATCH");
    if (validationError) {
      reply(response, 400, { success: false, error: validationError });
      return;
    }

    if (request.method === "POST") {
      const keys = editableFields.filter((key) => Object.prototype.hasOwnProperty.call(input, key));
      const sqlColumns = keys.map((key) => columns[key]);
      const placeholders = keys.map((key, index) => key === "entitlements" ? `$ ${index + 1}::jsonb`.replace("$ ", "$") : `$${index + 1}`);
      const result = await db.query(
        `INSERT INTO subscription_plans (${sqlColumns.join(", ")})
         VALUES (${placeholders.join(", ")})
         RETURNING id, code, name_ar, name_en, amount::text AS amount, currency,
                   billing_interval, interval_count, trial_days, entitlements,
                   is_active, is_public, sort_order, created_at, updated_at`,
        valuesFor(input, keys),
      );
      const plan = result.rows[0] as { id: string; code: string };
      await db.query(
        `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, metadata)
         VALUES ($1, 'subscription.plan.created', 'subscription_plan', $2, $3::jsonb)`,
        [access.userId, plan.id, JSON.stringify({ code: plan.code })],
      );
      reply(response, 201, { success: true, plan, billingEnabled: false });
      return;
    }

    const current = await db.query<{ is_active: boolean; is_public: boolean; code: string }>(
      "SELECT is_active, is_public, code FROM subscription_plans WHERE id = $1",
      [planId],
    );
    if (!current.rows[0]) {
      reply(response, 404, { success: false, error: "Subscription plan not found" });
      return;
    }
    if (input.isPublic === true && input.isActive === undefined && !current.rows[0].is_active) {
      reply(response, 400, { success: false, error: "Activate the plan before making it public" });
      return;
    }
    if (input.isActive === false && input.isPublic === undefined && current.rows[0].is_public) {
      input.isPublic = false;
    }
    const keys = editableFields.filter((key) => Object.prototype.hasOwnProperty.call(input, key));
    if (!keys.length) {
      reply(response, 400, { success: false, error: "No supported plan fields supplied" });
      return;
    }
    const assignments = keys.map((key, index) => `${columns[key]} = $${index + 1}${key === "entitlements" ? "::jsonb" : ""}`);
    const result = await db.query(
      `UPDATE subscription_plans
       SET ${assignments.join(", ")}, updated_at = NOW()
       WHERE id = $${keys.length + 1}
       RETURNING id, code, name_ar, name_en, description_ar, description_en,
                 amount::text AS amount, currency, billing_interval, interval_count,
                 trial_days, entitlements, is_active, is_public, sort_order,
                 created_at, updated_at`,
      [...valuesFor(input, keys), planId],
    );
    await db.query(
      `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, 'subscription.plan.updated', 'subscription_plan', $2, $3::jsonb)`,
      [access.userId, planId, JSON.stringify({ changed_fields: keys })],
    );
    reply(response, 200, { success: true, plan: result.rows[0], billingEnabled: false });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      reply(response, 409, { success: false, error: "A plan with this code already exists" });
      return;
    }
    console.error("WASLA subscription plans error:", error);
    if (!response.headersSent) reply(response, 500, { success: false, error: "Subscription plans service error" });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}
