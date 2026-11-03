
import { describe, expect, it } from "vitest";
import {
  hasPermission,
  getTextDirection,
  type WaslaUser,
} from "./index";

const activeBuyer: WaslaUser = {
  id: "test-user-1",
  email: "buyer@example.com",
  displayName: "Test Buyer",
  accountTypes: ["buyer"],
  roles: ["buyer"],
  locale: "ar",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("WASLA account and permission core", () => {
  it("allows active buyers to create orders", () => {
    expect(
      hasPermission(activeBuyer, "order.create"),
    ).toBe(true);
  });

  it("does not allow buyers to manage platform users", () => {
    expect(
      hasPermission(activeBuyer, "users.manage"),
    ).toBe(false);
  });

  it("denies permissions to suspended users", () => {
    expect(
      hasPermission(
        { ...activeBuyer, status: "suspended" },
        "order.create",
      ),
    ).toBe(false);
  });

  it("denies permissions to pending users", () => {
    expect(
      hasPermission(
        { ...activeBuyer, status: "pending_verification" },
        "order.create",
      ),
    ).toBe(false);
  });

  it("supports multiple roles for one user", () => {
    const multiRoleUser: WaslaUser = {
      ...activeBuyer,
      accountTypes: ["buyer", "store_owner"],
      roles: ["buyer", "store_owner"],
    };

    expect(
      hasPermission(multiRoleUser, "store.manage"),
    ).toBe(true);

    expect(
      hasPermission(multiRoleUser, "order.create"),
    ).toBe(true);
  });

  it("uses RTL for Arabic", () => {
    expect(getTextDirection("ar")).toBe("rtl");
  });

  it("uses LTR for English", () => {
    expect(getTextDirection("en")).toBe("ltr");
  });
});
