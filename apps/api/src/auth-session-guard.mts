import type { IncomingMessage, ServerResponse } from "node:http";

type SessionIdentity = { user: { id: string } };

type GuardDependencies = {
  getSession: (request: IncomingMessage) => Promise<SessionIdentity | null>;
  query: (sql: string, values: string[]) => Promise<{ rows: unknown[] }>;
};

/**
 * Revalidates a cookie-backed session against the authoritative user lifecycle
 * state. Inactive users have every persisted session revoked before the request
 * is rejected.
 */
export async function enforceActiveVerifiedSession(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: GuardDependencies,
): Promise<boolean> {
  if (!request.headers.cookie) return true;

  const session = await dependencies.getSession(request);
  if (!session?.user?.id) return true;

  const activeUser = await dependencies.query(
    `SELECT id
     FROM users
     WHERE id = $1
       AND status = 'active'
       AND email_verified = TRUE
     LIMIT 1`,
    [session.user.id],
  );

  if (activeUser.rows.length === 1) return true;

  await dependencies.query(
    "DELETE FROM auth_sessions WHERE user_id = $1",
    [session.user.id],
  );

  response.writeHead(401, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify({
    success: false,
    error: "An active, verified account is required",
  }));
  return false;
}
