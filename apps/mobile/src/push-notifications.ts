import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { authClient } from "./auth-client";
import { API_BASE_URL, WaslaApiError } from "./api";

function getProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
}

async function requestWithSession(token: string, method: "POST" | "DELETE"): Promise<void> {
  const cookie = await authClient.getCookie();
  if (!cookie) throw new WaslaApiError("AUTHENTICATION_REQUIRED", 401);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/notifications/devices`, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(method === "POST" ? { token, platform: Platform.OS } : { token }),
    });
  } catch {
    throw new WaslaApiError("NETWORK_ERROR");
  }
  const result = await response.json() as { success?: boolean; error?: string };
  if (!response.ok || !result.success) {
    throw new WaslaApiError(result.error || "PUSH_DEVICE_REQUEST_FAILED", response.status);
  }
}

export async function enablePushNotifications(): Promise<string> {
  const projectId = getProjectId();
  if (!projectId) throw new WaslaApiError("PUSH_PROJECT_NOT_CONFIGURED");
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    throw new WaslaApiError("PUSH_NOT_SUPPORTED_ON_THIS_PLATFORM");
  }
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") throw new WaslaApiError("PUSH_PERMISSION_NOT_GRANTED");
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "WASLA notifications",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await requestWithSession(token, "POST");
  return token;
}

export async function disablePushNotifications(token: string): Promise<void> {
  if (token) await requestWithSession(token, "DELETE");
}
