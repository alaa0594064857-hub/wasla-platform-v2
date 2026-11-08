import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

const nativeFetch = globalThis.fetch.bind(globalThis);
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  connect: vi.fn(),
  query: vi.fn(),
  control: vi.fn(),
}));
vi.mock("./platform-security.mjs", () => ({ authorizePlatformPermission: mocks.authorize }));
vi.mock("./database.js", () => ({ getDatabasePool: () => ({ connect: mocks.connect }) }));
vi.mock("./platform-ai-controls.mjs", () => ({ getPlatformAiManagerControl: mocks.control }));

let handler: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => Promise<void>;
let server: Server | undefined;
let previousApiKey: string | undefined;
let previousModel: string | undefined;

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
  ({ handleAiProductDraftRequest: handler } = await import("./platform-ai-product-drafts.mjs"));
  previousApiKey = process.env.GEMINI_API_KEY;
  previousModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY = "test-key-not-real";
  delete process.env.GEMINI_MODEL;
  mocks.authorize.mockResolvedValue({ userId: "owner-1" });
  mocks.control.mockResolvedValue({ enabled: true, pausedReason: null });
  const client = { query: vi.fn(async (sql: string) => {
    if (sql.includes("INSERT INTO official_store_products")) return { rows: [{
      id: "product-draft-1", title_ar: "قارورة حرارية", title_en: "Insulated bottle",
      price: "0.00", currency: "USD", status: "draft", availability_status: "needs_confirmation",
    }] };
    return { rows: [] };
  }), release: vi.fn() };
  mocks.connect.mockResolvedValue(client);
  mocks.query.mockReset();
});

afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previousApiKey;
  if (previousModel === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = previousModel;
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("WASLA AI product drafts", () => {
  it("requires platform-owner authorization before reading the prompt or calling Gemini", async () => {
    mocks.authorize.mockImplementationOnce((_request, response) => {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ success: false, error: "Forbidden" }));
      return null;
    });
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const base = await startServer();
    const response = await nativeFetch(base, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Private product details" }),
    });
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("does not call Gemini or write a draft when the manager is paused", async () => {
    mocks.control.mockResolvedValueOnce({ enabled: false, pausedReason: "maintenance" });
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const base = await startServer();
    const response = await nativeFetch(base, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Stainless steel bottle" }),
    });
    expect(response.status).toBe(423);
    expect(upstream).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("returns a safe configuration error without exposing secrets when no Gemini key exists", async () => {
    delete process.env.GEMINI_API_KEY;
    const base = await startServer();
    const response = await nativeFetch(base, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Stainless steel bottle" }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ success: false, code: "AI_PROVIDER_NOT_CONFIGURED" });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("saves only an unpublished zero-price draft from the declared Gemini function call", async () => {
    const upstream = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ functionCall: { name: "create_product_draft", args: {
        title_ar: "قارورة حرارية", title_en: "Insulated bottle",
        description_ar: "قارورة من الستانلس ستيل بسعة لتر واحد.",
        description_en: "A one-litre stainless-steel bottle.",
        brand_name: "", model_name: "",
        normalized_specifications: { capacity: "1 litre", material: "stainless steel" },
        missing_information: ["supplier identity", "shipping terms"],
      } } }] } }] }),
    });
    vi.stubGlobal("fetch", upstream);
    const base = await startServer();
    const response = await nativeFetch(base, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "One litre stainless steel bottle" }),
    });
    const data = await response.json();
    expect(response.status).toBe(201);
    expect(data).toMatchObject({ success: true, product: { id: "product-draft-1", status: "draft", price: "0.00" } });
    expect(data.warnings).toContain("This is an unpublished draft only.");
    expect(data.warnings).toContain("No supplier, stock, shipping, image, rights, purchase or payment was verified or created.");
    const requestBody = JSON.parse(upstream.mock.calls[0][1].body);
    expect(upstream.mock.calls[0][0]).toContain("/models/gemini-3.5-flash-lite:generateContent");
    expect(requestBody.toolConfig.functionCallingConfig.mode).toBe("ANY");
    const client = await mocks.connect.mock.results[0].value;
    const statements = client.query.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(statements[0]).toBe("BEGIN");
    expect(statements[1]).toContain("INSERT INTO official_store_products");
    expect(statements[1]).toContain("'draft'");
    expect(statements[1]).toContain("0,'USD'");
    expect(statements[2]).toContain("official_store.product.draft_created_by_ai");
    expect(statements[3]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects a response without the declared function call and does not write a product", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "I found a supplier." }] } }] }),
    }));
    const base = await startServer();
    const response = await nativeFetch(base, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Bottle" }),
    });
    expect(response.status).toBe(502);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
