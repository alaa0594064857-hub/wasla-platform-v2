import { getDatabasePool } from "./database.js";

type ClaimedNotification = {
  notification_id: string;
  attempts: number;
};

type PushTarget = {
  notification_id: string;
  user_id: string;
  type: string;
  title_ar: string;
  title_en: string;
  body_ar: string | null;
  body_en: string | null;
  action_url: string;
  token: string;
};

type PushTicket = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_ATTEMPTS = 8;
const BATCH_SIZE = 25;
const CLAIM_LEASE_MINUTES = 5;

class PushDeliveryError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "PushDeliveryError";
  }
}

function retryDelaySeconds(attempts: number): number {
  return Math.min(60 * 2 ** Math.max(0, attempts - 1), 6 * 60 * 60);
}

async function claimOutboxBatch(limit = BATCH_SIZE): Promise<ClaimedNotification[]> {
  const result = await getDatabasePool().query<ClaimedNotification>(
    `WITH candidates AS (
       SELECT notification_id
       FROM notification_push_outbox
       WHERE (status = 'pending' AND available_at <= NOW())
          OR (status = 'processing' AND claimed_at < NOW() - ($2::int * INTERVAL '1 minute'))
       ORDER BY available_at ASC, created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE notification_push_outbox AS outbox
     SET status = 'processing',
         attempts = outbox.attempts + 1,
         claimed_at = NOW(),
         updated_at = NOW()
     FROM candidates
     WHERE outbox.notification_id = candidates.notification_id
     RETURNING outbox.notification_id, outbox.attempts`,
    [limit, CLAIM_LEASE_MINUTES],
  );
  return result.rows;
}

async function loadPushTargets(notificationId: string): Promise<PushTarget[]> {
  const result = await getDatabasePool().query<PushTarget>(
    `SELECT n.id AS notification_id, n.user_id, n.type,
            n.title_ar, n.title_en, n.body_ar, n.body_en, n.action_url,
            d.token
     FROM notifications n
     JOIN notification_push_devices d ON d.user_id = n.user_id
     WHERE n.id = $1
     ORDER BY d.created_at ASC`,
    [notificationId],
  );
  return result.rows;
}

async function updateOutboxDelivered(notificationId: string): Promise<void> {
  await getDatabasePool().query(
    `UPDATE notification_push_outbox
     SET status = 'delivered', delivered_at = NOW(), claimed_at = NULL,
         last_error = NULL, updated_at = NOW()
     WHERE notification_id = $1 AND status = 'processing'`,
    [notificationId],
  );
}

async function updateOutboxFailure(
  notificationId: string,
  attempts: number,
  error: unknown,
  retryable: boolean,
): Promise<void> {
  const terminal = !retryable || attempts >= MAX_ATTEMPTS;
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  await getDatabasePool().query(
    `UPDATE notification_push_outbox
     SET status = $2,
         available_at = CASE WHEN $2 = 'pending'
           THEN NOW() + ($3::int * INTERVAL '1 second') ELSE available_at END,
         claimed_at = NULL,
         last_error = $4,
         updated_at = NOW()
     WHERE notification_id = $1 AND status = 'processing'`,
    [notificationId, terminal ? "dead" : "pending", retryDelaySeconds(attempts), message],
  );
}

