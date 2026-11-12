import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";

import { getDrizzleDatabase, getDatabasePool } from "./database.js";
import * as schema from "./db/schema.js";

const secret = process.env.BETTER_AUTH_SECRET;
const resendApiKey = process.env.RESEND_API_KEY;
const testRecipient = process.env.RESEND_TEST_RECIPIENT?.trim().toLowerCase();
const configuredFromEmail = process.env.RESEND_FROM_EMAIL?.trim();
const fromEmail = configuredFromEmail || "WASLA <onboarding@resend.dev>";
const productionEmailMode = Boolean(configuredFromEmail);

if (process.env.NODE_ENV === "production" && !secret) {
  throw new Error("BETTER_AUTH_SECRET is required in production");
}

const trustedOrigins = [...new Set([
  "https://wasla-web-4a64.onrender.com",
  "http://localhost:3000",
  "wasla://",
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(","),
].map((origin) => origin.trim()).filter(Boolean))];

async function sendWASLAEmail(
  recipient: string,
  subject: string,
  lines: string[],
): Promise<void> {
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const normalizedRecipient = recipient.trim().toLowerCase();
  if (!normalizedRecipient) {
    throw new Error("Email recipient is missing");
  }

  // Resend's shared onboarding sender is restricted to the account owner.
  // A verified custom sender enables normal transactional delivery.
  if (!productionEmailMode) {
    if (!testRecipient) {
      throw new Error("RESEND_TEST_RECIPIENT is not configured");
    }
    if (normalizedRecipient !== testRecipient) {
      throw new Error(
        "Resend test mode only allows the configured test recipient",
      );
    }
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipient],
      subject,
      text: lines.join("\n"),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("WASLA transactional email delivery failed:", errorText);
    throw new Error("Could not send WASLA email");
  }
}

export const auth = betterAuth({
  appName: "WASLA",

  baseURL:
    process.env.BETTER_AUTH_URL ??
    "https://wasla-apiwasla-api-v2.onrender.com",

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
      registrationType: {
        type: "string",
        required: true,
        input: true,
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const allowedTypes = [
            "buyer",
            "company",
            "supplier",
            "manufacturer",
            "trader",
            "brand",
          ];
          if (
            typeof user.registrationType !== "string" ||
            !allowedTypes.includes(user.registrationType)
          ) {
            throw new APIError("BAD_REQUEST", {
              message: "A valid registration type is required.",
            });
          }
          return { data: user };
        },
      },
    },
  },

  plugins: [expo()],

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, token }) => {
      const webBaseUrl = process.env.WASLA_WEB_URL ?? "https://wasla.trade";
      const resetUrl = new URL("/reset-password", webBaseUrl);
      resetUrl.searchParams.set("token", token);

      await sendWASLAEmail(
        user.email,
        "Reset your WASLA password",
        [
          "A password reset was requested for your WASLA account.",
          "",
          "Use this link to choose a new password:",
          resetUrl.toString(),
          "",
          "If you did not request this, you can ignore this email.",
        ],
      );
    },
  },

  emailVerification: {
    // Send explicitly after sign-up through the awaited endpoint so provider failures reach the client.
    sendOnSignUp: false,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600,

    sendVerificationEmail: async ({ user, url }) => {
      await sendWASLAEmail(
        user.email,
        "Verify your WASLA account",
        [
          "Welcome to WASLA.",
          "",
          "Please verify your email address using this link:",
          url,
          "",
          "This link expires in one hour.",
        ],
      );
    },

    afterEmailVerification: async (user) => {
      const database = getDatabasePool();

      await database.query(
        `UPDATE users
         SET status = 'active',
             updated_at = NOW()
         WHERE id = $1`,
        [user.id],
      );
    },
  },

  advanced: {
    database: {
      generateId: "uuid",
    },
  },
});
