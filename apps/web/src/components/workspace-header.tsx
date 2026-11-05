"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "./locale-provider";
import { authClient } from "@/lib/auth-client";

type Profile = { displayName?: string; avatarReference?: string | null; email?: string };

export default function WorkspaceHeader({ section = "account" }: { section?: "account" | "shops" | "business" }) {
  const { locale, setLocale } = useLocale();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const { data: session, isPending } = authClient.useSession();
  const ar = locale === "ar";
  const inAccountSpace = pathname === "/account" || pathname === "/profile";
  const accountHref = inAccountSpace ? "/" : "/account";
  const messagesHref = pathname === "/messages" ? "/" : "/messages";

  useEffect(() => {
    if (!session?.user) { setProfile(null); return; }
    let active = true;
    fetch("/api/profile", { credentials: "include", cache: "no-store" })
      .then(async r => r.ok ? r.json() : null)
      .then(data => { if (active && data?.success && data.profile) setProfile(data.profile as Profile); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [session?.user?.id, pathname]);

  const name = profile?.displayName || session?.user?.name || (ar ? "حسابي" : "My account");
  const avatar = profile?.avatarReference || session?.user?.image || "";
  return <header className="wasla-workspace-header" data-section={section} dir={ar ? "rtl" : "ltr"}>
    <Link href="/" className="wasla-workspace-brand"><span>W</span><strong>{ar ? "وصلة" : "WASLA"}</strong></Link>
    <nav className="wasla-workspace-nav" aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
      <Link href={accountHref} aria-current={inAccountSpace ? "page" : undefined}>{isPending ? "..." : session?.user ? (inAccountSpace ? (ar ? "الرئيسية" : "Home") : (ar ? "حسابي" : "My account")) : (ar ? "تسجيل الدخول" : "Sign in")}</Link>
      <Link href="/shops">{ar ? "المتاجر" : "Shops"}</Link>
      <Link href="/business">{ar ? "الأعمال" : "Business"}</Link>
      <Link href={messagesHref} aria-label={ar ? (pathname === "/messages" ? "الرئيسية" : "الرسائل") : (pathname === "/messages" ? "Home" : "Messages")} aria-current={pathname === "/messages" ? "page" : undefined}>{pathname === "/messages" ? "⌂" : "✉"} <span>{pathname === "/messages" ? (ar ? "الرئيسية" : "Home") : (ar ? "الرسائل" : "Messages")}</span></Link>
      <Link href="/account#notifications" aria-label={ar ? "الإشعارات" : "Notifications"}>♧ <span>{ar ? "الإشعارات" : "Notifications"}</span></Link>
      <Link href="/brands">{ar ? "العلامات والشعارات" : "Brands & logos"}</Link>
    </nav>
    <div className="wasla-workspace-actions">
      <button type="button" className="wasla-workspace-language" onClick={() => setLocale(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button>
      <Link href={pathname === "/profile" ? "/" : (session?.user ? "/profile" : "/login")} className="wasla-workspace-user" aria-label={ar ? "الملف الشخصي" : "Profile"}>
        <span className="wasla-workspace-avatar">{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer"/> : (name.trim().charAt(0) || "W")}</span>
        <span className="wasla-workspace-name">{name}</span>
      </Link>
    </div>
  </header>;
}
