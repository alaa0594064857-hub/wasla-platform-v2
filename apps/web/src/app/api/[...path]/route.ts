import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = (
  process.env.WASLA_API_URL ?? "https://wasla-apiwasla-api-v2.onrender.com"
).replace(/\/$/, "");

// Keep oversized requests from being fully buffered by the web service before
// they reach the API's own route-level validation.
const MAX_PROXY_BODY_BYTES = 10 * 1024 * 1024;

function payloadTooLarge(): Response {
  return Response.json(
    { success: false, error: "Request body too large", maxBytes: MAX_PROXY_BODY_BYTES },
    { status: 413, headers: { "Cache-Control": "no-store" } },
  );
}

async function readLimitedBody(request: NextRequest): Promise<ArrayBuffer | null> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^[0-9]+$/.test(declaredLength) &&
      Number(declaredLength) > MAX_PROXY_BODY_BYTES) {
    return null;
  }

  if (!request.body) return new ArrayBuffer(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PROXY_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

async function proxy(request: NextRequest): Promise<Response> {
  const incoming = new URL(request.url);
  const apiPath = incoming.pathname.replace(/^\/api\/?/, "");
  const target = new URL("/api/" + apiPath + incoming.search, API_BASE);

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");
  headers.delete("accept-encoding");

  const method = request.method.toUpperCase();
  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const limitedBody = await readLimitedBody(request);
    if (limitedBody === null) return payloadTooLarge();
    body = limitedBody;
  }

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
