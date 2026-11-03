import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";

import { getDrizzleDatabase } from "./database.js";
import * as schema from "./db/schema.js";

const secret = process.env.BETTER_AUTH_SECRET;

if (process.env.NODE_ENV === "production" && !secret) {
  throw new Error(
    "BETTER_AUTH_SECRET is required in production",
  );
}

const trustedOrigins = (
  process.env.BETTER_AUTH_TRUSTED_ORIGINS ??
  "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = betterAuth({
  appName: "WASLA",

  baseURL:
    process.env.BETTER_AUTH_URL ??
    "http://localhost:4000",

  ...(secret ? { secret } : {}),

  trustedOrigins,

  database: drizzleAdapter(getDrizzleDatabase(), {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.authSessions,
      account: schema.authAccounts,
      verification: schema.authVerifications,
    },
  }),

  user: {
    additionalFields: {
      preferredLocale: {
        type: "string",
        required: false,
        defaultValue: "ar",
        input: true,
      },
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  advanced: {
    database: {
      generateId: "uuid",
    },
  },
});
