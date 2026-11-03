
/**
 * WASLA Shared Core
 * Shared configuration, accounts, roles and permissions.
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

export const ACCOUNT_TYPES = [
  "guest",
  "buyer",
  "store_owner",
  "merchant",
  "company",
  "supplier",
  "admin",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

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

export const PERMISSIONS = [
  "profile.read",
  "profile.update",
  "store.create",
  "store.manage",
  "product.create",
  "product.manage",
  "order.create",
  "order.manage",
  "business.manage",
  "trade.create",
  "trade.manage",
  "message.send",
  "message.manage",
  "users.manage",
  "platform.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface WaslaUser {
  id: string;
  email: string;
  displayName: string;
  accountTypes: AccountType[];
  roles: UserRole[];
  locale: WaslaLocale;
  isActive: boolean;
  createdAt: string;
}

export interface RoleDefinition {
  role: UserRole;
  permissions: Permission[];
}

export const DEFAULT_ROLE_PERMISSIONS: RoleDefinition[] = [
  {
    role: "buyer",
    permissions: [
      "profile.read",
      "profile.update",
      "order.create",
      "message.send",
    ],
  },
  {
    role: "store_owner",
    permissions: [
      "profile.read",
      "profile.update",
      "store.create",
      "store.manage",
      "product.create",
      "product.manage",
      "order.manage",
      "message.send",
    ],
  },
  {
    role: "merchant",
    permissions: [
      "profile.read",
      "profile.update",
      "product.create",
      "product.manage",
      "trade.create",
      "trade.manage",
      "message.send",
    ],
  },
  {
    role: "company",
    permissions: [
      "profile.read",
      "profile.update",
      "business.manage",
      "trade.create",
      "trade.manage",
      "message.send",
    ],
  },
  {
    role: "supplier",
    permissions: [
      "profile.read",
      "profile.update",
      "business.manage",
      "product.manage",
      "trade.manage",
      "message.send",
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
      "message.manage",
      "order.manage",
    ],
  },
];

export function hasPermission(
  user: WaslaUser,
  permission: Permission,
): boolean {
  if (!user.isActive) return false;

  return user.roles.some((role) => {
    const definition = DEFAULT_ROLE_PERMISSIONS.find(
      (item) => item.role === role,
    );

    return definition?.permissions.includes(permission) ?? false;
  });
}
