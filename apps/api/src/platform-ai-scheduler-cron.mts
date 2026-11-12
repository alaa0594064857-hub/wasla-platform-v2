const apiUrl = process.env.WASLA_API_URL?.replace(/\/$/, "");
const token = process.env.WASLA_SCHEDULER_TOKEN?.trim();
if (!apiUrl || !token) throw new Error("WASLA_API_URL and scheduler token are required");
const response = await fetch(`${apiUrl}/api/internal/ai/scheduler/run`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  signal: AbortSignal.timeout(55000),
});
const body = await response.json().catch(() => ({}));
if (!response.ok || body.success !== true) {
  throw new Error(`WASLA scheduler API returned ${response.status}`);
}
console.info("WASLA scheduler trigger completed", {
  paused: body.paused === true,
  processed: Number(body.processed || 0),
});
