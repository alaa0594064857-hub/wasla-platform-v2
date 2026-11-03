import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";

function sendJson(
  response: ServerResponse,
  statusCode: number,
  data: Record<string, unknown>,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  response.end(JSON.stringify(data));
}

function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const requestUrl = new URL(
    request.url ?? "/",
    "http://localhost",
  );

  if (requestUrl.pathname === "/health") {
    if (request.method !== "GET") {
      sendJson(response, 405, {
        success: false,
        error: "Method not allowed",
      });
      return;
    }

    sendJson(response, 200, {
      success: true,
      service: "WASLA API",
      status: "healthy",
    });

    return;
  }

  sendJson(response, 404, {
    success: false,
    error: "Route not found",
  });
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be a valid number between 1 and 65535");
}

const server = createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`WASLA API is running on ${HOST}:${PORT}`);
});

server.on("error", (error: Error) => {
  console.error("WASLA API server error:", error);
  process.exitCode = 1;
});

function shutdown(): void {
  server.close((error) => {
    if (error) {
      console.error("Error while stopping WASLA API:", error);
      process.exitCode = 1;
      return;
    }

    console.log("WASLA API stopped.");
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
