
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";

import { getDrizzleDatabase, getDatabasePool } from "./database.js";
import * as schema from "./db/schema.js";

const secret = process.env.BETTER_AUTH_SECRET;
const resendApiKey = process.env.RESEND_API_KEY;
const testRecipient = process.env.RESEND_TEST_RECIPIENT;
const productionFromEmail = process.env.RESEND_FROM_EMAIL;
const fromEmail = productionFromEmail ?? "WASLA <onboarding@resend.dev>";

if (process.env.NODE_ENV === "production" && !secret) {
  throw new Error("BETTER_AUTH_SECRET is required in production");
}

if (process.env.NODE_ENV === "production") {
  if (!process.env.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_URL is required in production");
  }
  if (!process.env.BETTER_AUTH_TRUSTED_ORIGINS) {
    throw new Error("BETTER_AUTH_TRUSTED_ORIGINS is required in production");
  }
  if (!productionFromEmail || productionFromEmail.includes("@resend.dev")) {
    throw new Error("RESEND_FROM_EMAIL must use a verified WASLA sending domain in production");
  }
}

const trustedOrigins = (
  process.env.BETTER_AUTH_TRUSTED_ORIGINS ??
  "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

async function sendWASLAEmail(
  recipient: string,
  subject: string,
  text: string,
  context: string,
): Promise<void> {
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction) {
    if (!testRecipient) {
      throw new Error("RESEND_TEST_RECIPIENT is required outside production");
    }
    if (recipient.toLowerCase() !== testRecipient.toLowerCase()) {
      throw new Error("Resend test mode only allows the configured test recipient");
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
      to: [isProduction ? recipient : testRecipient],
      subject,
      text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`WASLA ${context} email delivery failed:`, errorText);
    throw new Error("Could not send email");
  }
}

async function sendVerificationEmail(
  email: string,
  url: string,
): Promise<void> {
  await sendWASLAEmail(
    email,
    "Verify your WASLA account",
    [
      "Welcome to WASLA.",
      "",
      "Please verify your email address using this link:",
      url,
      "",
      "This link expires in one hour.",
    ].join("\n"),
    "verification",
  );
}

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

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendWASLAEmail(
        user.email,
        "Reset your WASLA password",
        [
          "A password reset was requested for your WASLA account.",
          "",
          "Use this link to choose a new password:",
          url,
          "",
          "If you did not request this, you can ignore this email.",
        ].join("\n"),
        "password reset",
      );
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600,

    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
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
