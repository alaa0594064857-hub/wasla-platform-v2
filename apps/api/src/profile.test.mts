import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createWaslaServer } from "./server.js";
import { auth } from "./auth.mjs";
import { getDatabasePool } from "./database.js";

vi.mock("./auth.mjs", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("./database.js", () => ({
  getDatabasePool: vi.fn(),
}));

let server: Server | undefined;
const query = vi.fn();

async function startServer(): Promise<string> {
  server = createWaslaServer();
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "11111111-1111-4111-8111-111111111111", name: "Test User", email: "test@example.com", image: null },
  } as never);
  query.mockReset();
  vi.mocked(getDatabasePool).mockReturnValue({ query } as never);
});

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
  }
  server = undefined;
  vi.clearAllMocks();
});

describe("profile API validation and ownership", () => {
  it("requires authentication before reading profile data", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null as never);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/profile`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Authentication required" });
    expect(query).not.toHaveBeenCalled();
  });

  it("returns only the signed-in user's profile and account email", async () => {
    query.mockResolvedValueOnce({ rows: [{
      display_name: "A WASLA Member",
      avatar_reference: "https://cdn.example.com/avatar.webp",
      bio: "Member bio",
      website: "https://example.com",
      social_links: { linkedin: "https://linkedin.com/in/member" },
    }] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/profile`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      profile: {
        userId: "11111111-1111-4111-8111-111111111111",
        displayName: "A WASLA Member",
        avatarReference: "https://cdn.example.com/avatar.webp",
        bio: "Member bio",
        website: "https://example.com",
        socialLinks: { linkedin: "https://linkedin.com/in/member" },
        email: "test@example.com",
      },
    });
    expect(String(query.mock.calls[0][0])).toContain("WHERE user_id = $1");
    expect(query.mock.calls[0][1]).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  it("returns 400 for malformed JSON instead of an internal server error", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{invalid",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Invalid JSON body" });
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS avatar URLs before writing profile data", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Member",
        avatarReference: "http://example.com/avatar.png",
        bio: "",
        website: "",
        socialLinks: {},
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Use a valid image file or HTTPS image URL" });
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects GIF avatar data URLs because profile uploads allow only PNG, JPEG and WebP", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Member",
        avatarReference: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
        bio: "",
        website: "",
        socialLinks: {},
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Use a valid image file or HTTPS image URL" });
    expect(query).not.toHaveBeenCalled();
  });

  it("stores profile changes against the authenticated user id", async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "  Member Name  ",
        avatarReference: "https://cdn.example.com/avatar.webp",
        bio: "Hello",
        website: "https://example.com",
        socialLinks: { linkedin: "https://linkedin.com/in/member", unknown: "https://bad.example" },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, message: "Profile updated" });
    expect(String(query.mock.calls[0][0])).toContain("ON CONFLICT (user_id) DO UPDATE");
    expect(query.mock.calls[0][1]).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "Member Name",
      "https://cdn.example.com/avatar.webp",
      "Hello",
      "https://example.com",
      JSON.stringify({ linkedin: "https://linkedin.com/in/member" }),
    ]);
  });
});
