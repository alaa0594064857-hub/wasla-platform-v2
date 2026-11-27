import { describe, expect, it, vi } from "vitest";
import { enforceActiveVerifiedSession } from "./auth-session-guard.mjs";
import type { IncomingMessage, ServerResponse } from "node:http";

function responseMock() {
  const response = {
    writeHead: vi.fn(),
    end: vi.fn(),
    headersSent: false,
  };
  return response as unknown as ServerResponse & typeof response;
}

function requestWithCookie() {
  return { headers: { cookie: "better-auth.session_token=test-token" } } as IncomingMessage;
}

describe("active verified session guard", () => {
  it("does not query the database when no cookie is present", async () => {
    const getSession = vi.fn();
    const query = vi.fn();
    const allowed = await enforceActiveVerifiedSession(
      { headers: {} } as IncomingMessage,
      responseMock(),
      { getSession, query },
    );

    expect(allowed).toBe(true);
    expect(getSession).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("allows an active, verified user's session", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1" } });
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "user-1" }] });
    const response = responseMock();

    const allowed = await enforceActiveVerifiedSession(
      requestWithCookie(),
      response,
      { getSession, query },
    );

    expect(allowed).toBe(true);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][1]).toEqual(["user-1"]);
    expect(response.writeHead).not.toHaveBeenCalled();
  });

  it("revokes every persisted session and rejects suspended or unverified users", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-2" } });
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const response = responseMock();

    const allowed = await enforceActiveVerifiedSession(
      requestWithCookie(),
      response,
      { getSession, query },
    );

    expect(allowed).toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("DELETE FROM auth_sessions");
    expect(query.mock.calls[1][1]).toEqual(["user-2"]);
    expect(response.writeHead).toHaveBeenCalledWith(401, expect.objectContaining({
      "Cache-Control": "no-store",
    }));
    expect(response.end).toHaveBeenCalledWith(expect.stringContaining("active, verified"));
  });

  it("does not query user state when there is no valid session", async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    const query = vi.fn();
    const allowed = await enforceActiveVerifiedSession(
      requestWithCookie(),
      responseMock(),
      { getSession, query },
    );

    expect(allowed).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });
});
