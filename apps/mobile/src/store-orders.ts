import { authClient } from "./auth-client";
import { API_BASE_URL, WaslaApiError } from "./api";

export type MemberStoreOrderStatus =
  | "pending_merchant_review"
  | "accepted"
  | "rejected"
  | "cancelled";

export type MemberStoreOrder = {
  id: string;
  orderNumber: string;
  storeId: string;
  buyerUserId: string;
  status: MemberStoreOrderStatus;
  currency: string;
  items: Array<{
    productId: string;
    title: string;
    sku: string | null;
    unitPrice: string;
    currency: string;
    quantity: number;
    availabilityAtRequest: number;
  }>;
  subtotal: string;
  buyerNote: string | null;
  merchantNote: string | null;
  createdAt: string;
  updatedAt: string;
};

async function orderRequest<T>(
  slug: string,
  method: "GET" | "PATCH",
  orderId?: string,
  body?: { status: "accepted" | "rejected" | "cancelled"; note?: string },
): Promise<T> {
  const cookie = await authClient.getCookie();
  if (!cookie) throw new WaslaApiError("AUTHENTICATION_REQUIRED", 401);
  const path = `/api/stores/${encodeURIComponent(slug)}/orders${orderId ? `/${orderId}` : ""}`;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Cookie: cookie,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new WaslaApiError("NETWORK_ERROR");
  }
  let result: { success: boolean; error?: string } & Record<string, unknown>;
  try {
    result = await response.json() as typeof result;
  } catch {
    throw new WaslaApiError("INVALID_SERVER_RESPONSE", response.status);
  }
  if (!response.ok || !result.success) {
    throw new WaslaApiError(result.error || "STORE_ORDER_REQUEST_FAILED", response.status);
  }
  return result as T;
}

export async function getStoreOrders(slug: string): Promise<MemberStoreOrder[]> {
  const result = await orderRequest<{ orders: MemberStoreOrder[] }>(slug, "GET");
  return Array.isArray(result.orders) ? result.orders : [];
}

export async function reviewStoreOrder(
  slug: string,
  orderId: string,
  status: "accepted" | "rejected",
  note?: string,
): Promise<Pick<MemberStoreOrder, "id" | "orderNumber" | "buyerUserId" | "status" | "updatedAt">> {
  const result = await orderRequest<{ order: Pick<MemberStoreOrder, "id" | "orderNumber" | "buyerUserId" | "status" | "updatedAt"> }>(
    slug, "PATCH", orderId, { status, note },
  );
  if (!result.order) throw new WaslaApiError("INVALID_SERVER_RESPONSE");
  return result.order;
}
