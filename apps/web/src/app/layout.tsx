import type { Metadata } from "next";
import "./globals.css";
import "../styles/design-system.css";
import WorldThemeProvider from "../components/world-theme-provider";
import { LocaleProvider } from "../components/locale-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://wasla.trade"),
  applicationName: "WASLA",
  title: {
    default: "WASLA | وصلة",
    template: "%s | WASLA",
  },
  description:
    "WASLA connects global commerce, independent stores, businesses, suppliers and trade opportunities in one bilingual platform. منصة وصلة للتجارة والأعمال العالمية.",
  openGraph: {
    type: "website",
    siteName: "WASLA",
    title: "WASLA | وصلة",
    description:
      "A global bilingual platform connecting commerce, stores, businesses and trade.",
    url: "https://wasla.trade",
    locale: "ar_AR",
    alternateLocale: ["en_US"],
  },
  twitter: {
    card: "summary",
    title: "WASLA | وصلة",
    description:
      "A global bilingual platform for commerce, stores, businesses and trade.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta name="impact-site-verification" content="2bf95771-6ee0-451a-a18a-d106513db226" />
      </head>
      <body><LocaleProvider><WorldThemeProvider>{children}</WorldThemeProvider></LocaleProvider></body>
    </html>
  );
}
