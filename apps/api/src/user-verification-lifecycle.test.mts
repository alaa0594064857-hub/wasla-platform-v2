import { describe, expect, it, vi } from "vitest";
import { activatePendingVerification } from "./user-verification-lifecycle.mjs";

describe("email verification account lifecycle", () => {
  it("activates a newly registered account awaiting verification", async () => {
    const query = vi.fn().mockResolvedValue(undefined);

    await activatePendingVerification(query, "new-user");

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain("status = 'pending_verification'");
    expect(query.mock.calls[0][1]).toEqual(["new-user"]);
  });

  it("does not reactivate a suspended account", async () => {
    const accounts = new Map([["suspended-user", "suspended"]]);
    const query = vi.fn(async (sql: string, values: string[]) => {
      // Model the guarded UPDATE: only pending_verification rows are eligible.
      if (
        sql.includes("status = 'pending_verification'") &&
        accounts.get(values[0]) === "pending_verification"
      ) {
        accounts.set(values[0], "active");
      }
    });

    await activatePendingVerification(query, "suspended-user");

    expect(accounts.get("suspended-user")).toBe("suspended");
    expect(query).toHaveBeenCalledOnce();
  });
});
