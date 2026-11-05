"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "./locale-provider";
import { authClient } from "@/lib/auth-client";

type Profile = { displayName?: string; avatarReference?: string | null; email?: string };
export default function WorkspaceHeader({ section = "account" }: { section?: "account" | "shops" | "business" }) {
  const { locale, setLocale } = useLocale();
  const [profile, setProfile] = useState<Profile | null>(null);
  const { data: session, isPending } = authClient.useSession();
  const ar = locale === "ar";
  useEffect(() => {
    if (!session?.user) { setProfile(null); return; }
    let active = true;
    fetch("/api/profile", { credentials: "include", cache: "no-store" })
      .then(async r => r.ok ? r.json() : null)
      .then(data => { if (active && data?.success && data.profile) setProfile(data.profile as Profile); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [session?.user?.id]);
  const name = profile?.displayName || (ar ? "حسابي" : "My account");
  const avatar = profile?.avatarReference || "";
  return <header className="wasla-workspace-header" data-section={section} dir={ar ? "rtl" : "ltr"}>
    <Link href="/" className="wasla-workspace-brand"><span>W</span><strong>{ar ? "وصلة" : "WASLA"}</strong></Link>
    <nav className="wasla-workspace-nav" aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
      <Link href={session?.user ? "/account" : "/login"}>{isPending ? (ar ? "..." : "...") : session?.user ? (ar ? "حسابي" : "My account") : (ar ? "تسجيل الدخول" : "Sign in")}</Link>
      <Link href="/shops">{ar ? "المتاجر" : "Shops"}</Link>
      <Link href="/business">{ar ? "الأعمال" : "Business"}</Link>
      <Link href="/account#messages" aria-label={ar ? "الرسائل" : "Messages"}>✉ <span>{ar ? "الرسائل" : "Messages"}</span></Link>
      <Link href="/account#notifications" aria-label={ar ? "الإشعارات" : "Notifications"}>♧ <span>{ar ? "الإشعارات" : "Notifications"}</span></Link>
    </nav>
    <div className="wasla-workspace-actions">
      <button type="button" className="wasla-workspace-language" onClick={() => setLocale(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button>
      <Link href={session?.user ? "/profile" : "/login"} className="wasla-workspace-user" aria-label={ar ? "الملف الشخصي" : "Profile"}>
        <span className="wasla-workspace-avatar">{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer"/> : (name.trim().charAt(0) || "W")}</span>
        <span className="wasla-workspace-name">{name}</span>
      </Link>
    </div>
  </header>;
}