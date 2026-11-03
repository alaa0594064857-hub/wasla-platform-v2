
import { describe, expect, it } from "vitest";
import {
  hasPermission,
  type WaslaUser,
} from "./index";

const activeBuyer: WaslaUser = {
  id: "test-user-1",
  email: "buyer@example.com",
  displayName: "Test Buyer",
  accountTypes: ["buyer"],
  roles: ["buyer"],
  locale: "ar",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("WASLA permissions", () => {
  it("allows buyers to create orders", () => {
    expect(hasPermission(activeBuyer, "order.create")).toBe(true);
  });

  it("does not allow buyers to manage users", () => {
    expect(hasPermission(activeBuyer, "users.manage")).toBe(false);
  });

  it("denies permissions to inactive users", () => {
    expect(
      hasPermission(
        { ...activeBuyer, isActive: false },
        "order.create",
      ),
    ).toBe(false);
  });
});
