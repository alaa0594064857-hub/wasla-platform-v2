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

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const requestUrl = new URL(
    request.url ?? "/",
    "http://localhost",
  );

  // Authentication routes
  if (
    requestUrl.pathname === "/api/auth" ||
    requestUrl.pathname.startsWith("/api/auth/")
  ) {
    try {
      const [{ auth }, { toNodeHandler }] =
        await Promise.all([
          import("./auth.mjs"),
          import("better-auth/node"),
        ]);

      await toNodeHandler(auth.handler)(request, response);
    } catch (error) {
      console.error("WASLA authentication error:", error);

      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Authentication service error",
        });
      } else {
        response.destroy(
          error instanceof Error ? error : undefined,
        );
      }
    }

    return;
  }

  // User profile routes
  if (requestUrl.pathname === "/api/profile") {
    try {
      const { handleProfileRequest } =
        await import("./profile.mjs");

      await handleProfileRequest(request, response);
    } catch (error) {
      console.error("WASLA profile route error:", error);

      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Profile service error",
        });
      } else {
        response.destroy(
          error instanceof Error ? error : undefined,
        );
      }
    }

    return;
  }

  // Incoming business account invitations
  if (requestUrl.pathname === "/api/invitations") {
    try {
      const { handleInvitationsRequest } =
        await import("./invitations.mjs");

      await handleInvitationsRequest(request, response);
    } catch (error) {
      console.error("WASLA invitations route error:", error);

      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Invitations service error",
        });
      } else {
        response.destroy(
          error instanceof Error ? error : undefined,
        );
      }
    }

    return;
  }

  // Accept or revoke a business account invitation
  const memberActionMatch = requestUrl.pathname.match(
    /^\/api\/accounts\/([0-9a-f-]{36})\/members\/([0-9a-f-]{36})\/(accept|revoke)$/,
  );

  if (memberActionMatch) {
    try {
      const { handleMemberAction } =
        await import("./member-actions.mjs");

      await handleMemberAction(
        request,
        response,
        memberActionMatch[1],
        memberActionMatch[2],
        memberActionMatch[3] as "accept" | "revoke",
      );
    } catch (error) {
      console.error("WASLA member action route error:", error);

      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Member action service error",
        });
      } else {
        response.destroy(
          error instanceof Error ? error : undefined,
        );
      }
    }

    return;
  }

  // Update member role or membership status
  const memberManagementMatch = requestUrl.pathname.match(
    /^\/api\/accounts\/([0-9a-f-]{36})\/members\/([0-9a-f-]{36})$/,
  );

  if (
    memberManagementMatch &&
    request.method === "PATCH"
  ) {
    try {
      const { handleMemberManagement } =
        await import("./member-management.mjs");

      await handleMemberManagement(
        request,
        response,
        memberManagementMatch[1],
        memberManagementMatch[2],
      );
    } catch (error) {
      console.error(
        "WASLA member management error:",
        error,
      );

      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Member management service error",
        });
      } else {
        response.destroy(
          error instanceof Error ? error : undefined,
        );
      }
    }

    return;
  }

  // Business account member routes
  const membersMatch = requestUrl.pathname.match(
    /^\/api\/accounts\/([0-9a-f-]{36})\/members$/,
  );

  if (membersMatch) {
    try {
      const { handleMembersRequest } =
        await import("./members.mjs");

      await handleMembersRequest(
        request,
        response,
        membersMatch[1],
      );
    } catch (error) {
      console.error("WASLA members route error:", error);

      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Members service error",
        });
      } else {
        response.destroy(
          error instanceof Error ? error : undefined,
        );
      }
    }

    return;
  }

  // Business account routes
  if (requestUrl.pathname === "/api/accounts") {
    try {
      const { handleAccountsRequest } =
        await import("./accounts.mjs");

      await handleAccountsRequest(request, response);
    } catch (error) {
      console.error("WASLA accounts route error:", error);

      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Accounts service error",
        });
      } else {
        response.destroy(
          error instanceof Error ? error : undefined,
        );
      }
    }

    return;
  }

  // Health check
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

  // Unknown routes
  sendJson(response, 404, {
    success: false,
    error: "Route not found",
  });
}

const server: Server = createServer(
  (request, response) => {
    void handleRequest(request, response).catch(
      (error: unknown) => {
        console.error("WASLA API unhandled error:", error);

        if (!response.headersSent) {
          sendJson(response, 500, {
            success: false,
            error: "Internal server error",
          });
        } else {
          response.destroy(
            error instanceof Error ? error : undefined,
          );
        }
      },
    );
  },
);

const port = Number(process.env.PORT ?? 4000);

server.listen(port, "0.0.0.0", () => {
  console.log(`WASLA API listening on port ${port}`);
});
