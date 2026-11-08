import { authClient } from "./auth-client";
import { API_BASE_URL, WaslaApiError } from "./api";

export type WaslaProfile = {
  userId: string;
  displayName: string;
  avatarReference: string | null;
  email: string;
  bio: string;
  website: string;
  socialLinks: Record<string, string>;
};

type ProfileResponse = {
  success: boolean;
  profile?: WaslaProfile;
  error?: string;
};

async function authenticatedRequest(
  method: "GET" | "PATCH",
  body?: Partial<Pick<WaslaProfile, "displayName" | "avatarReference" | "bio" | "website" | "socialLinks">>,
): Promise<WaslaProfile | null> {
  const cookie = await authClient.getCookie();
  if (!cookie) throw new WaslaApiError("AUTHENTICATION_REQUIRED", 401);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/profile`, {
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

  let result: ProfileResponse;
  try {
    result = await response.json() as ProfileResponse;
  } catch {
    throw new WaslaApiError("INVALID_SERVER_RESPONSE", response.status);
  }

  if (!response.ok || !result.success) {
    throw new WaslaApiError(result.error || "PROFILE_REQUEST_FAILED", response.status);
  }

  return result.profile ?? null;
}

export async function getMyProfile(): Promise<WaslaProfile> {
  const profile = await authenticatedRequest("GET");
  if (!profile) throw new WaslaApiError("PROFILE_NOT_FOUND");
  return profile;
}

export async function updateMyProfile(
  input: Pick<WaslaProfile, "displayName" | "avatarReference" | "bio" | "website" | "socialLinks">,
): Promise<void> {
  await authenticatedRequest("PATCH", input);
}
