import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  query: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
  authorizePlatformPermission: vi.fn(),
}));

vi.mock("./auth.mjs", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./database.js", () => ({
  getDatabasePool: () => ({ query: mocks.query, connect: mocks.connect }),
}));
vi.mock("./platform-security.mjs", () => ({
  authorizePlatformPermission: mocks.authorizePlatformPermission,
}));

let handleInvoices: (
  request: IncomingMessage,
  response: ServerResponse,
  invoiceId?: string,
) => Promise<void>;
let server: Server | undefined;

async function startServer(invoiceId?: string): Promise<string> {
  server = createServer((request, response) => {
    void handleInvoices(request, response, invoiceId);
  });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

const entryId = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const invoice = {
  id: invoiceId,
  commission_entry_id: entryId,
  invoice_sequence: "42",
  invoice_number: "WASLA-COM-2026-000042",
  status: "draft",
  amount: "125.000000",
  currency: "USD",
};

beforeEach(async () => {
  ({ handleBrokerageCommissionInvoices: handleInvoices } = await import("./trade-brokerage-commission-invoices.mjs"));
  mocks.getSession.mockResolvedValue({ user: { id: "platform-owner" } });
  mocks.authorizePlatformPermission.mockResolvedValue(true);
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
  }
  server = undefined;
  vi.resetAllMocks();
});

describe("WASLA brokerage commission invoice lifecycle", () => {
  it("rejects unauthenticated invoice access before permission or database work", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/commission-invoices`);

    expect(response.status).toBe(401);
    expect(mocks.authorizePlatformPermission).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("creates a numbered invoice draft from the commission amount snapshot", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: entryId, status: "recorded", commission_amount: "125.000000", commission_currency: "USD", commission_payer: "supplier" }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: invoiceId, invoice_sequence: "42" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [invoice] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/commission-invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionEntryId: entryId, recipientParty: "supplier", recipientName: "Supplier Ltd", recipientEmail: "billing@example.com", dueDate: "2026-12-01" }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, invoice: { invoice_number: "WASLA-COM-2026-000042", amount: "125.000000", currency: "USD" } });
    expect(String(mocks.query.mock.calls[3][0])).toContain("INSERT INTO trade_brokerage_commission_invoices");
    expect(mocks.query.mock.calls[3][1]).toContain("supplier");
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("does not create an invoice for a party other than the agreed commission payer", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: entryId, status: "recorded", commission_amount: "125", commission_currency: "USD", commission_payer: "supplier" }] });

    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/commission-invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionEntryId: entryId, recipientParty: "buyer", recipientName: "Buyer Ltd" }),
    });

    expect(response.status).toBe(400);
    expect(String(mocks.query.mock.calls.at(-1)?.[0])).toBe("ROLLBACK");
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("marks the linked commission entry invoiced when an invoice is issued", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [invoice] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ ...invoice, status: "issued" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const baseUrl = await startServer(invoiceId);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/commission-invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "issued" }),
    });

    expect(response.status).toBe(200);
    expect(String(mocks.query.mock.calls[3][0])).toContain("UPDATE trade_brokerage_commission_entries SET status='invoiced'");
    expect(String(mocks.query.mock.calls[4][0])).toContain("trade_brokerage_commission_invoice_events");
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("requires an issued invoice and HTTPS evidence before recording payment", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ ...invoice, status: "draft" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const baseUrl = await startServer(invoiceId);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/commission-invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid", evidenceUrl: "http://example.com/proof" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does not allow a draft invoice to be marked paid even with HTTPS evidence", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ ...invoice, status: "draft" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const baseUrl = await startServer(invoiceId);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/commission-invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid", evidenceUrl: "https://evidence.example.com/receipt/42" }),
    });

    expect(response.status).toBe(409);
    expect(String(mocks.query.mock.calls.at(-1)?.[0])).toBe("ROLLBACK");
  });

  it("rolls a cancelled invoice's linked commission entry back to recorded", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ ...invoice, status: "issued" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ ...invoice, status: "cancelled" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const baseUrl = await startServer(invoiceId);
    const response = await fetch(`${baseUrl}/api/trade/brokerage-agreements/commission-invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled", note: "Invoice cancelled" }),
    });

    expect(response.status).toBe(200);
    expect(String(mocks.query.mock.calls[3][0])).toContain("UPDATE trade_brokerage_commission_entries SET status='recorded'");
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });
});
