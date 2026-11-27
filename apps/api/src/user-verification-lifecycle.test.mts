import { describe, expect, it, vi } from "vitest";
import { activatePendingVerification } from "./user-verification-lifecycle.mjs";

describe("email verification account lifecycle", () => {
  it("activates only the account awaiting its first verification", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });

    await activatePendingVerification(query, "new-user");

    expect(query).toHaveBeenCalledOnce();
    const [sql, values] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE id = \$1\s+AND status = 'pending_verification'/);
    expect(values).toEqual(["new-user"]);
  });

  it("keeps suspended accounts ineligible for activation", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });

    await activatePendingVerification(query, "suspended-user");

    expect(query).toHaveBeenCalledOnce();
    const [sql, values] = query.mock.calls[0];
    // The database performs this condition atomically; suspended rows cannot match it.
    expect(sql).toContain("AND status = 'pending_verification'");
    expect(sql).not.toMatch(/WHERE id = \$1\s*$/);
    expect(values).toEqual(["suspended-user"]);
  });
});
