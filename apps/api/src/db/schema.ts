
import { sql } from "drizzle-orm";

import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userStatusEnum = pgEnum("user_status", [
  "pending_verification",
  "active",
  "suspended",
  "deactivated",
]);

export const accountTypeEnum = pgEnum("account_type", [
  "company",
  "supplier",
  "manufacturer",
  "trader",
  "brand",
]);

export const accountStatusEnum = pgEnum("account_status", [
  "pending_verification",
  "active",
  "suspended",
  "deactivated",
]);

export const recordStatusEnum = pgEnum("record_status", [
  "active",
  "suspended",
  "deactivated",
]);

export const membershipStatusEnum = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
  "revoked",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "unverified",
  "pending",
  "verified",
  "rejected",
]);

export const roleScopeEnum = pgEnum("role_scope", [
  "personal",
  "platform",
  "account",
  "store",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    status: userStatusEnum("status")
      .default("pending_verification")
      .notNull(),
    preferredLocale: varchar("preferred_locale", { length: 5 })
      .default("ar")
      .notNull(),
    registrationType: varchar("registration_type", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
  ],
);

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 80 }).notNull(),
    providerSubject: varchar("provider_subject", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }),
    emailVerifiedAt: timestamp("email_verified_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_identities_provider_subject_unique").on(
      table.provider,
      table.providerSubject,
    ),
    index("auth_identities_user_id_idx").on(table.userId),
    index("auth_identities_email_idx").on(table.email),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: varchar("ip_address", { length: 255 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_unique").on(table.token),
    index("auth_sessions_user_id_idx").on(table.userId),
  ],
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    providerId: varchar("provider_id", { length: 100 }).notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("auth_accounts_user_id_idx").on(table.userId),
    uniqueIndex("auth_accounts_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("auth_verifications_identifier_idx").on(table.identifier),
  ],
);

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  avatarReference: text("avatar_reference"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountType: accountTypeEnum("account_type").notNull(),
    legalName: varchar("legal_name", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    status: accountStatusEnum("status")
      .default("pending_verification")
      .notNull(),
    countryCode: varchar("country_code", { length: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("accounts_status_idx").on(table.status),
    index("accounts_type_idx").on(table.accountType),
  ],
);

export const businessProfiles = pgTable("business_profiles", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  description: text("description"),
  website: text("website"),
  contactInformation: jsonb("contact_information").$type<
    Record<string, unknown>
  >(),
  verificationStatus: verificationStatusEnum("verification_status")
    .default("unverified")
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
});

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    scopeType: roleScopeEnum("scope_type").notNull(),
    description: text("description"),
    isSystemRole: boolean("is_system_role").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("roles_scope_name_unique").on(table.scopeType, table.name),
    uniqueIndex("roles_id_scope_unique").on(table.id, table.scopeType),
  ],
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    permissionKey: varchar("permission_key", { length: 120 })
      .notNull()
      .unique(),
    description: text("description"),
    scopeType: roleScopeEnum("scope_type").notNull(),
  },
  (table) => [
    index("permissions_scope_idx").on(table.scopeType),
    uniqueIndex("permissions_id_scope_unique").on(
      table.id,
      table.scopeType,
    ),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull(),
    permissionId: uuid("permission_id").notNull(),
    scopeType: roleScopeEnum("scope_type").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.roleId, table.permissionId],
    }),
    foreignKey({
      name: "role_permissions_role_scope_fk",
      columns: [table.roleId, table.scopeType],
      foreignColumns: [roles.id, roles.scopeType],
    }).onDelete("cascade"),
    foreignKey({
      name: "role_permissions_permission_scope_fk",
      columns: [table.permissionId, table.scopeType],
      foreignColumns: [permissions.id, permissions.scopeType],
    }).onDelete("cascade"),
  ],
);

