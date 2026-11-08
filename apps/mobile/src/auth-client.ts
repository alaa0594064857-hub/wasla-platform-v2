import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "./api";

export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  plugins: [
    expoClient({
      scheme: "wasla",
      storagePrefix: "wasla",
      storage: SecureStore,
    }),
  ],
});
