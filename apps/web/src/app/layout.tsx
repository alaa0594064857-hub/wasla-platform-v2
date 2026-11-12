import type { Metadata } from "next";
import "./globals.css";
import "../styles/design-system.css";
import WorldThemeProvider from "../components/world-theme-provider";
import { LocaleProvider } from "../components/locale-provider";

export const metadata: Metadata = {
  title: "WASLA | وصلة",
  description: "A global business and commerce platform.",
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
