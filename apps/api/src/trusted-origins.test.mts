import { describe, expect, it } from "vitest";

import { buildBetterAuthTrustedOrigins } from "./trusted-origins.mjs";

describe("Better Auth trusted origins", () => {
  it("keeps production defaults without localhost origins", () => {
    const origins = buildBetterAuthTrustedOrigins("production", undefined);

    expect(origins).toContain("https://wasla.trade");
    expect(origins).toContain("https://wasla-web-4a64.onrender.com");
    expect(origins).toContain("wasla://");
    expect(origins).not.toContain("http://localhost:3000");
  });

  it("allows localhost for non-production development", () => {
    const origins = buildBetterAuthTrustedOrigins("development", undefined);

    expect(origins).toContain("http://localhost:3000");
  });

  it("filters loopback origins from production environment overrides", () => {
    const origins = buildBetterAuthTrustedOrigins(
      "production",
      " https://app.wasla.trade, http://localhost:3000, http://127.0.0.1:4000, http://dev.localhost:3000, wasla:// ",
    );

    expect(origins).toContain("https://app.wasla.trade");
    expect(origins).toContain("wasla://");
    expect(origins).not.toContain("http://localhost:3000");
    expect(origins).not.toContain("http://127.0.0.1:4000");
    expect(origins).not.toContain("http://dev.localhost:3000");
  });

  it("trims and deduplicates configured origins", () => {
    const origins = buildBetterAuthTrustedOrigins(
      "development",
      "https://wasla.trade, https://extra.wasla.trade,https://extra.wasla.trade",
    );

    expect(origins.filter((origin) => origin === "https://extra.wasla.trade")).toHaveLength(1);
  });
});
