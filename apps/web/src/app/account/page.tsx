"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type Profile = { userId: string; displayName: string; avatarReference: string | null; email: string };
type Store = { id: string; name: string; slug: string; status: string };
type Account = { id: string; display_name: string; legal_name: string; role: string };

const words = {
 ar: {
  brand:"وصلة", eyebrow:"مساحة حسابك", title:"مرحباً بعودتك", subtitle:"هذه هي نقطة انطلاقك لإدارة هويتك وعوالمك على وصلة.",
  profile:"ملفك الشخصي", edit:"تعديل الملف الشخصي", email:"البريد الإلكتروني", member:"عضو وصلة",
  messages:"الرسائل", notifications:"الإشعارات", unavailable:"قريباً", messagesInfo:"ستظهر هنا محادثاتك مع المتاجر والشركات عند إطلاق نظام الرسائل.",
  notificationsInfo:"ستظهر هنا تنبيهات الحساب والطلبات والأنشطة عند تفعيل الإشعارات.",
  worlds:"عوالمك", shops:"متاجري", business:"حسابات الأعمال", open:"فتح", storesCount:"متجر", accountsCount:"حساب أعمال",
  loading:"جارٍ تحميل بيانات الحساب...", error:"تعذر تحميل بعض بيانات الحساب. يمكنك المحاولة مجدداً.",
  retry:"إعادة المحاولة", publicHome:"بوابة وصلة", signOut:"تسجيل الخروج", signingOut:"جارٍ تسجيل الخروج...",
  noStores:"لا توجد متاجر مرتبطة بحسابك حتى الآن.", noAccounts:"لا توجد حسابات أعمال ظاهرة لهذا الحساب.",
  accountType:"نوع العضوية", accountId:"معرّف الحساب"
 },
 en: {
  brand:"WASLA", eyebrow:"YOUR ACCOUNT SPACE", title:"Welcome back", subtitle:"Your starting point to manage your identity and worlds across WASLA.",
  profile:"Your profile", edit:"Edit profile", email:"Email address", member:"WASLA member",
  messages:"Messages", notifications:"Notifications", unavailable:"Coming soon", messagesInfo:"Your conversations with shops and businesses will appear here when messaging launches.",
  notificationsInfo:"Account, order and activity alerts will appear here when notifications are enabled.",
  worlds:"Your worlds", shops:"My shops", business:"Business accounts", open:"Open", storesCount:"shops", accountsCount:"business accounts",
  loading:"Loading your account...", error:"Some account information could not be loaded. You can try again.",
  retry:"Try again", publicHome:"WASLA gateway", signOut:"Sign out", signingOut:"Signing out...",
  noStores:"No shops are linked to your account yet.", noAccounts:"No business accounts are available for this account.",
  accountType:"Membership type", accountId:"Account ID"
 }
};

export default function AccountHomePage() {
 const { locale } = useLocale();
 const [profile,setProfile]=useState<Profile|null>(null);
 const [stores,setStores]=useState<Store[]>([]);
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [signingOut,setSigningOut]=useState(false);
 const {data:session,isPending}=authClient.useSession();
 const t=words[locale], dir=locale==="ar"?"rtl":"ltr";

 async function load() {
  setLoading(true); setError("");
  try {
   const [p,s,a]=await Promise.all([
    fetch("/api/profile",{credentials:"include",cache:"no-store"}),
    fetch("/api/stores",{credentials:"include",cache:"no-store"}),
    fetch("/api/accounts",{credentials:"include",cache:"no-store"})
   ]);
   const [pd,sd,ad]=await Promise.all([p.json(),s.json(),a.json()]);
   if(p.ok && pd.success && pd.profile) setProfile(pd.profile as Profile);
   else if(p.status===401) throw new Error("unauthorized");
   if(s.ok && sd.success && Array.isArray(sd.stores)) setStores(sd.stores);
   if(a.ok && ad.success && Array.isArray(ad.accounts)) setAccounts(ad.accounts);
  } catch {
   setError(t.error);
  } finally { setLoading(false); }
 }

 useEffect(()=>{ if(!isPending && session?.user) void load(); },[isPending,session?.user?.id]);

 async function logout() {
  setSigningOut(true);
  try { await authClient.signOut(); window.location.assign("/login"); }
  catch { setSigningOut(false); setError(t.error); }
 }

 const name=profile?.displayName || session?.user?.name || t.member;
 const email=profile?.email || session?.user?.email || "";
 const avatar=profile?.avatarReference || session?.user?.image || "";
 const initial=name.trim().charAt(0).toUpperCase() || "W";

 return <main className="account-home" lang={locale} dir={dir}>
  <WorkspaceHeader section="account" />
  <header className="account-topbar" style={{ display: "none" }}>
   <Link href="/" className="account-brand"><span>W</span><strong>{t.brand}</strong></Link>
   <div className="account-top-actions">
    
    <Link href="/">{t.publicHome}</Link>
   </div>
  </header>
  <div className="account-shell">
   <section className="account-welcome">
    <div><span className="account-eyebrow">{t.eyebrow}</span><h1>{t.title}</h1><p>{t.subtitle}</p></div>
    <div className="account-welcome-mark">W</div>
   </section>
   {error && <div className="account-error" role="alert">{error}<button onClick={()=>void load()}>{t.retry}</button></div>}
   <section className="account-profile-card">
    <div className="account-avatar">{avatar?<img src={avatar} alt="" referrerPolicy="no-referrer"/>:<span>{initial}</span>}</div>
    <div className="account-profile-info"><span className="account-eyebrow">{t.profile}</span><h2>{name}</h2><p dir="ltr">{email}</p></div>
    <Link className="account-edit" href="/profile">{t.edit}<span>↗</span></Link>
   </section>
   <section className="account-notice-grid">
    <article id="messages" className="account-notice-card"><div className="account-notice-icon">✉</div><div><span className="account-eyebrow">01 / {t.messages}</span><h2>{t.messages}</h2><p>{t.messagesInfo}</p></div><b>{t.unavailable}</b></article>
    <article id="notifications" className="account-notice-card"><div className="account-notice-icon">♧</div><div><span className="account-eyebrow">02 / {t.notifications}</span><h2>{t.notifications}</h2><p>{t.notificationsInfo}</p></div><b>{t.unavailable}</b></article>
   </section>
   <section className="account-worlds">
    <div className="account-section-heading"><div><span className="account-eyebrow">WASLA ID</span><h2>{t.worlds}</h2></div><span className="account-live-dot">●</span></div>
    <div className="account-world-grid">
     <Link href="/shops" className="account-world-card"><span className="account-world-symbol">✳</span><div><h3>{t.shops}</h3><p>{loading?t.loading:stores.length===0?t.noStores:stores.length+" "+t.storesCount}</p></div><strong>{t.open} ↗</strong></Link>
     <Link href="/business" className="account-world-card"><span className="account-world-symbol">B</span><div><h3>{t.business}</h3><p>{loading?t.loading:accounts.length===0?t.noAccounts:accounts.length+" "+t.accountsCount}</p></div><strong>{t.open} ↗</strong></Link>
    </div>
    {loading && <p className="account-loading">{t.loading}</p>}
   </section>
   <footer className="account-footer"><span>WASLA · ONE IDENTITY. GLOBAL OPPORTUNITIES.</span><button type="button" onClick={logout} disabled={signingOut}>{signingOut?t.signingOut:t.signOut}</button></footer>
  </div>
 </main>;
}
