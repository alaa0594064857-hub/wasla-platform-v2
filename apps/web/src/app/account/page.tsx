"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type Profile = { userId: string; displayName: string; avatarReference: string | null; email: string };
type Store = { id: string; name: string; slug: string; status: string };
type Account = { id: string; account_type: string; display_name: string; legal_name: string; role: string };

const words = {
 ar: {
  brand:"وصلة", eyebrow:"مساحة حسابك", title:"مرحباً بعودتك", subtitle:"هذه هي نقطة انطلاقك لإدارة هويتك وعوالمك على وصلة.",
  profile:"ملفك الشخصي", edit:"تعديل الملف الشخصي", email:"البريد الإلكتروني", member:"عضو وصلة",
  messages:"الرسائل", notifications:"الإشعارات", messagesInfo:"ستظهر هنا محادثاتك مع المتاجر والشركات عند إطلاق نظام الرسائل.",
  notificationsInfo:"ستظهر هنا تنبيهات الحساب والطلبات والأنشطة عند تفعيل الإشعارات.",
  worlds:"مساحات نشاطك", shops:"متاجري", business:"حسابات الأعمال", network:"شبكتي", open:"فتح", storesCount:"متجر", accountsCount:"حساب أعمال",
  loading:"جارٍ تحميل بيانات الحساب...", error:"تعذر تحميل بعض بيانات الحساب. يمكنك المحاولة مجدداً.",
  retry:"إعادة المحاولة", publicHome:"بوابة وصلة", signOut:"تسجيل الخروج", signingOut:"جارٍ تسجيل الخروج...",
  noStores:"لا توجد متاجر مرتبطة بحسابك حتى الآن.", noAccounts:"لا توجد حسابات أعمال ظاهرة لهذا الحساب.",
  workspaceBoth:"اختر النشاط الذي تريد إدارته.", workspaceStores:"هذه متاجرك. اختر المتجر الذي تريد إدارته.", workspaceBusiness:"هذه حسابات أعمالك. اختر الحساب الذي تريد إدارته.",
  workspaceStart:"ابدأ باستكشاف المنتجات أو أنشئ حساب أعمال لإطلاق نشاطك.", explore:"استكشاف المنتجات", createBusiness:"إنشاء حساب أعمال",
  storeType:"متجر", businessType:"حساب أعمال", networkInfo:"الأصدقاء والشركات التي تتابعها",
  company:"شركة", supplier:"مورد", manufacturer:"مصنع", trader:"تاجر", brand:"علامة تجارية", active:"نشط", inactive:"غير نشط"
 },
 en: {
  brand:"WASLA", eyebrow:"YOUR ACCOUNT SPACE", title:"Welcome back", subtitle:"Your starting point to manage your identity and worlds across WASLA.",
  profile:"Your profile", edit:"Edit profile", email:"Email address", member:"WASLA member",
  messages:"Messages", notifications:"Notifications", messagesInfo:"Your conversations with shops and businesses will appear here when messaging launches.",
  notificationsInfo:"Account, order and activity alerts will appear here when notifications are enabled.",
  worlds:"Your activity spaces", shops:"My shops", business:"Business accounts", network:"My network", open:"Open", storesCount:"shops", accountsCount:"business accounts",
  loading:"Loading your account...", error:"Some account information could not be loaded. You can try again.",
  retry:"Try again", publicHome:"WASLA gateway", signOut:"Sign out", signingOut:"Signing out...",
  noStores:"No shops are linked to your account yet.", noAccounts:"No business accounts are available for this account.",
  workspaceBoth:"Choose the activity you want to manage.", workspaceStores:"These are your shops. Choose one to manage.", workspaceBusiness:"These are your business accounts. Choose one to manage.",
  workspaceStart:"Explore products or create a business account to launch your activity.", explore:"Explore products", createBusiness:"Create a business account",
  storeType:"Shop", businessType:"Business account", networkInfo:"Friends and businesses you follow",
  company:"Company", supplier:"Supplier", manufacturer:"Manufacturer", trader:"Trader", brand:"Brand", active:"Active", inactive:"Inactive"
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
 const hasStores=stores.length>0, hasAccounts=accounts.length>0;
 const workspaceSubtitle=hasStores && hasAccounts ? t.workspaceBoth : hasStores ? t.workspaceStores : hasAccounts ? t.workspaceBusiness : t.workspaceStart;
 const accountTypeLabel=(type:string)=>({
  company:t.company, supplier:t.supplier, manufacturer:t.manufacturer, trader:t.trader, brand:t.brand
 } as Record<string,string>)[type] || t.businessType;

 return <main className="account-home" lang={locale} dir={dir}>
  <WorkspaceHeader section="account" />
  <header className="account-topbar" style={{ display: "none" }}>
   <Link href="/" className="account-brand"><span>W</span><strong>{t.brand}</strong></Link>
   <div className="account-top-actions"><Link href="/">{t.publicHome}</Link></div>
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
   <section className="account-worlds">
    <div className="account-section-heading"><div><span className="account-eyebrow">WASLA WORKSPACE</span><h2>{t.worlds}</h2><p>{loading?t.loading:workspaceSubtitle}</p></div><span className="account-live-dot">●</span></div>
    {loading ? <p className="account-loading">{t.loading}</p> : (
     <div className="account-world-grid">
      {stores.map(store=><Link href={`/shops/${store.slug}`} key={store.id} className="account-world-card">
       <span className="account-world-symbol">✳</span><div><h3>{store.name}</h3><p>{t.storeType} · {store.status==="active"?t.active:t.inactive}</p></div><strong>{t.open} ↗</strong>
      </Link>)}
      {accounts.map(account=><Link href="/business" key={account.id} className="account-world-card">
       <span className="account-world-symbol">B</span><div><h3>{account.display_name}</h3><p>{accountTypeLabel(account.account_type)}</p></div><strong>{t.open} ↗</strong>
      </Link>)}
      {!hasStores && !hasAccounts && <>
       <Link href="/search" className="account-world-card"><span className="account-world-symbol">⌕</span><div><h3>{t.explore}</h3><p>{t.workspaceStart}</p></div><strong>{t.open} ↗</strong></Link>
       <Link href="/business/create" className="account-world-card"><span className="account-world-symbol">B</span><div><h3>{t.createBusiness}</h3><p>{t.businessType}</p></div><strong>{t.open} ↗</strong></Link>
      </>}
     </div>
    )}
   </section>
   <section className="account-notice-grid">
    <Link href="/messages" id="messages" className="account-notice-card"><div className="account-notice-icon">✉</div><div><span className="account-eyebrow">01 / {t.messages}</span><h2>{t.messages}</h2><p>{t.messagesInfo}</p></div><b>{locale==="ar"?"فتح الرسائل ↗":"Open messages ↗"}</b></Link>
    <Link href="/notifications" id="notifications" className="account-notice-card"><div className="account-notice-icon">♧</div><div><span className="account-eyebrow">02 / {t.notifications}</span><h2>{t.notifications}</h2><p>{t.notificationsInfo}</p></div><b>{locale==="ar"?"فتح الإشعارات ↗":"Open notifications ↗"}</b></Link>
   </section>
   <section className="account-worlds">
    <div className="account-section-heading"><div><span className="account-eyebrow">WASLA ID</span><h2>{t.network}</h2></div><span className="account-live-dot">●</span></div>
    <div className="account-world-grid">
     <Link href="/network" className="account-world-card"><span className="account-world-symbol">◎</span><div><h3>{t.network}</h3><p>{t.networkInfo}</p></div><strong>{t.open} ↗</strong></Link>
    </div>
   </section>
   <footer className="account-footer"><span>{locale==="ar"?"وصلة · هوية واحدة وفرص عالمية":"WASLA · ONE IDENTITY. GLOBAL OPPORTUNITIES."}</span><button type="button" onClick={logout} disabled={signingOut}>{signingOut?t.signingOut:t.signOut}</button></footer>
  </div>
 </main>;
}
