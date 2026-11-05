"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Locale = "ar" | "en";
type Store = { id: string; name: string; slug: string; status: string; account_name: string; business_description: string | null; website: string | null; country_code: string | null };
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const labels = {
  ar: { title:"إدارة المتجر", subtitle:"هذه مساحة إدارة متجرك المرتبط بحسابك التجاري.", home:"الرئيسية", shops:"متاجري", name:"اسم المتجر", save:"حفظ التغييرات", saving:"جارٍ الحفظ...", account:"الحساب التجاري", address:"معرّف المتجر", loading:"جارٍ تحميل بيانات المتجر...", error:"تعذر تحميل المتجر أو لا تملك صلاحية الوصول.", saved:"تم حفظ التغييرات.", back:"العودة إلى المتاجر", status:"حالة المتجر", active:"نشط" },
  en: { title:"Shop management", subtitle:"Manage your shop connected to your business account.", home:"Home", shops:"My shops", name:"Shop name", save:"Save changes", saving:"Saving...", account:"Business account", address:"Shop identifier", loading:"Loading shop details...", error:"Could not load this shop or you do not have access.", saved:"Changes saved.", back:"Back to shops", status:"Shop status", active:"Active" },
};
async function api<T>(slug:string, options?:RequestInit):Promise<T>{
 const response=await fetch(`${API_BASE}/api/stores/${encodeURIComponent(slug)}`,{...options,credentials:"include",headers:{"Content-Type":"application/json",...options?.headers}});
 const data=await response.json(); if(!response.ok||data.success!==true) throw new Error(data.error||"Request failed"); return data as T;
}
export default function ShopManagementPage(){
 const params=useParams<{slug:string}>(); const slug=params.slug;
 const [locale,setLocale]=useState<Locale>("ar"); const [store,setStore]=useState<Store|null>(null);
 const [name,setName]=useState(""); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [error,setError]=useState(""); const [message,setMessage]=useState("");
 const t=labels[locale]; const dir=locale==="ar"?"rtl":"ltr";
 const load=useCallback(async()=>{setLoading(true);setError("");try{const result=await api<{store:Store}>(slug);setStore(result.store);setName(result.store.name);}catch{setError(t.error);}finally{setLoading(false);}},[slug,t.error]);
 useEffect(()=>{void load();},[load]);
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setError("");setMessage("");try{const result=await api<{store:Store}>(slug,{method:"PATCH",body:JSON.stringify({name:name.trim()})});setStore(result.store);setName(result.store.name);setMessage(t.saved);}catch{setError(t.error);}finally{setSaving(false);}}
 return <main className="shops-page" lang={locale} dir={dir}>
  <header className="shops-header"><Link href="/" className="shops-brand"><span className="shops-mark">W</span><span>WASLA <small>وصلة</small></span></Link><nav><Link href="/">{t.home}</Link><Link href="/shops">{t.shops}</Link></nav><button type="button" className="shops-language" onClick={()=>setLocale(locale==="ar"?"en":"ar")}>{locale==="ar"?"English":"العربية"}</button></header>
  <section className="shops-main">
   <div className="shops-heading"><div><span className="shops-eyebrow">WASLA SHOPS / MANAGEMENT</span><h1>{t.title}</h1><p>{t.subtitle}</p></div><div className="shops-heading-icon">W</div></div>
   {error&&<div className="shops-alert" role="alert">{error}<button type="button" onClick={()=>void load()}>{locale==="ar"?"إعادة المحاولة":"Try again"}</button></div>}
   {message&&<div className="shops-success" role="status">{message}</div>}
   {loading?<div className="shops-empty">{t.loading}</div>:store&&<div className="shops-detail-layout">
    <section className="shops-create-card">
     <span className="shops-eyebrow">01 / SHOP IDENTITY</span><h2>{store.name}</h2>
     <form onSubmit={save}><label>{t.name}<input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={120} required /></label><button type="submit" disabled={saving||name.trim().length<2}>{saving?t.saving:t.save}<span>↗</span></button></form>
    </section>
    <aside className="shops-create-card shops-info-card">
     <span className="shops-eyebrow">02 / DETAILS</span><h2>{t.status}</h2>
     <div className="shops-info-row"><small>{t.status}</small><strong className="shops-info-status">{store.status==="active"?t.active:store.status}</strong></div>
     <div className="shops-info-row"><small>{t.account}</small><strong>{store.account_name}</strong></div>
     <div className="shops-info-row"><small>{t.address}</small><strong dir="ltr">/shops/{store.slug}</strong></div>
     {store.website&&<div className="shops-info-row"><small>Website</small><strong dir="ltr">{store.website}</strong></div>}
    </aside>
   </div>}
   <p className="shops-back"><Link href="/shops">← {t.back}</Link></p>
   <footer className="shops-footer">WASLA · A global platform for commerce and business</footer>
  </section>
 </main>;
}
