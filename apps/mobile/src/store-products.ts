import { authClient } from "./auth-client";
import { API_BASE_URL, WaslaApiError } from "./api";

export type StoreProductStatus = "draft" | "active" | "archived";
export type MemberStoreProduct = {
  id: string;
  storeId: string;
  title: string;
  description: string | null;
  sku: string | null;
  price: string;
  currency: string;
  stockQuantity: number;
  imageUrl: string | null;
  videoUrl: string | null;
  sellerCheckoutUrl: string | null;
  status: StoreProductStatus;
  createdAt: string;
  updatedAt: string;
};

async function storeRequest<T>(
  slug: string,
  method: "GET" | "POST" | "PATCH",
  productId?: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const cookie = await authClient.getCookie();
  if (!cookie) throw new WaslaApiError("AUTHENTICATION_REQUIRED", 401);
  const path = `/api/stores/${encodeURIComponent(slug)}/products${productId ? `/${productId}` : ""}`;
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
    throw new WaslaApiError(result.error || "STORE_PRODUCT_REQUEST_FAILED", response.status);
  }
  return result as T;
}

export async function getStoreProducts(slug: string): Promise<MemberStoreProduct[]> {
  const result = await storeRequest<{ products: MemberStoreProduct[] }>(slug, "GET");
  return Array.isArray(result.products) ? result.products : [];
}

export async function createStoreProduct(
  slug: string,
  input: {
    title: string;
    description?: string;
    price: string;
    currency: string;
    stockQuantity: number;
    status?: StoreProductStatus;
  },
): Promise<MemberStoreProduct> {
  const result = await storeRequest<{ product: MemberStoreProduct }>(slug, "POST", undefined, input);
  if (!result.product) throw new WaslaApiError("INVALID_SERVER_RESPONSE");
  return result.product;
}

export async function updateStoreProductStatus(
  slug: string,
  productId: string,
  status: StoreProductStatus,
): Promise<MemberStoreProduct> {
  const result = await storeRequest<{ product: MemberStoreProduct }>(
    slug, "PATCH", productId, { status },
  );
  if (!result.product) throw new WaslaApiError("INVALID_SERVER_RESPONSE");
  return result.product;
}
