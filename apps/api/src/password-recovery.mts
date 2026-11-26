export const PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 60;
export const REVOKE_SESSIONS_ON_PASSWORD_RESET = true;

export function buildPasswordResetUrl(
  token: string,
  webBaseUrl = process.env.WASLA_WEB_URL ?? "https://wasla.trade",
): string {
  const resetUrl = new URL("/reset-password", webBaseUrl);
  resetUrl.searchParams.set("token", token);
  return resetUrl.toString();
}
