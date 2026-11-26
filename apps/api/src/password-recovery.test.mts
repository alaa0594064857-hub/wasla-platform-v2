import { describe, expect, it } from "vitest";

import {
  buildPasswordResetUrl,
  PASSWORD_RESET_TOKEN_TTL_SECONDS,
  REVOKE_SESSIONS_ON_PASSWORD_RESET,
} from "./password-recovery.mjs";

describe("password recovery policy", () => {
  it("uses a one-hour reset token lifetime", () => {
    expect(PASSWORD_RESET_TOKEN_TTL_SECONDS).toBe(3600);
  });

  it("revokes existing sessions after a successful password reset", () => {
    expect(REVOKE_SESSIONS_ON_PASSWORD_RESET).toBe(true);
  });

  it("builds reset links on the configured WASLA web origin", () => {
    expect(
      buildPasswordResetUrl("test-token", "https://wasla.trade"),
    ).toBe("https://wasla.trade/reset-password?token=test-token");
  });

  it("encodes reset tokens as query parameters", () => {
    const url = new URL(
      buildPasswordResetUrl("token with+reserved&chars", "https://app.wasla.trade"),
    );

    expect(url.origin).toBe("https://app.wasla.trade");
    expect(url.pathname).toBe("/reset-password");
    expect(url.searchParams.get("token")).toBe("token with+reserved&chars");
  });

  it("uses the canonical WASLA web origin by default", () => {
    expect(buildPasswordResetUrl("token")).toBe(
      "https://wasla.trade/reset-password?token=token",
    );
  });
});
