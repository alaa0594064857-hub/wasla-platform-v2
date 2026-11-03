
/**
 * WASLA Shared Core
 * Account model, roles, permissions and localization.
 *
 * IMPORTANT:
 * This module provides shared types and UI helpers only.
 * Real authorization must be enforced by the backend and database.
 */

export const WASLA_CONFIG = {
  name: "WASLA",
  version: "1.0.0",
  supportedLocales: ["ar", "en"] as const,
  defaultLocale: "ar",
  defaultDirection: "rtl",
} as const;

export type WaslaLocale =
  (typeof WASLA_CONFIG.supportedLocales)[number];

export type TextDirection = "rtl" | "ltr";

export function getTextDirection(
  locale: WaslaLocale,
): TextDirection {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * Account types describe the user's commercial relationship
 * with WASLA. They do not grant permissions by themselves.
 *
 * Guest visitors are not registered WaslaUser records.
 */
export const ACCOUNT_TYPES = [
  "buyer",
  "store_owner",
  "merchant",
  "company",
  "supplier",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * Roles determine what an authenticated user may do.
 * A user may have multiple roles.
 */
export const USER_ROLES = [
  "buyer",
  "store_owner",
  "merchant",
  "company",
  "supplier",
  "platform_admin",
  "support_admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/**
 * A guest is an unauthenticated visitor.
 * It is not a registered account or an authorization role.
 */
export interface GuestSession {
  kind: "guest";
  locale: WaslaLocale;
}

/**
 * Registered user status.
 */
export type UserStatus =
  | "active"
  | "suspended"
  | "pending_verification"
  | "deactivated";

/**
 * Granular permissions for WASLA modules.
 */
export const PERMISSIONS = [
  "profile.read",
  "profile.update",

  "store.read",
  "store.create",
  "store.update",
  "store.manage",

  "product.read",
  "product.create",
  "product.update",
  "product.delete",
  "product.manage",

  "order.read",
  "order.create",
  "order.update",
  "order.cancel",
  "order.manage",

  "business.read",
  "business.create",
  "business.update",
  "business.manage",

  "trade.read",
  "trade.create",
  "trade.update",
  "trade.negotiate",
  "trade.manage",

  "message.read",
  "message.send",
  "message.manage",

  "support.read",
  "support.manage",

  "users.read",
  "users.manage",

  "reports.read",
  "reports.manage",

  "platform.manage",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Authenticated WASLA user.
 *
 * accountTypes describe commercial account capabilities.
 * roles describe authorization assignments.
 */
export interface WaslaUser {
  id: string;
  email: string;
  displayName: string;

  accountTypes: AccountType[];
  roles: UserRole[];

  locale: WaslaLocale;
  status: UserStatus;

  createdAt: string;
  updatedAt: string;
}

/**
 * Role definitions are defaults for initial application behavior.
 * Production role assignments must be controlled by the backend.
 */
export interface RoleDefinition {
  readonly role: UserRole;
  readonly permissions: readonly Permission[];
}

export const DEFAULT_ROLE_PERMISSIONS = [
  {
    role: "buyer",
    permissions: [
      "profile.read",
      "profile.update",
      "store.read",
      "product.read",
      "order.read",
      "order.create",
      "order.cancel",
      "message.read",
      "message.send",
      "support.read",
    ],
  },
  {
    role: "store_owner",
    permissions: [
      "profile.read",
      "profile.update",
      "store.read",
      "store.create",
      "store.update",
      "store.manage",
      "product.read",
      "product.create",
      "product.update",
      "product.delete",
      "product.manage",
      "order.read",
      "order.update",
      "order.manage",
      "message.read",
      "message.send",
      "support.read",
    ],
  },
  {
    role: "merchant",
    permissions: [
      "profile.read",
      "profile.update",
      "product.read",
      "product.create",
      "product.update",
      "order.read",
      "trade.read",
      "trade.create",
      "trade.update",
      "trade.negotiate",
      "message.read",
      "message.send",
      "support.read",
    ],
  },
  {
    role: "company",
    permissions: [
      "profile.read",
      "profile.update",
      "business.read",
      "business.create",
      "business.update",
      "business.manage",
      "trade.read",
      "trade.create",
      "trade.update",
      "trade.negotiate",
      "message.read",
      "message.send",
      "support.read",
    ],
  },
  {
    role: "supplier",
    permissions: [
      "profile.read",
      "profile.update",
      "business.read",
      "product.read",
      "product.create",
      "product.update",
      "order.read",
      "trade.read",
      "trade.update",
      "trade.negotiate",
      "message.read",
      "message.send",
      "support.read",
    ],
  },
  {
    role: "platform_admin",
    permissions: [...PERMISSIONS],
  },
  {
    role: "support_admin",
    permissions: [
      "profile.read",
      "order.read",
      "message.read",
      "message.manage",
      "support.read",
      "support.manage",
    ],
  },
] as const satisfies readonly RoleDefinition[];

/**
 * UI convenience helper only.
 *
 * Never use this function as the sole security boundary.
 * The backend must independently validate the user's identity,
 * status, role assignments and requested permission.
 */
export function hasPermission(
  user: WaslaUser,
  permission: Permission,
): boolean {
  if (user.status !== "active") {
    return false;
  }

  return user.roles.some((role) => {
    const definition = DEFAULT_ROLE_PERMISSIONS.find(
      (item) => item.role === role,
    );

    return definition?.permissions.includes(permission) ?? false;
  });
}
