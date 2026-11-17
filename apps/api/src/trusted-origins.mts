const DEFAULT_TRUSTED_ORIGINS = [
  "https://wasla-web-4a64.onrender.com",
  "https://wasla.trade",
  "wasla://",
] as const;

function isLoopbackOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]" ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname)
    );
  } catch {
    return false;
  }
}

export function buildBetterAuthTrustedOrigins(
  nodeEnvironment: string | undefined,
  configuredOrigins: string | undefined,
): string[] {
  const isProduction = nodeEnvironment === "production";
  const configured = (configuredOrigins ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const origins = [
    ...DEFAULT_TRUSTED_ORIGINS,
    ...(isProduction ? [] : ["http://localhost:3000"]),
    ...configured,
  ];

  return [...new Set(
    origins.filter((origin) => !isProduction || !isLoopbackOrigin(origin)),
  )];
}
