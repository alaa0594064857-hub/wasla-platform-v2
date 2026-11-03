/**
 * WASLA V2 Shared Core
 *
 * Shared authorization types and UI helpers.
 * Backend and database remain the security authority.
 */

export const WASLA_CONFIG = {
  name: "WASLA",
  version: "2.0.0",
  supportedLocales: ["ar", "en"] as const,
  defaultLocale: "ar",
} as const;

export type WaslaLocale =
  (typeof WASLA_CONFIG.supportedLocales)[number];

export type TextDirection = "rtl" | "ltr";

export function getTextDirection(
  locale: WaslaLocale,
): TextDirection {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Business account types stored in the database. */
export const ACCOUNT_TYPES = [
  "company",
  "supplier",
  "manufacturer",
  "trader",
  "brand",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type AuthorizationScope =
  | "personal"
  | "platform"
  | "account"
  | "store";

export type UserStatus =
  | "active"
  | "pending_verification"
  | "suspended"
  | "deactivated";

export type MembershipStatus =
  | "invited"
  | "active"
  | "suspended"
  | "revoked";

/**
 * Permission keys are scope-prefixed where needed.
 * This keeps permission_key globally unique in PostgreSQL.
 */
export const PERMISSIONS = [
  // Personal
  "profile.read",
  "profile.update",
  "preferences.manage",
  "personal.order.read",
  "personal.order.create",
  "personal.order.cancel",
  "security.manage",

  // Platform
  "platform.users.read",
  "platform.users.manage",
  "platform.reports.read",
  "platform.reports.manage",
  "platform.settings.manage",
  "platform.audit.read",
  "platform.manage",

  // Account
  "account.read",
  "account.update",
  "account.delete",
  "account.member.read",
  "account.member.invite",
  "account.member.update",
  "account.member.remove",
  "account.business.read",
  "account.business.update",
  "account.product.read",
  "account.product.create",
  "account.product.update",
  "account.product.delete",
  "account.order.read",
  "account.order.manage",
  "account.trade.read",
  "account.trade.create",
  "account.trade.update",
  "account.trade.negotiate",
  "account.message.read",
  "account.message.send",
  "account.message.manage",
  "account.reports.read",
  "account.settings.manage",

  // Store
  "store.read",
  "store.update",
  "store.product.read",
  "store.product.create",
  "store.product.update",
  "store.product.delete",
  "store.inventory.manage",
  "store.order.read",
  "store.order.manage",
  "store.message.read",
  "store.message.send",
  "store.reports.read",
  "store.settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_SCOPES = {
  "profile.read": "personal",
  "profile.update": "personal",
  "preferences.manage": "personal",
  "personal.order.read": "personal",
  "personal.order.create": "personal",
  "personal.order.cancel": "personal",
  "security.manage": "personal",

  "platform.users.read": "platform",
  "platform.users.manage": "platform",
  "platform.reports.read": "platform",
  "platform.reports.manage": "platform",
  "platform.settings.manage": "platform",
  "platform.audit.read": "platform",
  "platform.manage": "platform",

  "account.read": "account",
  "account.update": "account",
  "account.delete": "account",
  "account.member.read": "account",
  "account.member.invite": "account",
  "account.member.update": "account",
  "account.member.remove": "account",
  "account.business.read": "account",
  "account.business.update": "account",
  "account.product.read": "account",
  "account.product.create": "account",
  "account.product.update": "account",
  "account.product.delete": "account",
  "account.order.read": "account",
  "account.order.manage": "account",
  "account.trade.read": "account",
  "account.trade.create": "account",
  "account.trade.update": "account",
  "account.trade.negotiate": "account",
  "account.message.read": "account",
  "account.message.send": "account",
  "account.message.manage": "account",
  "account.reports.read": "account",
  "account.settings.manage": "account",

  "store.read": "store",
  "store.update": "store",
  "store.product.read": "store",
  "store.product.create": "store",
  "store.product.update": "store",
  "store.product.delete": "store",
  "store.inventory.manage": "store",
  "store.order.read": "store",
  "store.order.manage": "store",
  "store.message.read": "store",
  "store.message.send": "store",
  "store.reports.read": "store",
  "store.settings.manage": "store",
} as const satisfies Record<Permission, AuthorizationScope>;

export type RoleName =
  | "buyer"
  | "individual_user"
  | "platform_owner"
  | "platform_admin"
  | "support_admin"
  | "account_owner"
  | "account_admin"
  | "account_manager"
  | "account_employee"
  | "account_viewer"
  | "store_owner"
  | "store_admin"
  | "store_manager"
  | "store_employee";

export interface RoleDefinition {
  readonly name: RoleName;
  readonly scope: AuthorizationScope;
  readonly permissions: readonly Permission[];
}

const PERSONAL_PERMISSIONS = [
  "profile.read",
  "profile.update",
  "preferences.manage",
  "personal.order.read",
  "personal.order.create",
  "personal.order.cancel",
  "security.manage",
] as const satisfies readonly Permission[];

const ACCOUNT_OWNER_PERMISSIONS = [
  "account.read",
  "account.update",
  "account.delete",
  "account.member.read",
  "account.member.invite",
  "account.member.update",
  "account.member.remove",
  "account.business.read",
  "account.business.update",
  "account.product.read",
  "account.product.create",
  "account.product.update",
  "account.product.delete",
  "account.order.read",
  "account.order.manage",
  "account.trade.read",
  "account.trade.create",
  "account.trade.update",
  "account.trade.negotiate",
  "account.message.read",
  "account.message.send",
  "account.message.manage",
  "account.reports.read",
  "account.settings.manage",
] as const satisfies readonly Permission[];

const STORE_OWNER_PERMISSIONS = [
  "store.read",
  "store.update",
  "store.product.read",
  "store.product.create",
  "store.product.update",
  "store.product.delete",
  "store.inventory.manage",
  "store.order.read",
  "store.order.manage",
  "store.message.read",
  "store.message.send",
  "store.reports.read",
  "store.settings.manage",
] as const satisfies readonly Permission[];

export const ROLE_DEFINITIONS = [
  {
    name: "buyer",
    scope: "personal",
    permissions: PERSONAL_PERMISSIONS,
  },
  {
    name: "individual_user",
    scope: "personal",
    permissions: [
      "profile.read",
      "profile.update",
      "preferences.manage",
      "security.manage",
    ],
  },
  {
    name: "platform_owner",
    scope: "platform",
    permissions: [
      "platform.users.read",
      "platform.users.manage",
      "platform.reports.read",
      "platform.reports.manage",
      "platform.settings.manage",
      "platform.audit.read",
      "platform.manage",
    ],
  },
  {
    name: "platform_admin",
    scope: "platform",
    permissions: [
      "platform.users.read",
      "platform.users.manage",
      "platform.reports.read",
      "platform.reports.manage",
      "platform.settings.manage",
      "platform.audit.read",
    ],
  },
  {
    name: "support_admin",
    scope: "platform",
    permissions: [
      "platform.users.read",
      "platform.audit.read",
    ],
  },
  {
    name: "account_owner",
    scope: "account",
    permissions: ACCOUNT_OWNER_PERMISSIONS,
  },
  {
    name: "account_admin",
    scope: "account",
    permissions: ACCOUNT_OWNER_PERMISSIONS.filter(
      (permission) => permission !== "account.delete",
    ),
  },
  {
    name: "account_manager",
    scope: "account",
    permissions: [
      "account.read",
      "account.member.read",
      "account.business.read",
      "account.business.update",
      "account.product.read",
      "account.product.create",
      "account.product.update",
      "account.order.read",
      "account.order.manage",
      "account.trade.read",
      "account.trade.create",
      "account.trade.update",
      "account.trade.negotiate",
      "account.message.read",
      "account.message.send",
      "account.reports.read",
    ],
  },
  {
    name: "account_employee",
    scope: "account",
    permissions: [
      "account.read",
      "account.business.read",
      "account.product.read",
      "account.product.create",
      "account.product.update",
      "account.order.read",
      "account.trade.read",
      "account.message.read",
      "account.message.send",
    ],
  },
  {
    name: "account_viewer",
    scope: "account",
    permissions: [
      "account.read",
      "account.business.read",
      "account.product.read",
      "account.order.read",
      "account.trade.read",
      "account.message.read",
    ],
  },
  {
    name: "store_owner",
    scope: "store",
    permissions: STORE_OWNER_PERMISSIONS,
  },
  {
    name: "store_admin",
    scope: "store",
    permissions: STORE_OWNER_PERMISSIONS.filter(
      (permission) => permission !== "store.settings.manage",
    ),
  },
  {
    name: "store_manager",
    scope: "store",
    permissions: [
      "store.read",
      "store.update",
      "store.product.read",
      "store.product.create",
      "store.product.update",
      "store.inventory.manage",
      "store.order.read",
      "store.order.manage",
      "store.message.read",
      "store.message.send",
      "store.reports.read",
    ],
  },
  {
    name: "store_employee",
    scope: "store",
    permissions: [
      "store.read",
      "store.product.read",
      "store.order.read",
      "store.message.read",
      "store.message.send",
    ],
  },
] as const satisfies readonly RoleDefinition[];

/**
 * Assignment data is a server-provided authorization projection.
 * It is not a replacement for database membership records.
 */
export interface AuthorizationAssignment {
  role: RoleName;
  scope: AuthorizationScope;
  status: MembershipStatus;
  resourceId: string | null;
}

export interface WaslaUser {
  id: string;
  email: string;
  displayName: string;
  locale: WaslaLocale;
  status: UserStatus;
  assignments: readonly AuthorizationAssignment[];
  createdAt: string;
  updatedAt: string;
}

export interface PermissionTarget {
  scope: AuthorizationScope;
  resourceId: string | null;
}

/**
 * UI convenience check only.
 * The API must independently enforce every permission.
 */
export function hasPermission(
  user: WaslaUser,
  permission: Permission,
  target: PermissionTarget,
): boolean {
  if (user.status !== "active") {
    return false;
  }

  const requiredScope = PERMISSION_SCOPES[permission];

  if (target.scope !== requiredScope) {
    return false;
  }

  return user.assignments.some((assignment) => {
    if (assignment.status !== "active") {
      return false;
    }

    if (assignment.scope !== requiredScope) {
      return false;
    }

    if (assignment.resourceId !== target.resourceId) {
      return false;
    }

    const definition = ROLE_DEFINITIONS.find(
      (role) =>
        role.name === assignment.role &&
        role.scope === assignment.scope,
    );

    return definition?.permissions.includes(permission) ?? false;
  });
}
