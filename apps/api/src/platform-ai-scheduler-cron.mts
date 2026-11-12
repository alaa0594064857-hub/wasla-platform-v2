const apiUrl = process.env.WASLA_API_URL?.replace(/\/$/, "");
const token = process.env.WASLA_SCHEDULER_TOKEN?.trim();
if (!apiUrl || !token) throw new Error("WASLA_API_URL and scheduler token are required");
let lastError: unknown;
let completed = false;
for (let attempt = 1; attempt <= 4; attempt++) {
  try {
    const response = await fetch(`${apiUrl}/api/internal/ai/scheduler/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(9000),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.success === true) {
      console.info("WASLA scheduler trigger completed", {
        paused: body.paused === true,
        processed: Number(body.processed || 0),
        attempt,
      });
      completed = true;
      break;
    }
    if (![502, 503, 504].includes(response.status) || attempt === 4) {
      throw new Error(`WASLA scheduler API returned ${response.status}`);
    }
    lastError = new Error(`WASLA scheduler API returned ${response.status}`);
  } catch (error) {
    lastError = error;
    if (attempt === 4) break;
    if (error instanceof Error && error.message.startsWith("WASLA scheduler API returned ")) {
      const status = Number(error.message.match(/\\d+$/)?.[0]);
      if (![502, 503, 504].includes(status)) throw error;
    }
  }

  const delayMs = [2000, 4000, 6000][attempt - 1];
  console.warn("WASLA scheduler API temporarily unavailable; retrying", {
    attempt,
    nextAttempt: attempt + 1,
    delayMs,
    error: lastError instanceof Error ? lastError.message : "Unknown request failure",
  });
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
if (!completed) {
  throw lastError instanceof Error ? lastError : new Error("WASLA scheduler API failed after retries");
}
