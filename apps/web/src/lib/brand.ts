/**
 * Central WASLA brand metadata and design tokens.
 * Keep product logic independent from this replaceable visual identity.
 */
export const waslaBrand = {
  name: "WASLA",
  nameArabic: "وصلة",
  tagline: "A global platform for commerce and business",
} as const;

export const waslaTokens = {
  color: {
    navy: "#14243a",
    navyDeep: "#101e30",
    navyLight: "#203b59",
    gold: "#c6a15b",
    goldLight: "#dfc58f",
    cream: "#f7f4ed",
    white: "#ffffff",
    muted: "#738092",
  },
  radius: { small: "8px", medium: "12px", large: "18px", extraLarge: "24px" },
  contentWidth: "1240px",
} as const;
