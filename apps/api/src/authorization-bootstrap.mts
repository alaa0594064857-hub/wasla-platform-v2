import { getDatabasePool } from "./database.js";

type Scope = "personal" | "platform" | "account" | "store";
type RoleDefinition = { name: string; scope: Scope; permissions: readonly string[] };

const accountOwner = [
  "account.read", "account.update", "account.delete",
  "account.member.read", "account.member.invite", "account.member.update", "account.member.remove",
  "account.business.read", "account.business.update",
  "account.product.read", "account.product.create", "account.product.update", "account.product.delete",
  "account.order.read", "account.order.manage",
  "account.trade.read", "account.trade.create", "account.trade.update", "account.trade.negotiate",
  "account.message.read", "account.message.send", "account.message.manage",
  "account.reports.read", "account.settings.manage",
] as const;

const storeOwner = [
  "store.read", "store.update",
  "store.product.read", "store.product.create", "store.product.update", "store.product.delete",
  "store.inventory.manage", "store.order.read", "store.order.manage",
  "store.message.read", "store.message.send", "store.reports.read", "store.settings.manage",
] as const;

const definitions: readonly RoleDefinition[] = [
  { name: "buyer", scope: "personal", permissions: [
    "profile.read", "profile.update", "preferences.manage", "personal.order.read",
    "personal.order.create", "personal.order.cancel", "security.manage",
  ] },
  { name: "individual_user", scope: "personal", permissions: [
    "profile.read", "profile.update", "preferences.manage", "security.manage",
  ] },
  { name: "platform_owner", scope: "platform", permissions: [
    "platform.users.read", "platform.users.manage", "platform.reports.read",
    "platform.reports.manage", "platform.settings.manage", "platform.audit.read", "platform.manage",
  ] },
  { name: "platform_admin", scope: "platform", permissions: [
    "platform.users.read", "platform.users.manage", "platform.reports.read",
    "platform.reports.manage", "platform.settings.manage", "platform.audit.read",
  ] },
  { name: "support_admin", scope: "platform", permissions: [
    "platform.users.read", "platform.audit.read",
  ] },
  { name: "account_owner", scope: "account", permissions: accountOwner },
  { name: "account_admin", scope: "account", permissions: accountOwner.filter((permission) => permission !== "account.delete") },
  { name: "account_manager", scope: "account", permissions: [
    "account.read", "account.member.read", "account.business.read", "account.business.update",
    "account.product.read", "account.product.create", "account.product.update",
    "account.order.read", "account.order.manage", "account.trade.read", "account.trade.create",
    "account.trade.update", "account.trade.negotiate", "account.message.read", "account.message.send",
    "account.reports.read",
  ] },
  { name: "account_employee", scope: "account", permissions: [
    "account.read", "account.business.read", "account.product.read", "account.product.create",
    "account.product.update", "account.order.read", "account.trade.read",
    "account.message.read", "account.message.send",
  ] },
  { name: "account_viewer", scope: "account", permissions: [
    "account.read", "account.business.read", "account.product.read", "account.order.read",
    "account.trade.read", "account.message.read",
  ] },
  { name: "store_owner", scope: "store", permissions: storeOwner },
  { name: "store_admin", scope: "store", permissions: storeOwner.filter((permission) => permission !== "store.settings.manage") },
  { name: "store_manager", scope: "store", permissions: [
    "store.read", "store.update", "store.product.read", "store.product.create", "store.product.update",
    "store.inventory.manage", "store.order.read", "store.order.manage",
    "store.message.read", "store.message.send", "store.reports.read",
  ] },
  { name: "store_employee", scope: "store", permissions: [
    "store.read", "store.product.read", "store.order.read", "store.message.read", "store.message.send",
  ] },
];

/**
 * Idempotently provisions the shared role/permission matrix in the production database.
 * Existing memberships and user assignments are never changed.
 */
export async function ensureAuthorizationRoles(): Promise<void> {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const permissionIds = new Map<string, string>();

    for (const role of definitions) {
      for (const permission of role.permissions) {
        if (permissionIds.has(permission)) continue;
        const result = await client.query<{ id: string }>(
          `INSERT INTO permissions (permission_key, description, scope_type)
           VALUES ($1, $2, $3)
           ON CONFLICT (permission_key)
           DO UPDATE SET description = EXCLUDED.description
           WHERE permissions.scope_type = EXCLUDED.scope_type
           RETURNING id`,
          [permission, `WASLA system permission: ${permission}`, role.scope],
        );
        if (result.rows.length !== 1) {
          throw new Error(`Permission scope conflict or seed failure: ${permission}`);
        }
        permissionIds.set(permission, result.rows[0].id);
      }
    }

    for (const role of definitions) {
      const roleResult = await client.query<{ id: string }>(
        `INSERT INTO roles (name, scope_type, description, is_system_role)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (scope_type, name)
         DO UPDATE SET description = EXCLUDED.description, is_system_role = TRUE, updated_at = NOW()
         RETURNING id`,
        [role.name, role.scope, `WASLA system role: ${role.name} (${role.scope})`],
      );
      const roleId = roleResult.rows[0]?.id;
      if (!roleId) throw new Error(`Could not provision role: ${role.name}`);

      await client.query("DELETE FROM role_permissions WHERE role_id = $1", [roleId]);
      for (const permission of role.permissions) {
        const permissionId = permissionIds.get(permission);
        if (!permissionId) throw new Error(`Missing permission: ${permission}`);
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id, scope_type)
           VALUES ($1, $2, $3)
           ON CONFLICT (role_id, permission_id) DO NOTHING`,
          [roleId, permissionId, role.scope],
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
