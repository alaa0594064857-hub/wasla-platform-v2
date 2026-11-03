import { describe, expect, it } from "vitest";

import {
  getTextDirection,
  hasPermission,
  type WaslaUser,
} from "./index";

const activeBuyer: WaslaUser = {
  id: "user-1",
  email: "buyer@example.com",
  displayName: "Test Buyer",
  locale: "ar",
  status: "active",
  assignments: [
    {
      role: "buyer",
      scope: "personal",
      status: "active",
      resourceId: null,
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const accountOwner: WaslaUser = {
  ...activeBuyer,
  assignments: [
    {
      role: "account_owner",
      scope: "account",
      status: "active",
      resourceId: "account-1",
    },
  ],
};

const storeEmployee: WaslaUser = {
  ...activeBuyer,
  assignments: [
    {
      role: "store_employee",
      scope: "store",
      status: "active",
      resourceId: "store-1",
    },
  ],
};

describe("WASLA localization", () => {
  it("uses RTL for Arabic", () => {
    expect(getTextDirection("ar")).toBe("rtl");
  });

  it("uses LTR for English", () => {
    expect(getTextDirection("en")).toBe("ltr");
  });
});

describe("WASLA scoped authorization", () => {
  it("allows an active buyer to create a personal order", () => {
    expect(
      hasPermission(activeBuyer, "personal.order.create", {
        scope: "personal",
        resourceId: null,
      }),
    ).toBe(true);
  });

  it("does not allow a buyer to manage platform users", () => {
    expect(
      hasPermission(activeBuyer, "platform.users.manage", {
        scope: "platform",
        resourceId: null,
      }),
    ).toBe(false);
  });

  it("allows an account owner to manage their account", () => {
    expect(
      hasPermission(accountOwner, "account.settings.manage", {
        scope: "account",
        resourceId: "account-1",
      }),
    ).toBe(true);
  });

  it("does not allow an account owner to access another account", () => {
    expect(
      hasPermission(accountOwner, "account.settings.manage", {
        scope: "account",
        resourceId: "account-2",
      }),
    ).toBe(false);
  });

  it("does not allow account permissions in store scope", () => {
    expect(
      hasPermission(accountOwner, "account.product.update", {
        scope: "store",
        resourceId: "store-1",
      }),
    ).toBe(false);
  });

  it("allows a store employee to read store orders", () => {
    expect(
      hasPermission(storeEmployee, "store.order.read", {
        scope: "store",
        resourceId: "store-1",
      }),
    ).toBe(true);
  });

  it("does not allow a store employee to manage inventory", () => {
    expect(
      hasPermission(storeEmployee, "store.inventory.manage", {
        scope: "store",
        resourceId: "store-1",
      }),
    ).toBe(false);
  });

  it("denies access through a suspended membership", () => {
    const suspendedMembership: WaslaUser = {
      ...accountOwner,
      assignments: accountOwner.assignments.map((assignment) => ({
        ...assignment,
        status: "suspended",
      })),
    };

    expect(
      hasPermission(suspendedMembership, "account.read", {
        scope: "account",
        resourceId: "account-1",
      }),
    ).toBe(false);
  });

  it("denies access to a suspended user", () => {
    expect(
      hasPermission(
        { ...activeBuyer, status: "suspended" },
        "personal.order.create",
        { scope: "personal", resourceId: null },
      ),
    ).toBe(false);
  });

  it("denies access to a pending user", () => {
    expect(
      hasPermission(
        { ...activeBuyer, status: "pending_verification" },
        "personal.order.create",
        { scope: "personal", resourceId: null },
      ),
    ).toBe(false);
  });
});
