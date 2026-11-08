import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "./database.js";
import { authorizePlatformPermission } from "./platform-security.mjs";

export const subscriptionStatuses = ["pending", "trialing", "active", "past_due", "paused", "canceled", "expired"] as const;
export type SubscriptionStatus = typeof subscriptionStatuses[number];

const transitions: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  pending: ["trialing", "active", "canceled"],
  trialing: ["active", "past_due", "paused", "canceled", "expired"],
  active: ["past_due", "paused", "canceled", "expired"],
  past_due: ["active", "paused", "canceled", "expired"],
  paused: ["active", "canceled", "expired"],
  canceled: [],
  expired: [],
};

export function canTransitionSubscription(from: string, to: string): boolean {
  return subscriptionStatuses.includes(from as SubscriptionStatus)
    && subscriptionStatuses.includes(to as SubscriptionStatus)
    && transitions[from as SubscriptionStatus].includes(to as SubscriptionStatus);
}

export function isSecureEvidenceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function send(response: ServerResponse, status: number, data: Record<string, unknown>): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });
  response.end(JSON.stringify(data));
}

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk.toString();
    if (Buffer.byteLength(raw) > 12000) throw new Error("BODY_TOO_LARGE");
  }
  const parsed: unknown = JSON.parse(raw || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_BODY");
  return parsed as Record<string, unknown>;
}

export function addBillingPeriod(start: Date, interval: string, count: number): Date | null {
  if (!Number.isInteger(count) || count < 1) return null;
  if (interval !== "month" && interval !== "year") return null;
  const end = new Date(start);
  const originalDay = end.getUTCDate();
  end.setUTCDate(1);
  if (interval === "month") end.setUTCMonth(end.getUTCMonth() + count);
  else end.setUTCFullYear(end.getUTCFullYear() + count);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(originalDay, lastDay));
  return end;
}

function validReason(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 8 && value.trim().length <= 2000;
}

