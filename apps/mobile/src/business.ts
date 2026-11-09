import { authClient } from "./auth-client";
import { API_BASE_URL, WaslaApiError } from "./api";

export type BusinessAccountType =
  | "company"
  | "supplier"
  | "manufacturer"
  | "trader"
  | "brand";

export type BusinessAccount = {
  id: string;
  account_type: BusinessAccountType;
  legal_name: string;
  display_name: string;
  status: string;
  country_code: string | null;
  membership_status?: string;
  role?: string;
  description?: string | null;
  website?: string | null;
  verification_status?: string | null;
};

export type MemberStore = {
  id: string;
  account_id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  account_name?: string;
  account_role?: string | null;
  store_role?: string | null;
};

type ApiEnvelope<T> = {
  success: boolean;
  error?: string;
} & T;

async function authenticatedJson<T>(
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
): Promise<T> {
  const cookie = await authClient.getCookie();
  if (!cookie) throw new WaslaApiError("AUTHENTICATION_REQUIRED", 401);

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

  let result: ApiEnvelope<T>;
  try {
    result = await response.json() as ApiEnvelope<T>;
  } catch {
    throw new WaslaApiError("INVALID_SERVER_RESPONSE", response.status);
  }
  if (!response.ok || !result.success) {
    throw new WaslaApiError(result.error || "BUSINESS_REQUEST_FAILED", response.status);
  }
  return result;
}

export async function getMyBusinessAccounts(): Promise<BusinessAccount[]> {
  const result = await authenticatedJson<{ accounts: BusinessAccount[] }>(
    "/api/accounts", "GET",
  );
  return Array.isArray(result.accounts) ? result.accounts : [];
}

export async function createBusinessAccount(input: {
  accountType: BusinessAccountType;
  legalName: string;
  displayName: string;
  countryCode?: string;
  description?: string;
  website?: string;
}): Promise<BusinessAccount> {
  const result = await authenticatedJson<{ account: BusinessAccount }>(
    "/api/accounts", "POST", input,
  );
  if (!result.account) throw new WaslaApiError("INVALID_SERVER_RESPONSE");
  return result.account;
}

export async function getMyStores(): Promise<MemberStore[]> {
  const result = await authenticatedJson<{ stores: MemberStore[] }>(
    "/api/stores", "GET",
  );
  return Array.isArray(result.stores) ? result.stores : [];
}

export async function createMyStore(input: {
  accountId: string;
  name: string;
}): Promise<MemberStore> {
  const result = await authenticatedJson<{ store: MemberStore }>(
    "/api/stores", "POST", input,
  );
  if (!result.store) throw new WaslaApiError("INVALID_SERVER_RESPONSE");
  return result.store;
}
