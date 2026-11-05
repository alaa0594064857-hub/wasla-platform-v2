import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = (
  process.env.WASLA_API_URL ?? "https://wasla-apiwasla-api-v2.onrender.com"
).replace(/\/$/, "");

async function proxy(request: NextRequest): Promise<Response> {
  const incoming = new URL(request.url);
  const apiPath = incoming.pathname.replace(/^\/api\/?/, "");
  const target = new URL(`/api/${apiPath}${incoming.search}`, API_BASE);

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");
  headers.delete("accept-encoding");

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