/** Owner-only, manually audited subscription lifecycle. It never collects payments or trusts browser redirects. */
export async function handleSubscriptionLifecycleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  subscriptionId?: string,
): Promise<void> {
  const access = await authorizePlatformPermission(request, response, "platform.manage");
  if (!access) return;

  const db = getDatabasePool();

  if (request.method === "GET" && !subscriptionId) {
    const result = await db.query(
      `SELECT s.id, s.plan_id, p.code AS plan_code, p.name_ar, p.name_en,
              p.amount::text AS plan_amount, p.currency, p.billing_interval, p.interval_count,
              s.customer_user_id, cu.email AS customer_email,
              s.customer_account_id, a.display_name AS customer_account_name,
              s.billing_contact_user_id, bu.email AS billing_contact_email,
              s.status, s.current_period_start, s.current_period_end,
              s.trial_start, s.trial_end, s.cancel_at_period_end, s.canceled_at,
              s.started_at, s.created_at, s.updated_at
       FROM subscriptions s
       JOIN subscription_plans p ON p.id = s.plan_id
       LEFT JOIN users cu ON cu.id = s.customer_user_id
       LEFT JOIN accounts a ON a.id = s.customer_account_id
       JOIN users bu ON bu.id = s.billing_contact_user_id
       ORDER BY s.created_at DESC
       LIMIT 250`,
    );
    send(response, 200, { success: true, subscriptions: result.rows, billingEnabled: false });
    return;
  }

  if (request.method !== "POST" && !(request.method === "PATCH" && subscriptionId)) {
    send(response, 405, { success: false, error: "Method not allowed" });
    return;
  }

  if (subscriptionId && !isUuid(subscriptionId)) {
    send(response, 400, { success: false, error: "Invalid subscription ID" });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
  } catch (error) {
    send(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400,
      { success: false, error: "A valid JSON object is required" });
    return;
  }

  if (request.method === "POST") {
    const { planId, customerUserId, customerAccountId, billingContactUserId, reason } = body;
    if (!isUuid(planId) || !isUuid(billingContactUserId)
      || (customerUserId !== undefined && !isUuid(customerUserId))
      || (customerAccountId !== undefined && !isUuid(customerAccountId))
      || (Boolean(customerUserId) === Boolean(customerAccountId)) || !validReason(reason)) {
      send(response, 400, { success: false, error: "Provide a plan, exactly one customer, a billing contact, and an audit reason of at least 8 characters" });
      return;
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const plan = await client.query(
        "SELECT id, is_active FROM subscription_plans WHERE id = $1 FOR SHARE",
        [planId],
      );
      if (!plan.rows[0] || !plan.rows[0].is_active) {
        await client.query("ROLLBACK");
        send(response, 400, { success: false, error: "Only an existing active plan can be assigned" });
        return;
      }
      const contact = await client.query(
        "SELECT id FROM users WHERE id = $1 AND status = 'active' AND email_verified = TRUE",
        [billingContactUserId],
      );
      if (!contact.rows[0]) {
        await client.query("ROLLBACK");
        send(response, 400, { success: false, error: "Billing contact must be an active, verified user" });
        return;
      }
      if (customerUserId && customerUserId !== billingContactUserId) {
        const customer = await client.query("SELECT id FROM users WHERE id = $1 AND status = 'active'", [customerUserId]);
        if (!customer.rows[0]) {
          await client.query("ROLLBACK");
          send(response, 400, { success: false, error: "Customer user not found or inactive" });
          return;
        }
      }
      if (customerAccountId) {
        const membership = await client.query(
          `SELECT 1 FROM account_members
           WHERE account_id = $1 AND user_id = $2 AND status = 'active'
           LIMIT 1`,
          [customerAccountId, billingContactUserId],
        );
        if (!membership.rows[0]) {
          await client.query("ROLLBACK");
          send(response, 400, { success: false, error: "Billing contact must be an active member of the customer account" });
          return;
        }
      }
      const created = await client.query(
        `INSERT INTO subscriptions
           (plan_id, customer_user_id, customer_account_id, billing_contact_user_id, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id, plan_id, customer_user_id, customer_account_id,
                   billing_contact_user_id, status, created_at`,
        [planId, customerUserId ?? null, customerAccountId ?? null, billingContactUserId],
      );
      const subscription = created.rows[0] as { id: string };
      await client.query(
        `INSERT INTO subscription_admin_events
           (subscription_id, actor_user_id, event_type, from_status, to_status, reason)
         VALUES ($1, $2, 'created', NULL, 'pending', $3)`,
        [subscription.id, access.userId, reason.trim()],
      );
      await client.query("COMMIT");
      send(response, 201, { success: true, subscription: created.rows[0], billingEnabled: false });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  const nextStatus = body.status;
  const reason = body.reason;
  const evidenceUrl = body.evidenceUrl;
  if (!subscriptionStatuses.includes(nextStatus as SubscriptionStatus) || !validReason(reason)) {
    send(response, 400, { success: false, error: "A valid next status and audit reason of at least 8 characters are required" });
    return;
  }
  if (evidenceUrl !== undefined && evidenceUrl !== "" && !isSecureEvidenceUrl(evidenceUrl)) {
    send(response, 400, { success: false, error: "Evidence URL must be a secure HTTPS URL without embedded credentials" });
    return;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT s.id, s.status, p.amount::text AS amount, p.trial_days,
              p.billing_interval, p.interval_count
       FROM subscriptions s
       JOIN subscription_plans p ON p.id = s.plan_id
       WHERE s.id = $1
       FOR UPDATE OF s`,
      [subscriptionId],
    );
    const row = current.rows[0] as {
      id: string; status: SubscriptionStatus; amount: string; trial_days: number;
      billing_interval: string; interval_count: number;
    } | undefined;
    if (!row) {
      await client.query("ROLLBACK");
      send(response, 404, { success: false, error: "Subscription not found" });
      return;
    }
    if (!canTransitionSubscription(row.status, nextStatus as string)) {
      await client.query("ROLLBACK");
      send(response, 409, { success: false, error: `Transition from ${row.status} to ${String(nextStatus)} is not allowed` });
      return;
    }
    if (nextStatus === "trialing" && Number(row.trial_days) < 1) {
      await client.query("ROLLBACK");
      send(response, 400, { success: false, error: "This plan does not include an approved trial period" });
      return;
    }
    if (nextStatus === "active" && Number(row.amount) > 0 && !isSecureEvidenceUrl(evidenceUrl)) {
      await client.query("ROLLBACK");
      send(response, 400, { success: false, error: "Paid-plan activation requires an HTTPS payment evidence URL and explicit owner review" });
      return;
    }

    const now = new Date();
    const periodEnd = addBillingPeriod(now, row.billing_interval, Number(row.interval_count));
    const trialEnd = nextStatus === "trialing"
      ? new Date(now.getTime() + Number(row.trial_days) * 86400000)
      : null;
    await client.query(
      `UPDATE subscriptions
       SET status = $2,
           started_at = CASE WHEN $2 IN ('active','trialing') THEN COALESCE(started_at, $3) ELSE started_at END,
           current_period_start = CASE WHEN $2 IN ('active','trialing') THEN $3 ELSE current_period_start END,
           current_period_end = CASE WHEN $2 = 'trialing' THEN $4 WHEN $2 = 'active' THEN $5 ELSE current_period_end END,
           trial_start = CASE WHEN $2 = 'trialing' THEN $3 ELSE trial_start END,
           trial_end = CASE WHEN $2 = 'trialing' THEN $4 ELSE trial_end END,
           canceled_at = CASE WHEN $2 = 'canceled' THEN $3 ELSE canceled_at END,
           cancel_at_period_end = CASE WHEN $2 IN ('canceled','paused') THEN FALSE ELSE cancel_at_period_end END,
           updated_at = NOW()
       WHERE id = $1`,
      [subscriptionId, nextStatus, now, trialEnd, periodEnd],
    );
    await client.query(
      `INSERT INTO subscription_admin_events
         (subscription_id, actor_user_id, event_type, from_status, to_status, reason, evidence_url)
       VALUES ($1, $2, 'status_changed', $3, $4, $5, $6)`,
      [subscriptionId, access.userId, row.status, nextStatus, reason.trim(),
        typeof evidenceUrl === "string" && evidenceUrl ? evidenceUrl : null],
    );
    const updated = await client.query(
      `SELECT id, plan_id, customer_user_id, customer_account_id, billing_contact_user_id,
              status, current_period_start, current_period_end, trial_start, trial_end,
              cancel_at_period_end, canceled_at, started_at, updated_at
       FROM subscriptions WHERE id = $1`,
      [subscriptionId],
    );
    await client.query("COMMIT");
    send(response, 200, { success: true, subscription: updated.rows[0], billingEnabled: false });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