async function sendExpoMessages(
  targets: PushTarget[],
  fetchImpl: typeof fetch,
): Promise<void> {
  for (let offset = 0; offset < targets.length; offset += 100) {
    const chunk = targets.slice(offset, offset + 100);
    const messages = chunk.map((target) => ({
      to: target.token,
      title: target.title_en || target.title_ar,
      body: target.body_en || target.body_ar || undefined,
      sound: "default",
      data: {
        notificationId: target.notification_id,
        type: target.type,
        actionUrl: target.action_url,
      },
    }));

    let response: Response;
    try {
      response = await fetchImpl(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN
            ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new PushDeliveryError(
        error instanceof Error ? error.message : "Expo push request failed",
        true,
      );
    }

    if (!response.ok) {
      throw new PushDeliveryError(
        `Expo push endpoint returned HTTP ${response.status}`,
        response.status === 408 || response.status === 429 || response.status >= 500,
      );
    }

    let payload: { data?: PushTicket[]; errors?: Array<{ message?: string }> };
    try {
      payload = await response.json() as typeof payload;
    } catch {
      throw new PushDeliveryError("Expo returned an unreadable response", true);
    }

    const tickets = Array.isArray(payload.data) ? payload.data : [];
    if (tickets.length !== chunk.length) {
      throw new PushDeliveryError("Expo returned an unexpected number of push tickets", true);
    }

    const rejected = tickets
      .map((ticket, index) => ({ ticket, target: chunk[index] }))
      .filter(({ ticket }) => ticket.status !== "ok");

    for (const { ticket, target } of rejected) {
      if (ticket.details?.error === "DeviceNotRegistered") {
        await getDatabasePool().query(
          "DELETE FROM notification_push_devices WHERE token = $1 AND user_id = $2",
          [target.token, target.user_id],
        );
      }
    }

    const retryableFailure = rejected.find(({ ticket }) =>
      ticket.details?.error !== "DeviceNotRegistered"
      && ticket.details?.error !== "MessageTooBig"
      && ticket.details?.error !== "MessageRateExceeded",
    );
    if (retryableFailure) {
      throw new PushDeliveryError(
        retryableFailure.ticket.message || retryableFailure.ticket.details?.error || "Expo rejected a push message",
        true,
      );
    }

    const permanentFailure = rejected.find(({ ticket }) =>
      ticket.details?.error !== "DeviceNotRegistered",
    );
    if (permanentFailure) {
      throw new PushDeliveryError(
        permanentFailure.ticket.message || permanentFailure.ticket.details?.error || "Expo rejected a push message",
        false,
      );
    }
  }
}

/**
 * Processes one bounded batch. Expo acceptance is recorded as "delivered";
 * device delivery receipts are a separate follow-up integration.
 */
export async function processPushOutboxBatch(
  fetchImpl: typeof fetch = fetch,
  limit = BATCH_SIZE,
): Promise<{ claimed: number; delivered: number; failed: number }> {
  const claimed = await claimOutboxBatch(limit);
  let delivered = 0;
  let failed = 0;

  for (const item of claimed) {
    try {
      const targets = await loadPushTargets(item.notification_id);
      if (targets.length === 0) {
        await updateOutboxFailure(
          item.notification_id,
          item.attempts,
          new Error("No registered push devices for recipient"),
          false,
        );
        failed += 1;
        continue;
      }

      await sendExpoMessages(targets, fetchImpl);
      await updateOutboxDelivered(item.notification_id);
      delivered += 1;
    } catch (error) {
      const retryable = error instanceof PushDeliveryError ? error.retryable : true;
      await updateOutboxFailure(item.notification_id, item.attempts, error, retryable);
      failed += 1;
    }
  }

  return { claimed: claimed.length, delivered, failed };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runNotificationPushWorker(): Promise<void> {
  const pollIntervalMs = Math.max(
    1_000,
    Number(process.env.WASLA_PUSH_POLL_INTERVAL_MS ?? 5_000),
  );
  console.log("WASLA notification push worker started");

  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  try {
    while (!stopping) {
      try {
        const result = await processPushOutboxBatch();
        if (result.claimed > 0) console.log("WASLA push batch:", result);
      } catch (error) {
        console.error("WASLA push worker batch failed:", error);
      }
      if (!stopping) await wait(pollIntervalMs);
    }
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    await getDatabasePool().end();
    console.log("WASLA notification push worker stopped");
  }
}

if (process.env.NODE_ENV !== "test") {
  if (process.env.WASLA_PUSH_WORKER_ENABLED !== "true") {
    console.error("WASLA_PUSH_WORKER_ENABLED must be true; worker will not start");
    process.exitCode = 1;
  } else {
    void runNotificationPushWorker().catch((error: unknown) => {
      console.error("WASLA notification push worker failed to start:", error);
      process.exitCode = 1;
    });
  }
}
