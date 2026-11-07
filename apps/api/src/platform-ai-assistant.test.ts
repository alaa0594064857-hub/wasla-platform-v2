import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

const nativeFetch = globalThis.fetch.bind(globalThis);

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), query: vi.fn() }));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: mocks.authorize }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ query: mocks.query }) }));

let handler: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => Promise<void>;
let server: Server | undefined;
let previousApiKey: string | undefined;

async function startServer(): Promise<string> {
  server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  ({ handlePlatformAiAssistantRequest: handler } = await import("./platform-ai-assistant.mjs"));
  previousApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key-not-real";
  mocks.authorize.mockResolvedValue({ userId: "owner-1" });
});

afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previousApiKey;
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("WASLA owner AI order context", () => {
  it("declares read-only order access without granting order creation or payment actions", async () => {
    const base = await startServer();
    const response = await fetch(base);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.capabilities).toContain("read_recent_official_store_orders");
    expect(data.limitations).toContain("no_order_creation_or_payments");
    expect(data.readOnlyDataAccess).toBe(true);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("includes a bounded order snapshot without customer personal data", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ title_en: "Sample catalogue item" }] })
      .mockResolvedValueOnce({ rows: [{ supplier_name: "Private supplier" }] })
      .mockResolvedValueOnce({ rows: [{
        order_number: "WS-TEST-1", product_title_snapshot: "Sample catalogue item",
        quantity: 1, unit_price: "20.00", currency: "EUR",
        order_status: "awaiting_supplier", supplier_confirmation_status: "pending",
        payment_status: "not_enabled", shipping_status: "not_shipped",
        destination_country: "TR", owner_review_required: true,
        supplier_purchase_status: "not_placed",
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const upstreamFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "One supplier request is awaiting confirmation." }] } }] }),
    });
    vi.stubGlobal("fetch", upstreamFetch);
    const base = await startServer();
    const response = await nativeFetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Summarize pending requests" }] }),
    });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      success: true, advisoryOnly: true,
      dataContext: { mode: "read_only", officialStoreOrdersIncluded: 1 },
    });
    const sql = String(mocks.query.mock.calls[2][0]);
    expect(sql).toContain("FROM official_store_orders");
    expect(sql).toContain("LIMIT 50");
    expect(sql).not.toContain("customer_user_id");
    expect(sql).not.toContain("customer_email");
    const upstreamBody = JSON.parse(upstreamFetch.mock.calls[0][1].body);
    const systemText = upstreamBody.systemInstruction.parts[0].text;
    expect(systemText).toContain("WS-TEST-1");
    expect(systemText).toContain("payment_status");
    expect(systemText).toContain("no customer PII");
    expect(upstreamBody.systemInstruction.parts[0].text).not.toContain("customer@example.com");
  });

  it("does not expose AI data when owner authorization fails", async () => {
    mocks.authorize.mockImplementationOnce((_request, response) => {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ success: false, error: "Forbidden" }));
      return null;
    });
    const base = await startServer();
    const response = await fetch(base);
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
