"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useLocale } from "./locale-provider";
import { authClient } from "@/lib/auth-client";

type Profile = { displayName?: string; avatarReference?: string | null; email?: string };

export default function WorkspaceHeader({ section = "account" }: { section?: "account" | "shops" | "business" | "network" }) {
  const { locale, setLocale } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const { data: session, isPending } = authClient.useSession();
  const ar = locale === "ar";
  const inAccountSpace = pathname === "/account" || pathname === "/profile";
  // Signed-in users stay inside their WASLA workspace; the public gateway is for visitors.
  const accountHref = session?.user ? (isPlatformOwner ? "/owner" : "/account") : "/";
  const messagesHref = pathname === "/messages" ? "/" : "/messages";

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!session?.user) { setUnreadNotifications(0); return; }
    let active = true;
    const refreshUnread = () => {
      fetch("/api/notifications", { credentials: "include", cache: "no-store" })
        .then(async response => response.ok ? response.json() : null)
        .then(data => { if (active) setUnreadNotifications(Number(data?.success ? data.unreadCount ?? 0 : 0)); })
        .catch(() => { if (active) setUnreadNotifications(0); });
    };
    refreshUnread();
    window.addEventListener("wasla:notifications-updated", refreshUnread);
    return () => {
      active = false;
      window.removeEventListener("wasla:notifications-updated", refreshUnread);
    };
  }, [session?.user?.id, pathname]);

  useEffect(() => {
    if (!session?.user) { setUnreadMessages(0); return; }
    let active = true;
    const refreshUnreadMessages = () => {
      fetch("/api/messages", { credentials: "include", cache: "no-store" })
        .then(async response => response.ok ? response.json() : null)
        .then(data => { if (active) setUnreadMessages(Number(data?.success ? data.unreadCount ?? 0 : 0)); })
        .catch(() => { if (active) setUnreadMessages(0); });
    };
    refreshUnreadMessages();
    window.addEventListener("wasla:messages-updated", refreshUnreadMessages);
    return () => {
      active = false;
      window.removeEventListener("wasla:messages-updated", refreshUnreadMessages);
    };
  }, [session?.user?.id, pathname]);

  useEffect(() => {
    if (!session?.user) { setProfile(null); setIsPlatformOwner(false); return; }
    let active = true;
    fetch("/api/platform/security", { credentials: "include", cache: "no-store" })
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (active) setIsPlatformOwner(Boolean(data?.success && data.platformAccess?.roles?.includes("platform_owner"))); })
      .catch(() => { if (active) setIsPlatformOwner(false); });
    return () => { active = false; };
  }, [session?.user?.id]);

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
  const items = [
    { href: "/", label: ar ? "الرئيسية واكتشاف العوالم" : "Home & discover worlds", icon: "⌂" },
    { href: "/account", label: ar ? "حسابي وهويتي" : "My account & identity", icon: "◉" },
    { href: "/profile", label: ar ? "ملفي الشخصي" : "My profile", icon: "◎" },
    { href: "/shops", label: ar ? "متاجري" : "My shops", icon: "✳" },
    { href: "/business", label: ar ? "شركتي وحسابات الأعمال" : "My company & business", icon: "▦" },
    { href: "/trade", label: ar ? "التجارة والصفقات" : "Trade deals", icon: "⇄" },
    { href: "/network", label: ar ? "شبكتي وأصدقائي" : "My network & friends", icon: "♧" },
    { href: "/messages", label: ar ? "الرسائل" : "Messages", icon: "✉" },
    { href: "/inquiries", label: ar ? "استفسارات المنتجات" : "Product inquiries", icon: "▤" },
    { href: "/notifications", label: ar ? "الإشعارات" : "Notifications", icon: "♢" },
    { href: "/brands", label: ar ? "العلامات والشعارات" : "Brands & logos", icon: "✧" },
    { href: "/settings", label: ar ? "الإعدادات والخصوصية" : "Settings & privacy", icon: "⚙" },
  ];

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchText.trim();
    if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  async function logout() {
    setSigningOut(true);
    try { await authClient.signOut(); window.location.assign("/login"); }
    catch { setSigningOut(false); }
  }

  return <>
    <header className="wasla-workspace-header" data-section={section} dir={ar ? "rtl" : "ltr"}>
      <button type="button" className="wasla-menu-trigger" aria-label={ar ? "فتح القائمة" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>
        <span></span><span></span><span></span>
      </button>
      <Link href="/" className="wasla-workspace-brand"><span>W</span><strong>{ar ? "وصلة" : "WASLA"}</strong></Link>
      <nav className="wasla-workspace-nav" aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
        <Link href={accountHref} aria-current={inAccountSpace ? "page" : undefined}>{isPending ? "..." : session?.user ? (ar ? "مساحة عملي" : "My workspace") : (ar ? "الرئيسية" : "Home")}</Link>
        <Link href="/shops">{ar ? "المتاجر" : "Shops"}</Link>
        <Link href="/business">{ar ? "الأعمال" : "Business"}</Link>
        <Link href="/trade" aria-current={pathname === "/trade" ? "page" : undefined}>{ar ? "الصفقات" : "Trade"}</Link>
        <Link href="/network" aria-current={pathname === "/network" ? "page" : undefined}>{ar ? "شبكتي" : "My network"}</Link>
        <Link href={messagesHref} style={{ position: "relative" }}>
          {pathname === "/messages" ? (ar ? "الرئيسية" : "Home") : (ar ? "الرسائل" : "Messages")}
          {pathname !== "/messages" && unreadMessages > 0 && <small style={{ marginInlineStart: 6, borderRadius: 99, padding: "1px 6px", background: "#c6a15b", color: "#14243a", fontSize: 10, fontWeight: 800 }}>{unreadMessages > 99 ? "99+" : unreadMessages}</small>}
        </Link>
        <Link href="/inquiries" aria-current={pathname === "/inquiries" ? "page" : undefined}>{ar ? "الاستفسارات" : "Inquiries"}</Link>
      </nav>
      <div className="wasla-workspace-actions">
        <Link href="/notifications" aria-label={ar ? `الإشعارات، ${unreadNotifications} غير مقروء` : `Notifications, ${unreadNotifications} unread`} title={ar ? "الإشعارات" : "Notifications"} style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 10, color: "inherit", textDecoration: "none" }}>
          <span aria-hidden="true" style={{ fontSize: 22 }}>♢</span>
          {unreadNotifications > 0 && <span style={{ position: "absolute", top: 0, insetInlineEnd: 0, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 99, background: "#c6a15b", color: "#14243a", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center" }}>{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}
        </Link>
        <button type="button" className="wasla-search-trigger" aria-label={ar ? "فتح البحث" : "Open search"} aria-expanded={searchOpen} title={ar ? "البحث الشامل" : "Universal search"} onClick={() => setSearchOpen(value => !value)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
        </button>
        <button type="button" className="wasla-workspace-language" onClick={() => setLocale(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button>
        <Link href={pathname === "/profile" ? "/" : (session?.user ? "/profile" : "/login")} className="wasla-workspace-user" aria-label={ar ? "الملف الشخصي" : "Profile"}>
          <span className="wasla-workspace-avatar">{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer"/> : (name.trim().charAt(0) || "W")}</span>
          <span className="wasla-workspace-name">{name}</span>
        </Link>
      </div>
    </header>
    {searchOpen && <form className="wasla-global-search" role="search" onSubmit={submitSearch} dir={ar ? "rtl" : "ltr"}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
      <input autoFocus type="search" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder={ar ? "ابحث عن منتجات أو متاجر أو شركات أو أشخاص..." : "Search products, stores, businesses or people..."} aria-label={ar ? "البحث الشامل" : "Universal search"} />
      <button type="submit" disabled={!searchText.trim()}>{ar ? "بحث" : "Search"}</button>
    </form>}
    {menuOpen && <button className="wasla-menu-backdrop" aria-label={ar ? "إغلاق القائمة" : "Close menu"} onClick={() => setMenuOpen(false)} />}
    <aside className={`wasla-drawer ${menuOpen ? "is-open" : ""}`} dir={ar ? "rtl" : "ltr"} aria-hidden={!menuOpen}>
      <div className="wasla-drawer-head">
        <div className="wasla-drawer-identity">
          <span className="wasla-workspace-avatar">{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer"/> : (name.trim().charAt(0) || "W")}</span>
          <div><strong>{name}</strong><small>{session?.user?.email || (ar ? "هوية وصلة الموحدة" : "WASLA unified identity")}</small></div>
        </div>
        <button type="button" onClick={() => setMenuOpen(false)} aria-label={ar ? "إغلاق" : "Close"}>×</button>
      </div>
      <div className="wasla-drawer-label">{ar ? "مساحتك في وصلة" : "YOUR WASLA SPACE"}</div>
      <nav className="wasla-drawer-links">
        {items.map(item => <Link href={item.href} key={item.href} aria-current={pathname === item.href ? "page" : undefined}><span>{item.icon}</span>{item.label}{item.href === "/notifications" && unreadNotifications > 0 && <small style={{ marginInlineStart: "auto", borderRadius: 99, padding: "2px 7px", background: "#c6a15b", color: "#14243a", fontWeight: 800 }}>{unreadNotifications > 99 ? "99+" : unreadNotifications}</small>}{item.href === "/messages" && unreadMessages > 0 && <small style={{ marginInlineStart: "auto", borderRadius: 99, padding: "2px 7px", background: "#c6a15b", color: "#14243a", fontWeight: 800 }}>{unreadMessages > 99 ? "99+" : unreadMessages}</small>}<b>↗</b></Link>)}
        {isPlatformOwner && <Link href="/owner" aria-current={pathname === "/owner" ? "page" : undefined}><span>◆</span>{ar ? "لوحة مالك المنصة" : "Platform owner console"}<b>↗</b></Link>}
      </nav>
      <div className="wasla-drawer-bottom">
        <button type="button" className="wasla-drawer-language" onClick={() => setLocale(ar ? "en" : "ar")}>{ar ? "🌐 التبديل إلى الإنجليزية" : "🌐 Switch to Arabic"}</button>
        {session?.user ? <button type="button" className="wasla-drawer-logout" disabled={signingOut} onClick={logout}>{signingOut ? (ar ? "جارٍ الخروج..." : "Signing out...") : (ar ? "تسجيل الخروج" : "Sign out")} <span>↗</span></button> : <Link className="wasla-drawer-logout" href="/login">{ar ? "تسجيل الدخول" : "Sign in"} <span>↗</span></Link>}
      </div>
    </aside>
  </>;
}
