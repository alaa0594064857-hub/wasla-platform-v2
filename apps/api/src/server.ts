import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

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

export function createWaslaServer(): Server {
  return createServer(handleRequest);
}

export function startWaslaServer(): Server {
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? "0.0.0.0";

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      "PORT must be a valid number between 1 and 65535",
    );
  }

  const server = createWaslaServer();

  server.listen(port, host, () => {
    console.log(`WASLA API is running on ${host}:${port}`);
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

  return server;
}

if (require.main === module) {
  startWaslaServer();
}
