"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "./locale-provider";

type ThemeKey = "default" | "midnight" | "ocean" | "gold" | "light" | "graphite";
type WorldKey = "global" | "store" | "shops" | "business" | "trade" | "messages" | "ai" | "command" | "profile";
type SavedTheme = { worldKey: WorldKey; themeKey: ThemeKey };

const choices: { key: ThemeKey; ar: string; en: string; color: string }[] = [
  { key: "default", ar: "الافتراضي", en: "Default", color: "#d8bd84" },
  { key: "midnight", ar: "أسود ليلي", en: "Midnight", color: "#111827" },
  { key: "ocean", ar: "أزرق محيطي", en: "Ocean blue", color: "#174a78" },
  { key: "gold", ar: "ذهبي", en: "Gold", color: "#b58a35" },
  { key: "light", ar: "فاتح", en: "Light", color: "#eeeae1" },
  { key: "graphite", ar: "رمادي", en: "Graphite", color: "#68717e" },
];

function worldFromPath(path: string): WorldKey {
  if (path.startsWith("/shops")) return "shops";
  if (path.startsWith("/business")) return "business";
  if (path.startsWith("/trade")) return "trade";
  if (path.startsWith("/messages")) return "messages";
  if (path.startsWith("/ai")) return "ai";
  if (path.startsWith("/command") || path.startsWith("/admin")) return "command";
  if (path.startsWith("/profile")) return "profile";
  if (path.startsWith("/store")) return "store";
  return "global";
}

export default function WorldThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const worldKey = useMemo(() => worldFromPath(pathname), [pathname]);
  const [saved, setSaved] = useState<Partial<Record<WorldKey, ThemeKey>>>({});
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const { locale } = useLocale();
  const isEnglish = locale === "en";
  const activeTheme = saved[worldKey] ?? "default";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/preferences/themes", { credentials: "include", cache: "no-store" })
      .then(async response => {
        if (!response.ok) return null;
        return await response.json() as { success?: boolean; themes?: SavedTheme[] };
      })
      .then(data => {
        if (cancelled || !data?.success || !Array.isArray(data.themes)) return;
        setAuthenticated(true);
        const next: Partial<Record<WorldKey, ThemeKey>> = {};
        for (const item of data.themes) {
          if (choices.some(choice => choice.key === item.themeKey)) next[item.worldKey] = item.themeKey;
        }
        setSaved(next);
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.waslaTheme = activeTheme;
    document.documentElement.dataset.waslaWorld = worldKey;
    return () => {
      delete document.documentElement.dataset.waslaTheme;
      delete document.documentElement.dataset.waslaWorld;
    };
  }, [activeTheme, worldKey]);

  const choose = useCallback(async (themeKey: ThemeKey) => {
    setSaved(current => ({ ...current, [worldKey]: themeKey }));
    setSaving(true);
    try {
      const response = await fetch("/api/preferences/themes", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldKey, themeKey }),
      });
      if (!response.ok) throw new Error("Could not save theme");
    } catch {
      setSaved(current => {
        const next = { ...current };
        delete next[worldKey];
        return next;
      });
    } finally {
      setSaving(false);
    }
  }, [worldKey]);

  return (
    <>
      {children}
      {authenticated && <div className="wasla-theme-control" dir="rtl">
        <button
          type="button"
          className="wasla-theme-trigger"
          aria-expanded={open}
          aria-label={isEnglish ? "Personalize page background" : "تخصيص خلفية الصفحة"}
          onClick={() => setOpen(value => !value)}
        >
          <span aria-hidden="true">◐</span>
          {isEnglish ? "Appearance" : "المظهر"}
        </button>
        {open && (
          <section className="wasla-theme-panel" aria-label={isEnglish ? "Choose a page theme" : "اختر خلفية الصفحة"}>
            <div className="wasla-theme-panel-heading">
              <strong>{isEnglish ? "Page background" : "خلفية الصفحة"}</strong>
              <button type="button" onClick={() => setOpen(false)} aria-label={isEnglish ? "Close" : "إغلاق"}>×</button>
            </div>
            <p>{isEnglish ? "This choice applies to this world only." : "اختيارك يخص هذا العالم فقط."}</p>
            <div className="wasla-theme-options">
              {choices.map(choice => (
                <button
                  type="button"
                  key={choice.key}
                  className={activeTheme === choice.key ? "is-selected" : ""}
                  onClick={() => void choose(choice.key)}
                  disabled={saving || !ready}
                  aria-pressed={activeTheme === choice.key}
                >
                  <i style={{ background: choice.color }} />
                  <span>{isEnglish ? choice.en : choice.ar}</span>
                  {activeTheme === choice.key && <b>✓</b>}
                </button>
              ))}
            </div>
            <small>{saving ? (isEnglish ? "Saving…" : "جارٍ الحفظ…") : (isEnglish ? "Saved to your account" : "يُحفظ في حسابك")}</small>
          </section>
        )}
      </div>}
    </>
  );
}
