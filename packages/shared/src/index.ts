/**
 * WASLA Shared Package
 *
 * نقطة التصدير الرئيسية للأنواع والأدوات
 * المشتركة بين تطبيقات المنصة.
 */

export const WASLA_CONFIG = {
  name: "WASLA",
  version: "1.0.0",
  supportedLocales: ["ar", "en"] as const,
  defaultLocale: "ar",
  defaultDirection: "rtl",
} as const;

export type WaslaLocale =
  (typeof WASLA_CONFIG.supportedLocales)[number];

export type TextDirection = "rtl" | "ltr";

export function getTextDirection(
  locale: WaslaLocale,
): TextDirection {
  return locale === "ar" ? "rtl" : "ltr";
}