export const accountMembers = pgTable(
  "account_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull(),
    roleScope: roleScopeEnum("role_scope").default("account").notNull(),
    status: membershipStatusEnum("status").default("invited").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("account_members_user_account_unique").on(
      table.userId,
      table.accountId,
    ),
    index("account_members_account_idx").on(table.accountId),
    foreignKey({
      name: "account_members_role_scope_fk",
      columns: [table.roleId, table.roleScope],
      foreignColumns: [roles.id, roles.scopeType],
    }).onDelete("restrict"),
    check(
      "account_members_role_scope_check",
      sql`${table.roleScope} = 'account'`,
    ),
  ],
);

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull().unique(),
    status: recordStatusEnum("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("stores_account_id_idx").on(table.accountId),
    index("stores_status_idx").on(table.status),
  ],
);

export const storeMembers = pgTable(
  "store_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull(),
    roleScope: roleScopeEnum("role_scope").default("store").notNull(),
    status: membershipStatusEnum("status").default("invited").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("store_members_user_store_unique").on(
      table.userId,
      table.storeId,
    ),
    index("store_members_store_idx").on(table.storeId),
    foreignKey({
      name: "store_members_role_scope_fk",
      columns: [table.roleId, table.roleScope],
      foreignColumns: [roles.id, roles.scopeType],
    }).onDelete("restrict"),
    check(
      "store_members_role_scope_check",
      sql`${table.roleScope} = 'store'`,
    ),
  ],
);

export const platformRoleAssignments = pgTable(
  "platform_role_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull(),
    roleScope: roleScopeEnum("role_scope").default("platform").notNull(),
    status: membershipStatusEnum("status").default("active").notNull(),
    assignedBy: uuid("assigned_by").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("platform_role_user_role_unique").on(
      table.userId,
      table.roleId,
    ),
    index("platform_role_user_idx").on(table.userId),
    foreignKey({
      name: "platform_role_scope_fk",
      columns: [table.roleId, table.roleScope],
      foreignColumns: [roles.id, roles.scopeType],
    }).onDelete("restrict"),
    check(
      "platform_role_scope_check",
      sql`${table.roleScope} = 'platform'`,
    ),
  ],
);

export const storeProducts = pgTable(
  "store_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    sku: varchar("sku", { length: 80 }),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    stockQuantity: integer("stock_quantity").default(0).notNull(),
    imageUrl: text("image_url"),
    videoUrl: text("video_url"),
    status: varchar("status", { length: 16 }).default("draft").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("store_products_store_sku_unique").on(table.storeId, table.sku),
    foreignKey({
      name: "store_products_store_id_fkey",
      columns: [table.storeId],
      foreignColumns: [stores.id],
    }).onDelete("cascade"),
    index("store_products_store_status_created_idx").on(table.storeId, table.status, table.createdAt.desc()),
    check("store_products_price_check", sql`${table.price} >= 0`),
    check("store_products_stock_quantity_check", sql`${table.stockQuantity} >= 0`),
    check("store_products_status_check", sql`${table.status} IN ('draft', 'active', 'archived')`),
  ],
);

export const storeInventoryMovements = pgTable(
  "store_inventory_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => storeProducts.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    movementType: varchar("movement_type", { length: 16 }).notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    quantityBefore: integer("quantity_before").notNull(),
    quantityAfter: integer("quantity_after").notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    referenceCode: varchar("reference_code", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("store_inventory_movements_store_created_idx").on(table.storeId, table.createdAt.desc()),
    index("store_inventory_movements_product_created_idx").on(table.productId, table.createdAt.desc()),
    check("store_inventory_movements_type_check", sql`${table.movementType} IN ('inbound', 'outbound', 'adjustment')`),
    check("store_inventory_movements_delta_check", sql`${table.quantityDelta} <> 0`),
    check("store_inventory_movements_before_check", sql`${table.quantityBefore} >= 0`),
    check("store_inventory_movements_after_check", sql`${table.quantityAfter} >= 0`),
    check("store_inventory_movements_balance_check", sql`${table.quantityAfter} - ${table.quantityBefore} = ${table.quantityDelta}`),
    check("store_inventory_movements_direction_check", sql`(${table.movementType} = 'inbound' AND ${table.quantityDelta} > 0) OR (${table.movementType} = 'outbound' AND ${table.quantityDelta} < 0) OR ${table.movementType} = 'adjustment'`),
  ],
);


