import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createWaslaServer } from "./server.js";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

vi.mock("./auth.mjs", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("./database.js", () => ({ getDatabasePool: vi.fn() }));

let server: Server | undefined;
const query = vi.fn();
const clientQuery = vi.fn();
const release = vi.fn();
const connect = vi.fn();

async function startServer() {
  const current = createWaslaServer();
  server = current;
  await new Promise<void>((resolve, reject) => {
    current.once("error", reject);
    current.listen(0, "127.0.0.1", resolve);
  });
  const address = current.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "11111111-1111-4111-8111-111111111111" },
  } as never);
  query.mockReset();
  clientQuery.mockReset();
  release.mockReset();
  connect.mockReset();
  connect.mockResolvedValue({ query: clientQuery, release });
  vi.mocked(getDatabasePool).mockReturnValue({ query, connect } as never);
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  }
  server = undefined;
  vi.clearAllMocks();
});

describe("verified product reviews", () => {
  const productId = "22222222-2222-4222-8222-222222222222";
  const endpoint = (base: string) => `${base}/api/products/${productId}/reviews`;

  it("requires a signed-in user to submit a review", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never);
    const base = await startServer();
    const response = await fetch(endpoint(base), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 5, body: "Excellent product and service." }),
    });
    expect(response.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });

  it("validates rating and review length before querying the database", async () => {
    const base = await startServer();
    const response = await fetch(endpoint(base), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 6, body: "Too short" }),
    });
    expect(response.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("accepts a review only when the signed-in buyer has a completed order containing the product", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ orderId: "33333333-3333-4333-8333-333333333333", storeId: "44444444-4444-4444-8444-444444444444" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "55555555-5555-4555-8555-555555555555", rating: 5, status: "pending_moderation" }] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const base = await startServer();
    const response = await fetch(endpoint(base), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 5, title: "Great", body: "Excellent product and fast delivery." }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, review: { status: "pending_moderation" } });
    const eligibilitySql = String(clientQuery.mock.calls[1][0]);
    expect(eligibilitySql).toContain("o.status = 'completed'");
    expect(eligibilitySql).toContain("o.buyer_user_id = $2");
    expect(eligibilitySql).toContain("o.items @> jsonb_build_array");
    expect(eligibilitySql).toContain("NOT EXISTS");
    expect(eligibilitySql).toContain("d.status IN ('open', 'merchant_responded')");
    expect(clientQuery.mock.calls[1][1]).toEqual([productId, "11111111-1111-4111-8111-111111111111"]);
    expect(String(clientQuery.mock.calls[2][0])).toContain("ON CONFLICT (order_id, product_id) DO NOTHING");
    expect(clientQuery.mock.calls[2][1]).toEqual([
      "33333333-3333-4333-8333-333333333333", productId,
      "44444444-4444-4444-8444-444444444444",
      "11111111-1111-4111-8111-111111111111", 5, "Great", "Excellent product and fast delivery.",
    ]);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
  });

  it("rejects users without a completed purchase of the product", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const base = await startServer();
    const response = await fetch(endpoint(base), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 4, body: "This review is long enough." }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false });
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO verified_product_reviews"), expect.anything());
  });

  it("does not allow duplicate reviews for the same order line", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ orderId: "33333333-3333-4333-8333-333333333333", storeId: "44444444-4444-4444-8444-444444444444" }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const base = await startServer();
    const response = await fetch(endpoint(base), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 4, body: "This review is long enough." }),
    });
    expect(response.status).toBe(409);
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("returns published reviews only and keeps buyer identity private", async () => {
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: productId }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "66666666-6666-4666-8666-666666666666", rating: 5, buyerLabel: "Verified buyer" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: 1, average: "5.00" }] });
    const base = await startServer();
    const response = await fetch(endpoint(base));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true, summary: { count: 1, average: "5.00" },
      reviews: [{ rating: 5, buyerLabel: "Verified buyer" }],
    });
    expect(String(query.mock.calls[1][0])).toContain("r.status = 'published'");
    expect(String(query.mock.calls[1][0])).not.toContain("buyer_user_id");
  });
  it("lets only the review owner edit and sends the revised version back to moderation", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: "66666666-6666-4666-8666-666666666666",
        buyerUserId: "11111111-1111-4111-8111-111111111111",
        rating: 4, title: "Original", body: "The original review text is long enough.", status: "published",
      }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "66666666-6666-4666-8666-666666666666", status: "pending_moderation" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const base = await startServer();
    const response = await fetch(`${base}/api/products/${productId}/reviews/66666666-6666-4666-8666-666666666666`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 5, title: "Updated", body: "The updated review text is long enough." }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, review: { status: "pending_moderation" } });
    expect(String(clientQuery.mock.calls[2][0])).toContain("INSERT INTO verified_product_review_edits");
    expect(String(clientQuery.mock.calls[3][0])).toContain("status = 'pending_moderation'");
    expect(String(clientQuery.mock.calls[4][0])).toContain("review.edited");
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
  });

  it("does not reveal or edit another buyer's review", async () => {
    clientQuery
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        buyerUserId: "99999999-9999-4999-8999-999999999999",
        rating: 4, title: null, body: "A different buyer review.", status: "published",
      }] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const base = await startServer();
    const response = await fetch(`${base}/api/products/${productId}/reviews/66666666-6666-4666-8666-666666666666`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 5, body: "Attempted unauthorized review edit." }),
    });
    expect(response.status).toBe(404);
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

});
