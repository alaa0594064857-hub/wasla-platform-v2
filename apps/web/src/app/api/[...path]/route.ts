import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = (
  process.env.WASLA_API_URL ?? "https://wasla-apiwasla-api-v2.onrender.com"
).replace(/\/$/, "");

const AUTH_UPSTREAM_ORIGIN = "https://wasla-web-4a64.onrender.com";
const ALLOWED_PUBLIC_ORIGINS = new Set([
  "https://wasla-web-preview.alaa0594064857.workers.dev",
  "https://wasla.trade",
  "https://www.wasla.trade",
]);

async function proxy(request: NextRequest): Promise<Response> {
  const incoming = new URL(request.url);
  const apiPath = incoming.pathname.replace(/^\/api\/?/, "");
  const isAuthRequest = apiPath === "auth" || apiPath.startsWith("auth/");
  const target = new URL(`/api/${apiPath}${incoming.search}`, API_BASE);

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");
  headers.delete("accept-encoding");

  // Better Auth currently trusts the original Render frontend origin.
  // Accept only known WASLA frontend origins, then proxy the auth request
  // using that already-trusted origin. Unknown browser origins are rejected.
  if (isAuthRequest) {
    const requestOrigin = request.headers.get("origin");
    if (requestOrigin) {
      if (!ALLOWED_PUBLIC_ORIGINS.has(requestOrigin)) {
        return Response.json({ message: "Origin is not allowed." }, { status: 403 });
      }
      headers.set("origin", AUTH_UPSTREAM_ORIGIN);
    }
  }

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  const upstream = await fetch(target, {
    method,
    headers,
    body,
    cache: "no-store",
    redirect: "manual",
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (
      key.toLowerCase() !== "set-cookie" &&
      key.toLowerCase() !== "content-length" &&
      key.toLowerCase() !== "transfer-encoding" &&
      key.toLowerCase() !== "connection" &&
      key.toLowerCase() !== "content-encoding"
    ) {
      responseHeaders.set(key, value);
    }
  });

  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie);
  }

  return new Response(
    method === "HEAD" ? null : await upstream.arrayBuffer(),
    { status: upstream.status, headers: responseHeaders },
  );
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