export const orderStatusEnum = pgEnum("order_status", [
  "placed", "accepted", "processing", "shipped", "completed", "cancelled",
]);

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNumber: varchar("order_number", { length: 32 }).notNull().unique(),
  buyerUserId: uuid("buyer_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "restrict" }),
  status: orderStatusEnum("status").default("placed").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  discountTotal: numeric("discount_total", { precision: 14, scale: 2 }).default("0").notNull(),
  shippingTotal: numeric("shipping_total", { precision: 14, scale: 2 }).default("0").notNull(),
  taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).default("0").notNull(),
  grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull(),
  shippingAddressSnapshot: jsonb("shipping_address_snapshot").$type<Record<string, unknown>>().notNull(),
  buyerNote: varchar("buyer_note", { length: 1000 }),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("orders_buyer_idempotency_unique").on(table.buyerUserId, table.idempotencyKey),
  index("orders_buyer_created_idx").on(table.buyerUserId, table.createdAt.desc()),
  index("orders_store_status_created_idx").on(table.storeId, table.status, table.createdAt.desc()),
  check("orders_currency_check", sql`${table.currency} ~ '^[A-Z]{3}
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 120 }).notNull(),
    resourceType: varchar("resource_type", { length: 100 }).notNull(),
    resourceId: uuid("resource_id"),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    storeId: uuid("store_id").references(() => stores.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_logs_actor_idx").on(table.actorUserId),
    index("audit_logs_account_idx").on(table.accountId),
    index("audit_logs_store_idx").on(table.storeId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);
`),
  check("orders_amounts_nonnegative_check", sql`${table.subtotal} >= 0 AND ${table.discountTotal} >= 0 AND ${table.shippingTotal} >= 0 AND ${table.taxTotal} >= 0 AND ${table.grandTotal} >= 0`),
  check("orders_total_consistency_check", sql`${table.grandTotal} = ${table.subtotal} - ${table.discountTotal} + ${table.shippingTotal} + ${table.taxTotal}`),
]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => storeProducts.id, { onDelete: "set null" }),
  productTitleSnapshot: varchar("product_title_snapshot", { length: 180 }).notNull(),
  skuSnapshot: varchar("sku_snapshot", { length: 80 }),
  unitPriceSnapshot: numeric("unit_price_snapshot", { precision: 12, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull(),
  lineSubtotal: numeric("line_subtotal", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("order_items_order_idx").on(table.orderId),
  check("order_items_quantity_check", sql`${table.quantity} > 0`),
  check("order_items_amounts_check", sql`${table.unitPriceSnapshot} >= 0 AND ${table.lineSubtotal} >= 0`),
  check("order_items_line_total_check", sql`${table.lineSubtotal} = ${table.unitPriceSnapshot} * ${table.quantity}`),
]);

export const orderStatusHistory = pgTable("order_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  previousStatus: orderStatusEnum("previous_status"),
  newStatus: orderStatusEnum("new_status").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  reason: varchar("reason", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("order_status_history_order_created_idx").on(table.orderId, table.createdAt.desc()),
]);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 120 }).notNull(),
    resourceType: varchar("resource_type", { length: 100 }).notNull(),
    resourceId: uuid("resource_id"),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    storeId: uuid("store_id").references(() => stores.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_logs_actor_idx").on(table.actorUserId),
    index("audit_logs_account_idx").on(table.accountId),
    index("audit_logs_store_idx").on(table.storeId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);
