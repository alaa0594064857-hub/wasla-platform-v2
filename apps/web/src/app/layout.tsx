
import type { Metadata } from "next";
import "./globals.css";
import "../styles/design-system.css";
import WorldThemeProvider from "../components/world-theme-provider";

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
      <body><WorldThemeProvider>{children}</WorldThemeProvider></body>
    </html>
  );
}
