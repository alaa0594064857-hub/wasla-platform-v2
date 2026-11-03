import { sql } from "drizzle-orm";

import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
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

export const membershipStatusEnum = pgEnum(
  "membership_status",
  ["invited", "active", "suspended", "revoked"],
);

export const verificationStatusEnum = pgEnum(
  "verification_status",
  ["unverified", "pending", "verified", "rejected"],
);

export const roleScopeEnum = pgEnum("role_scope", [
  "personal",
  "platform",
  "account",
  "store",
]);

// Users

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),

  status: userStatusEnum("status")
    .default("pending_verification")
    .notNull(),

  preferredLocale: varchar("preferred_locale", {
    length: 5,
  })
    .default("ar")
    .notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

// Authentication identities

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    provider: varchar("provider", {
      length: 80,
    }).notNull(),

    providerSubject: varchar("provider_subject", {
      length: 255,
    }).notNull(),

    email: varchar("email", {
      length: 320,
    }),

    emailVerifiedAt: timestamp("email_verified_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
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

// Personal profiles

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, {
      onDelete: "cascade",
    }),

  displayName: varchar("display_name", {
    length: 160,
  }).notNull(),

  avatarReference: text("avatar_reference"),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

// Business accounts

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountType: accountTypeEnum("account_type").notNull(),

    legalName: varchar("legal_name", {
      length: 255,
    }).notNull(),

    displayName: varchar("display_name", {
      length: 255,
    }).notNull(),

    status: accountStatusEnum("status")
      .default("pending_verification")
      .notNull(),

    countryCode: varchar("country_code", {
      length: 2,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("accounts_status_idx").on(table.status),
    index("accounts_type_idx").on(table.accountType),
  ],
);

// Business profiles

export const businessProfiles = pgTable(
  "business_profiles",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),

    description: text("description"),

    website: text("website"),

    contactInformation: jsonb(
      "contact_information",
    ).$type<Record<string, unknown>>(),

    verificationStatus: verificationStatusEnum(
      "verification_status",
    )
      .default("unverified")
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
);

// Roles

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    name: varchar("name", {
      length: 80,
    }).notNull(),

    scopeType: roleScopeEnum("scope_type").notNull(),

    description: text("description"),

    isSystemRole: boolean("is_system_role")
      .default(false)
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("roles_scope_name_unique").on(
      table.scopeType,
      table.name,
    ),

    uniqueIndex("roles_id_scope_unique").on(
      table.id,
      table.scopeType,
    ),
  ],
);

// Permissions

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    permissionKey: varchar("permission_key", {
      length: 120,
    })
      .notNull()
      .unique(),

    description: text("description"),

    scopeType: roleScopeEnum("scope_type").notNull(),
  },
  (table) => [
    index("permissions_scope_idx").on(table.scopeType),
  ],
);

// Role permissions

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, {
        onDelete: "cascade",
      }),

    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, {
        onDelete: "cascade",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.roleId, table.permissionId],
    }),
  ],
);

// Account memberships

export const accountMembers = pgTable(
  "account_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    roleId: uuid("role_id").notNull(),

    roleScope: roleScopeEnum("role_scope")
      .default("account")
      .notNull(),

    status: membershipStatusEnum("status")
      .default("invited")
      .notNull(),

    invitedBy: uuid("invited_by").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),

    joinedAt: timestamp("joined_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("account_members_user_account_unique").on(
      table.userId,
      table.accountId,
    ),

    index("account_members_account_idx").on(
      table.accountId,
    ),

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

// Stores

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "restrict",
      }),

    name: varchar("name", {
      length: 255,
    }).notNull(),

    slug: varchar("slug", {
      length: 180,
    })
      .notNull()
      .unique(),

    status: recordStatusEnum("status")
      .default("active")
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("stores_account_id_idx").on(table.accountId),
    index("stores_status_idx").on(table.status),
  ],
);

// Store memberships

export const storeMembers = pgTable(
  "store_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, {
        onDelete: "cascade",
      }),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    roleId: uuid("role_id").notNull(),

    roleScope: roleScopeEnum("role_scope")
      .default("store")
      .notNull(),

    status: membershipStatusEnum("status")
      .default("invited")
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
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

// Platform role assignments

export const platformRoleAssignments = pgTable(
  "platform_role_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    roleId: uuid("role_id").notNull(),

    roleScope: roleScopeEnum("role_scope")
      .default("platform")
      .notNull(),

    status: membershipStatusEnum("status")
      .default("active")
      .notNull(),

    assignedBy: uuid("assigned_by").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),

    assignedAt: timestamp("assigned_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
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

// Audit logs

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    actorUserId: uuid("actor_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),

    action: varchar("action", {
      length: 120,
    }).notNull(),

    resourceType: varchar("resource_type", {
      length: 100,
    }).notNull(),

    resourceId: uuid("resource_id"),

    accountId: uuid("account_id").references(
      () => accounts.id,
      {
        onDelete: "set null",
      },
    ),

    storeId: uuid("store_id").references(
      () => stores.id,
      {
        onDelete: "set null",
      },
    ),

    metadata: jsonb("metadata").$type<
      Record<string, unknown>
    >(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
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
