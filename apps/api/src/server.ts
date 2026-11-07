
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

  if (
    requestUrl.pathname === "/api/auth" ||
    requestUrl.pathname.startsWith("/api/auth/")
  ) {
    try {
      const [{ auth }, { toNodeHandler }] = await Promise.all([
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
        response.destroy(error instanceof Error ? error : undefined);
      }
    }

    return;
  }

  const publicStoreMatch = requestUrl.pathname.match(/^\/api\/public\/stores\/([^/]+)$/);
  const publicProductMatch = requestUrl.pathname.match(/^\/api\/public\/products\/([0-9a-f-]{36})$/i);
  if (publicStoreMatch || publicProductMatch) {
    try {
      const { handlePublicCatalogRequest } = await import("./public-catalog.mjs");
      await handlePublicCatalogRequest(
        request, response,
        publicStoreMatch ? decodeURIComponent(publicStoreMatch[1]) : undefined,
        publicProductMatch?.[1],
      );
    } catch (error) {
      console.error("WASLA public catalog route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Public catalog service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (/^\/api\/trade\/deals(?:\/[0-9a-f-]{36})?$/i.test(requestUrl.pathname)) {
    const dealId = requestUrl.pathname.match(/^\/api\/trade\/deals\/([0-9a-f-]{36})$/i)?.[1];
    try {
      const { handleTradeRequest } = await import("./trade.mjs");
      await handleTradeRequest(request, response, dealId);
    } catch (error) {
      console.error("WASLA trade route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Trade service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (/^\/api\/notifications(?:\/read-all|\/[0-9a-f-]{36}\/read)?$/i.test(requestUrl.pathname)) {
    try {
      const { handleNotificationsRequest } = await import("./notifications.mjs");
      await handleNotificationsRequest(request, response);
    } catch (error) {
      console.error("WASLA notifications route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Notifications service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (/^\/api\/product-inquiries(?:\/[0-9a-f-]{36}\/(?:replies|status))?$/i.test(requestUrl.pathname)) {
    try {
      const { handleProductInquiriesRequest } = await import("./product-inquiries.mjs");
      await handleProductInquiriesRequest(request, response);
    } catch (error) {
      console.error("WASLA product inquiries route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Product inquiries service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const messageConversationMatch = requestUrl.pathname.match(/^\/api\/messages\/([0-9a-f-]{36})$/i);
  if (messageConversationMatch || requestUrl.pathname === "/api/messages") {
    try {
      const { handleMessagesRequest } = await import("./messages.mjs");
      await handleMessagesRequest(request, response, messageConversationMatch?.[1]);
    } catch (error) {
      console.error("WASLA messages route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Messages service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const officialStoreOrderMatch = requestUrl.pathname.match(/^\/api\/platform\/official-store\/orders(?:\/([0-9a-f-]{36}))?$/i);
  if (officialStoreOrderMatch) {
    try {
      const { handleOfficialStoreOrdersRequest } = await import("./official-store-orders.mjs");
      await handleOfficialStoreOrdersRequest(request, response, officialStoreOrderMatch[1]);
    } catch (error) {
      console.error("WASLA official store order desk route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Official store order desk error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const officialStoreSourcingMatch = requestUrl.pathname.match(/^\/api\/platform\/official-store\/sourcing-candidates(?:\/([0-9a-f-]{36}))?$/i);
  if (officialStoreSourcingMatch) {
    try {
      const { handleOfficialStoreSourcingRequest } = await import("./official-store-sourcing.mjs");
      await handleOfficialStoreSourcingRequest(request, response, officialStoreSourcingMatch[1]);
    } catch (error) {
      console.error("WASLA official store sourcing route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Official store sourcing service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/platform/official-store/candidates/enrich") {
    try {
      const { handleOfficialStoreCandidateEnrichment } = await import("./official-store-candidate-enrichment.mjs");
      await handleOfficialStoreCandidateEnrichment(request, response);
    } catch (error) {
      console.error("Official store candidate enrichment route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Product enrichment service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/platform/official-store/import-candidates") {
    try {
      const { handleOfficialStoreImportCandidatesRequest } = await import("./official-store-import-candidates.mjs");
      await handleOfficialStoreImportCandidatesRequest(request, response);
    } catch (error) {
      console.error("WASLA official store import route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Import candidate service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/platform/official-store/product-matches") {
    try {
      const { handleOfficialStoreProductMatchesRequest } = await import("./official-store-product-matches.mjs");
      await handleOfficialStoreProductMatchesRequest(request, response);
    } catch (error) {
      console.error("WASLA official store product matching route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Product matching service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const officialStoreDataSourceMatch = requestUrl.pathname.match(/^\/api\/platform\/official-store\/data-sources(?:\/([0-9a-f-]{36}))?$/i);
  if (officialStoreDataSourceMatch) {
    try {
      const { handleOfficialStoreDataSourcesRequest } = await import("./official-store-data-sources.mjs");
      await handleOfficialStoreDataSourcesRequest(request, response, officialStoreDataSourceMatch[1]);
    } catch (error) {
      console.error("WASLA official store data source registry route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Data source registry service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/platform/official-store/opportunities/assess") {
    try {
      const { handleOfficialStoreOpportunityAssessment } = await import("./official-store-opportunities.mjs");
      await handleOfficialStoreOpportunityAssessment(request, response);
    } catch (error) {
      console.error("Official store opportunity assessment route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Opportunity assessment service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/platform/official-store/pricing/preview") {
    try {
      const { handleOfficialStorePricingRequest } = await import("./official-store-pricing.mjs");
      await handleOfficialStorePricingRequest(request, response);
    } catch (error) {
      console.error("WASLA official store pricing route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Pricing preview service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const officialStoreSourceOfferMatch = requestUrl.pathname.match(/^\/api\/platform\/official-store\/source-offers(?:\/([0-9a-f-]{36}))?$/i);
  if (officialStoreSourceOfferMatch) {
    try {
      const { handleOfficialStoreSourceOffersRequest } = await import("./official-store-source-offers.mjs");
      await handleOfficialStoreSourceOffersRequest(request, response, officialStoreSourceOfferMatch[1]);
    } catch (error) {
      console.error("WASLA official store source offers route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Source offer service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const officialStoreProductMatch = requestUrl.pathname.match(/^\/api\/platform\/official-store\/products(?:\/([0-9a-f-]{36}))?$/i);
  const publicOfficialStoreProducts = requestUrl.pathname === "/api/official-store/products";
  if (officialStoreProductMatch || publicOfficialStoreProducts) {
    try {
      const { handleOfficialStoreProductsRequest } = await import("./official-store-products.mjs");
      await handleOfficialStoreProductsRequest(
        request,
        response,
        officialStoreProductMatch?.[1],
        publicOfficialStoreProducts,
      );
    } catch (error) {
      console.error("WASLA official store products route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Official store products service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const subscriptionPlanMatch = requestUrl.pathname.match(new RegExp("^/api/platform/subscription-plans(?:/([0-9a-f-]{36}))?$", "i"));
  if (subscriptionPlanMatch || requestUrl.pathname === "/api/subscription-plans") {
    try {
      const { handleSubscriptionPlansRequest } = await import("./subscription-plans.mjs");
      await handleSubscriptionPlansRequest(
        request,
        response,
        subscriptionPlanMatch?.[1],
        requestUrl.pathname === "/api/subscription-plans",
      );
    } catch (error) {
      console.error("WASLA subscription plans route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Subscription plans service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/platform/users") {
    try {
      const { handlePlatformUsersRequest } = await import("./platform-users.mjs");
      await handlePlatformUsersRequest(request, response);
    } catch (error) {
      console.error("WASLA platform users route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Platform users service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/platform/audit") {
    try {
      const { handlePlatformAuditRequest } = await import("./platform-audit.mjs");
      await handlePlatformAuditRequest(request, response);
    } catch (error) {
      console.error("WASLA platform audit route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Platform audit service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/platform/overview") {
    try {
      const { handlePlatformOverviewRequest } = await import("./platform-overview.mjs");
      await handlePlatformOverviewRequest(request, response);
    } catch (error) {
      console.error("WASLA platform overview route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Platform overview service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/platform/ai/assistant") {
    try {
      const { handlePlatformAiAssistantRequest } = await import("./platform-ai-assistant.mjs");
      await handlePlatformAiAssistantRequest(request, response);
    } catch (error) {
      console.error("WASLA platform AI assistant route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "AI assistant service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/platform/security") {
    try {
      const { handlePlatformSecurityRequest } = await import("./platform-security.mjs");
      await handlePlatformSecurityRequest(request, response);
    } catch (error) {
      console.error("WASLA platform security route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Platform security service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/preferences/themes") {
    try {
      const { handleWorldThemesRequest } = await import("./world-themes.mjs");
      await handleWorldThemesRequest(request, response);
    } catch (error) {
      console.error("WASLA world themes route error:", error);
      if (!response.headersSent) {
        sendJson(response, 500, { success: false, error: "Theme preferences service error" });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    }
    return;
  }

  if (requestUrl.pathname === "/api/brands") {
    try {
      const { handleBrandsRequest } = await import("./brands.mjs");
      await handleBrandsRequest(request, response);
    } catch (error) {
      console.error("WASLA brands route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Brands service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/search") {
    try {
      const { handleSearchRequest } = await import("./search.mjs");
      await handleSearchRequest(request, response);
    } catch (error) {
      console.error("WASLA search route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Search service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/network") {
    try {
      const { handleNetworkRequest } = await import("./network.mjs");
      await handleNetworkRequest(request, response);
    } catch (error) {
      console.error("WASLA network route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Network service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/profile") {
    try {
      const { handleProfileRequest } = await import("./profile.mjs");
      await handleProfileRequest(request, response);
    } catch (error) {
      console.error("WASLA profile route error:", error);

      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Profile service error",
        });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    }

    return;
  }

  if (requestUrl.pathname === "/api/invitations") {
    try {
      const { handleInvitationsRequest } = await import("./invitations.mjs");
      await handleInvitationsRequest(request, response);
    } catch (error) {
      console.error("WASLA invitations route error:", error);

      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Invitations service error",
        });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    }

    return;
  }

  const memberActionMatch = requestUrl.pathname.match(
    /^\/api\/accounts\/([0-9a-f-]{36})\/members\/([0-9a-f-]{36})\/(accept|revoke|decline)$/,
  );

  if (memberActionMatch) {
    try {
      const { handleMemberAction } = await import("./member-actions.mjs");

      await handleMemberAction(
        request,
        response,
        memberActionMatch[1],
        memberActionMatch[2],
        memberActionMatch[3] as "accept" | "revoke" | "decline",
      );
    } catch (error) {
      console.error("WASLA member action route error:", error);

      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Member action service error",
        });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    }

    return;
  }

  const memberManagementMatch = requestUrl.pathname.match(
    /^\/api\/accounts\/([0-9a-f-]{36})\/members\/([0-9a-f-]{36})$/,
  );

  if (memberManagementMatch && request.method === "PATCH") {
    try {
      const { handleMemberManagement } = await import("./member-management.mjs");

      await handleMemberManagement(
        request,
        response,
        memberManagementMatch[1],
        memberManagementMatch[2],
      );
    } catch (error) {
      console.error("WASLA member management error:", error);

      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Member management service error",
        });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    }

    return;
  }

  const membersMatch = requestUrl.pathname.match(
    /^\/api\/accounts\/([0-9a-f-]{36})\/members$/,
  );

  if (membersMatch) {
    try {
      const { handleMembersRequest } = await import("./members.mjs");
      await handleMembersRequest(request, response, membersMatch[1]);
    } catch (error) {
      console.error("WASLA members route error:", error);

      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Members service error",
        });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    }

    return;
  }



  const storeProductDetailMatch = requestUrl.pathname.match(
    /^\/api\/stores\/([^/]+)\/products\/([0-9a-f-]{36})$/,
  );
  if (storeProductDetailMatch) {
    try {
      const { handleStoreProductDetailRequest } = await import("./store-products.mjs");
      await handleStoreProductDetailRequest(
        request, response, decodeURIComponent(storeProductDetailMatch[1]), storeProductDetailMatch[2],
      );
    } catch (error) {
      console.error("WASLA product detail route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Product service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const storeProductsMatch = requestUrl.pathname.match(/^\/api\/stores\/([^/]+)\/products$/);
  if (storeProductsMatch) {
    try {
      const { handleStoreProductsRequest } = await import("./store-products.mjs");
      await handleStoreProductsRequest(request, response, decodeURIComponent(storeProductsMatch[1]));
    } catch (error) {
      console.error("WASLA products route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Products service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const storeDetailPrefix = "/api/stores/";
  if (requestUrl.pathname.startsWith(storeDetailPrefix)) {
    const storeSlug = requestUrl.pathname.slice(storeDetailPrefix.length);
    if (storeSlug && !storeSlug.includes("/")) {
      try {
        const { handleStoreDetailRequest } = await import("./stores.mjs");
        await handleStoreDetailRequest(request, response, storeSlug);
      } catch (error) {
        console.error("WASLA store detail route error:", error);
        if (!response.headersSent) {
          sendJson(response, 500, { success: false, error: "Store service error" });
        } else {
          response.destroy(error instanceof Error ? error : undefined);
        }
      }
      return;
    }
  }

  if (requestUrl.pathname === "/api/stores") {
    try {
      const { handleStoresRequest } = await import("./stores.mjs");
      await handleStoresRequest(request, response);
    } catch (error) {
      console.error("WASLA stores route error:", error);
      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Stores service error",
        });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    }
    return;
  }

  if (requestUrl.pathname === "/api/accounts") {
    try {
      const { handleAccountsRequest } = await import("./accounts.mjs");
      await handleAccountsRequest(request, response);
    } catch (error) {
      console.error("WASLA accounts route error:", error);

      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Accounts service error",
        });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    }

    return;
  }

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

  if (requestUrl.pathname === "/ready") {
    if (request.method !== "GET") {
      sendJson(response, 405, {
        success: false,
        error: "Method not allowed",
      });
      return;
    }

    try {
      const { checkDatabaseConnection } = await import("./database.js");
      await checkDatabaseConnection();

      sendJson(response, 200, {
        success: true,
        service: "WASLA API",
        status: "ready",
        database: "connected",
      });
    } catch (error) {
      console.error("WASLA readiness check failed:", error);

      sendJson(response, 503, {
        success: false,
        service: "WASLA API",
        status: "not_ready",
        database: "unavailable",
      });
    }

    return;
  }

  sendJson(response, 404, {
    success: false,
    error: "Route not found",
  });
}

export function createWaslaServer(): Server {
  return createServer((request, response) => {
    void handleRequest(request, response).catch((error: unknown) => {
      console.error("WASLA API unhandled error:", error);

      if (!response.headersSent) {
        sendJson(response, 500, {
          success: false,
          error: "Internal server error",
        });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    });
  });
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 4000);
  const server = createWaslaServer();

  void import("./database.js")
    .then(async ({ ensureRegistrationTypeColumn, ensureAccountOwnerRole, ensureStoreOwnerRole, ensurePlatformOwnerRole, ensurePersonalThemesTable, ensureStoreProductsTable, ensureNetworkTables, ensureProductInquiryTables, ensureSubscriptionBillingTables }) => {
      const { ensureAuthorizationRoles } = await import("./authorization-bootstrap.mjs");
      await ensureRegistrationTypeColumn();
      await ensureAuthorizationRoles();
      await ensureAccountOwnerRole();
      await ensureStoreOwnerRole();
      await ensurePlatformOwnerRole();
      await ensurePersonalThemesTable();
      await ensureStoreProductsTable();
      await ensureNetworkTables();
      const { ensureMessagesTables } = await import("./messages.mjs");
      await ensureMessagesTables();
      await ensureProductInquiryTables();
      await ensureSubscriptionBillingTables();
      const { ensureNotificationsTable } = await import("./notifications.mjs");
      await ensureNotificationsTable();
      const { ensureTradeTables } = await import("./trade.mjs");
      await ensureTradeTables();
      const { ensureOfficialStoreTables } = await import("./official-store.mjs");
      await ensureOfficialStoreTables();
      const { ensureOfficialStoreOpportunityTables } = await import("./official-store-opportunities.mjs");
      await ensureOfficialStoreOpportunityTables();
      const { ensureOfficialStoreDataSourceTables } = await import("./official-store-data-sources.mjs");
      await ensureOfficialStoreDataSourceTables();
    })
    .then(() => {
      server.listen(port, "0.0.0.0", () => {
        console.log(`WASLA API listening on port ${port}`);
      });
    })
    .catch((error: unknown) => {
      console.error("WASLA database schema initialization failed:", error);
      process.exit(1);
    });
}
