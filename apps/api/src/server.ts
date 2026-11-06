
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

  const buyerDeliveryConfirmationMatch = requestUrl.pathname.match(/^\/api\/sourcing-orders\/([^/]+)\/confirm-delivery$/);
  if (buyerDeliveryConfirmationMatch) {
    try {
      const { handleBuyerConfirmSourcingDelivery } = await import("./sourcing.mjs");
      await handleBuyerConfirmSourcingDelivery(request, response, buyerDeliveryConfirmationMatch[1]);
    } catch (error) {
      console.error("WASLA buyer delivery confirmation route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Delivery confirmation service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const sourcingOrderEventsMatch = requestUrl.pathname.match(/^\/api\/sourcing-orders\/([^/]+)\/events$/);
  if (sourcingOrderEventsMatch) {
    try {
      const { handleSourcingOrderEvents } = await import("./sourcing.mjs");
      await handleSourcingOrderEvents(request, response, sourcingOrderEventsMatch[1]);
    } catch (error) {
      console.error("WASLA sourcing order events route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Sourcing order history service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const supplierSourcingOrderStatusMatch = requestUrl.pathname.match(/^\/api\/supplier\/sourcing-orders\/([^/]+)\/status$/);
  if (supplierSourcingOrderStatusMatch) {
    try {
      const { handleSupplierSourcingOrders } = await import("./sourcing.mjs");
      await handleSupplierSourcingOrders(request, response, supplierSourcingOrderStatusMatch[1]);
    } catch (error) {
      console.error("WASLA supplier sourcing order status route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Supplier sourcing order service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/supplier/sourcing-orders") {
    try {
      const { handleSupplierSourcingOrders } = await import("./sourcing.mjs");
      await handleSupplierSourcingOrders(request, response);
    } catch (error) {
      console.error("WASLA supplier sourcing orders route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Supplier sourcing orders service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const sourcingAcceptMatch = requestUrl.pathname.match(/^\/api\/sourcing-requests\/([^/]+)\/accept-offer$/);
  if (sourcingAcceptMatch) {
    try {
      const { handleAcceptSupplierOffer } = await import("./sourcing.mjs");
      await handleAcceptSupplierOffer(request, response, sourcingAcceptMatch[1]);
    } catch (error) {
      console.error("WASLA accept offer route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Offer acceptance service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const sourcingOfferMatch = requestUrl.pathname.match(/^\/api\/sourcing-offers\/([^/]+)\/availability$/);
  if (sourcingOfferMatch) {
    try {
      const { handleSupplierAvailability } = await import("./sourcing.mjs");
      await handleSupplierAvailability(request, response, sourcingOfferMatch[1]);
    } catch (error) {
      console.error("WASLA supplier availability route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Supplier availability service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const sourcingOfferCreateMatch = requestUrl.pathname.match(/^\/api\/sourcing-requests\/([^/]+)\/offers$/);
  if (sourcingOfferCreateMatch) {
    try {
      const { handleSupplierOffer } = await import("./sourcing.mjs");
      await handleSupplierOffer(request, response, sourcingOfferCreateMatch[1]);
    } catch (error) {
      console.error("WASLA supplier offer route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Supplier offer service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const sourcingRequestDetailMatch = requestUrl.pathname.match(/^\/api\/sourcing-requests\/([^/]+)$/);
  if (sourcingRequestDetailMatch) {
    try {
      const { handleSourcingRequestDetail } = await import("./sourcing.mjs");
      await handleSourcingRequestDetail(request, response, sourcingRequestDetailMatch[1]);
    } catch (error) {
      console.error("WASLA sourcing detail route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Sourcing service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/sourcing-opportunities") {
    try {
      const { handleSupplierOpportunities } = await import("./sourcing.mjs");
      await handleSupplierOpportunities(request, response);
    } catch (error) {
      console.error("WASLA supplier opportunities route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Supplier opportunities service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/sourcing-requests") {
    try {
      const { handleSourcingCollection } = await import("./sourcing.mjs");
      await handleSourcingCollection(request, response);
    } catch (error) {
      console.error("WASLA sourcing collection route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Sourcing service error" });
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

  const publicStorefrontMatch = requestUrl.pathname.match(/^\/api\/public\/stores\/([^/]+)$/);
  if (publicStorefrontMatch) {
    try {
      const { handlePublicStorefrontRequest } = await import("./storefront.mjs");
      await handlePublicStorefrontRequest(request, response, decodeURIComponent(publicStorefrontMatch[1]));
    } catch (error) {
      console.error("WASLA public storefront route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Storefront service error" });
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
    /^\/api\/accounts\/([^/]+)\/members\/([^/]+)\/(accept|revoke|decline)$/,
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
    /^\/api\/accounts\/([^/]+)\/members\/([^/]+)$/,
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
    /^\/api\/accounts\/([^/]+)\/members$/,
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



  const storeOrderStatusMatch = requestUrl.pathname.match(/^\/api\/stores\/([^/]+)\/orders\/([^/]+)\/status$/);
  if (storeOrderStatusMatch) {
    try {
      const { handleStoreOrdersRequest } = await import("./orders.mjs");
      await handleStoreOrdersRequest(
        request, response, decodeURIComponent(storeOrderStatusMatch[1]), storeOrderStatusMatch[2],
      );
    } catch (error) {
      console.error("WASLA store order status route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Store orders service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const storeOrdersMatch = requestUrl.pathname.match(/^\/api\/stores\/([^/]+)\/orders$/);
  if (storeOrdersMatch) {
    try {
      const { handleStoreOrdersRequest } = await import("./orders.mjs");
      await handleStoreOrdersRequest(request, response, decodeURIComponent(storeOrdersMatch[1]));
    } catch (error) {
      console.error("WASLA store orders route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Store orders service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const orderDetailMatch = requestUrl.pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (orderDetailMatch) {
    try {
      const { handleOrderDetailRequest } = await import("./orders.mjs");
      await handleOrderDetailRequest(request, response, orderDetailMatch[1]);
    } catch (error) {
      console.error("WASLA order detail route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Order service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  if (requestUrl.pathname === "/api/orders") {
    try {
      const { handleOrdersRequest } = await import("./orders.mjs");
      await handleOrdersRequest(request, response);
    } catch (error) {
      console.error("WASLA orders route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Orders service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const inventoryMovementsMatch = requestUrl.pathname.match(
    /^\/api\/stores\/([^/]+)\/products\/([^/]+)\/inventory-movements$/,
  );
  if (inventoryMovementsMatch) {
    try {
      const { handleInventoryMovementsRequest } = await import("./inventory-movements.mjs");
      await handleInventoryMovementsRequest(
        request, response, decodeURIComponent(inventoryMovementsMatch[1]), inventoryMovementsMatch[2],
      );
    } catch (error) {
      console.error("WASLA inventory movements route error:", error);
      if (!response.headersSent) sendJson(response, 500, { success: false, error: "Inventory service error" });
      else response.destroy(error instanceof Error ? error : undefined);
    }
    return;
  }

  const storeProductDetailMatch = requestUrl.pathname.match(
    /^\/api\/stores\/([^/]+)\/products\/([^/]+)$/,
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
    .then(async ({ ensureRegistrationTypeColumn, ensureAccountOwnerRole, ensureStoreOwnerRole, ensurePersonalThemesTable, ensureNetworkTables }) => {
      await ensureRegistrationTypeColumn();
      await ensureAccountOwnerRole();
      await ensureStoreOwnerRole();
      await ensurePersonalThemesTable();
      await ensureNetworkTables();
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
