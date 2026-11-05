"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Locale = "ar" | "en";
type LocaleContextValue = { locale: Locale; setLocale: (value: Locale) => void };
const LocaleContext = createContext<LocaleContextValue | null>(null);
const STORAGE_KEY = "wasla-locale";

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ar");
  const setLocale = useCallback((value: Locale) => {
    setLocaleState(value);
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch {}
    document.documentElement.lang = value;
    document.documentElement.dir = value === "ar" ? "rtl" : "ltr";
    window.dispatchEvent(new CustomEvent("wasla-locale-change", { detail: value }));
  }, []);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch {}
    if (saved === "ar" || saved === "en") setLocale(saved);
    else {
      document.documentElement.lang = "ar";
      document.documentElement.dir = "rtl";
    }
  }, [setLocale]);
  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}