const DEFAULT_API_URL = "https://wasla-apiwasla-api-v2.onrender.com";

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_WASLA_API_URL || DEFAULT_API_URL
).replace(/\/+$/, "");

export type OfficialStoreProduct = {
  id: string;
  title_ar: string;
  title_en: string;
  description_ar: string | null;
  description_en: string | null;
  price: string;
  currency: string;
  availability_status: "available" | "limited" | "unavailable" | "needs_confirmation";
  image_url: string | null;
  created_at: string;
  deliveryCountries: string[];
  estimatedDeliveryDaysMin: number | null;
  estimatedDeliveryDaysMax: number | null;
};

type CatalogueResponse = {
  success: boolean;
  destinationCountry?: string;
  products?: OfficialStoreProduct[];
  error?: string;
};

export class WaslaApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "WaslaApiError";
  }
}

async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new WaslaApiError("NETWORK_ERROR");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new WaslaApiError("INVALID_SERVER_RESPONSE", response.status);
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "REQUEST_FAILED";
    throw new WaslaApiError(message, response.status);
  }

  return payload as T;
}

export async function getOfficialStoreProducts(
  countryCode: string,
): Promise<OfficialStoreProduct[]> {
  const country = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new WaslaApiError("INVALID_COUNTRY");
  }

  const result = await getJson<CatalogueResponse>(
    `/api/official-store/products?country=${encodeURIComponent(country)}`,
  );

  if (!result.success || !Array.isArray(result.products)) {
    throw new WaslaApiError(result.error || "CATALOGUE_UNAVAILABLE");
  }

  return result.products;
}
