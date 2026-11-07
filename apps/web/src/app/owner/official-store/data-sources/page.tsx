"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../../../components/locale-provider";

type Source = {
  id: string; name: string; provider: string; source_category: string;
  access_method: string; permission_status: string; permission_evidence_url: string | null;
  terms_url: string | null; documentation_url: string | null; data_types: string[];
  markets: string[]; refresh_interval_hours: number | null; last_verified_at: string | null;
  notes: string | null; created_at: string;
};
const blank = { name:"", provider:"", sourceCategory:"marketplace_demand", accessMethod:"owner_research", permissionEvidenceUrl:"", termsUrl:"", documentationUrl:"", dataTypes:"demand_signals,price,availability", markets:"US,GB,DE", refreshIntervalHours:"", notes:"" };
export default function OfficialStoreDataSourcesPage() {
  const { locale } = useLocale(); const ar = locale === "ar"; const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [form,setForm] = useState(blank); const [sources,setSources] = useState<Source[]>([]);
  const [busy,setBusy] = useState(false); const [error,setError] = useState(""); const [message,setMessage] = useState("");
  const t = ar ? {
    title:"سجل مصادر البيانات المصرح بها", sub:"سجل المصادر التي يمكن أن تغذي اكتشاف فرص المنتجات. كل مصدر يبدأ قيد المراجعة ولا يُسمح بجمع آلي قبل إثبات الإذن واعتماده.",
    name:"اسم المصدر",provider:"الجهة / المزود",category:"تصنيف المصدر",method:"طريقة الوصول",evidence:"رابط إثبات الإذن HTTPS",terms:"شروط الاستخدام HTTPS",docs:"توثيق API أو المصدر HTTPS",types:"أنواع البيانات (افصل بفاصلة)",markets:"الأسواق (رموز الدول ISO)",interval:"فترة التحديث بالساعات",notes:"ملاحظات",save:"حفظ المصدر للمراجعة",saving:"جارٍ الحفظ...",list:"المصادر المسجلة",status:"الحالة",approve:"اعتماد بعد التحقق",pause:"إيقاف",pending:"قيد المراجعة",approved:"معتمد",paused:"متوقف",rejected:"مرفوض",error:"تعذر حفظ المصدر. تحقق من الحقول وروابط HTTPS.",saved:"تم حفظ المصدر للمراجعة، ولم يُعتمد للجمع الآلي.",back:"العودة إلى فرص المنتجات"
  } : {
    title:"Authorized data source registry",sub:"Register sources that may support product opportunity discovery. Every source starts pending review; automated collection is not allowed before permission evidence is reviewed and approved.",
    name:"Source name",provider:"Provider / organization",category:"Source category",method:"Access method",evidence:"Permission evidence HTTPS URL",terms:"Terms of use HTTPS URL",docs:"API/source documentation HTTPS URL",types:"Data types (comma-separated)",markets:"Markets (ISO country codes)",interval:"Refresh interval in hours",notes:"Notes",save:"Save source for review",saving:"Saving...",list:"Registered sources",status:"Status",approve:"Approve after verification",pause:"Pause",pending:"Pending review",approved:"Approved",paused:"Paused",rejected:"Rejected",error:"Could not save source. Check fields and HTTPS links.",saved:"Source saved for review; it is not approved for automated collection.",back:"Back to product opportunities"
  };
  useEffect(()=>{ if(!session?.user) return; let active=true; fetch("/api/platform/official-store/data-sources",{credentials:"include",cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok||!d.success)throw new Error("load");return d.sources as Source[];}).then(x=>{if(active)setSources(x);}).catch(()=>{if(active)setError(t.error);});return()=>{active=false;};},[session?.user?.id]);
  if(isPending) return <main className="p-6">Loading…</main>;
  if(!session?.user){router.replace("/login");return null;}
  const set=(key:keyof typeof blank,value:string)=>setForm(x=>({...x,[key]:value}));
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");setMessage("");try{
    const payload={...form,dataTypes:form.dataTypes.split(",").map(x=>x.trim()).filter(Boolean),markets:form.markets.split(",").map(x=>x.trim().toUpperCase()).filter(Boolean),refreshIntervalHours:form.refreshIntervalHours||null};
    const r=await fetch("/api/platform/official-store/data-sources",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const d=await r.json();if(!r.ok||!d.success)throw new Error("save");setSources(x=>[d.source,...x]);setMessage(t.saved);setForm(blank);
  }catch{setError(t.error);}finally{setBusy(false);}}
  async function changeStatus(source:Source,status:string){const evidence=source.permission_evidence_url||window.prompt(ar?"أدخل رابط إثبات الإذن HTTPS قبل الاعتماد":"Enter HTTPS permission evidence before approval")||"";if(status==="approved"&&!evidence)return;try{const r=await fetch("/api/platform/official-store/data-sources/"+source.id,{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({permissionStatus:status,permissionEvidenceUrl:evidence})});const d=await r.json();if(!r.ok||!d.success)throw new Error("update");setSources(items=>items.map(x=>x.id===source.id?{...x,...d.source}:x));}catch{setError(t.error);}}
  const statusLabel=(s:string)=>s==="approved"?t.approved:s==="paused"?t.paused:s==="rejected"?t.rejected:t.pending;
  const input=(key:keyof typeof blank,label:string,placeholder="",type="text")=><label className="grid gap-1 text-sm font-medium">{label}<input required={["name","provider","sourceCategory"].includes(key)} type={type} value={form[key]} onChange={e=>set(key,e.target.value)} placeholder={placeholder} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"/></label>;
  return <main dir={ar?"rtl":"ltr"} className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{t.title}</h1><p className="mt-2 text-sm text-slate-600">{t.sub}</p></div><Link className="rounded-lg border px-3 py-2 text-sm" href="/owner/official-store/opportunities">{t.back}</Link></header>
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border bg-white p-4 md:grid-cols-2 md:p-6">
      {input("name",t.name)}{input("provider",t.provider)}{input("sourceCategory",t.category,"marketplace_demand")}
      <label className="grid gap-1 text-sm font-medium">{t.method}<select value={form.accessMethod} onChange={e=>set("accessMethod",e.target.value)} className="rounded-lg border px-3 py-2 text-slate-900"><option value="owner_research">Owner research / بحث المالك</option><option value="official_api">Official API / API رسمي</option><option value="licensed_feed">Licensed feed / تغذية مرخصة</option><option value="merchant_feed">Merchant feed / تغذية تاجر</option><option value="manual_import">Manual import / استيراد يدوي</option></select></label>
      {input("permissionEvidenceUrl",t.evidence,"https://...","url")}{input("termsUrl",t.terms,"https://...","url")}{input("documentationUrl",t.docs,"https://...","url")}
      {input("dataTypes",t.types)}{input("markets",t.markets)}{input("refreshIntervalHours",t.interval,"","number")}
      <label className="grid gap-1 text-sm font-medium md:col-span-2">{t.notes}<textarea value={form.notes} onChange={e=>set("notes",e.target.value)} className="min-h-20 rounded-lg border px-3 py-2 text-slate-900"/></label>
      {error&&<p role="alert" className="text-sm text-red-700 md:col-span-2">{error}</p>}{message&&<p role="status" className="text-sm text-emerald-700 md:col-span-2">{message}</p>}
      <button disabled={busy} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50 md:col-span-2">{busy?t.saving:t.save}</button>
    </form>
    <section className="space-y-3 rounded-2xl border p-4 md:p-6"><h2 className="text-lg font-bold">{t.list}</h2>
      {sources.length===0?<p className="text-sm text-slate-500">{ar?"لا توجد مصادر مسجلة بعد.":"No sources registered yet."}</p>:sources.map(s=><article key={s.id} className="space-y-2 rounded-xl border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{s.name}</strong><span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{statusLabel(s.permission_status)}</span></div>
        <p className="text-sm text-slate-600">{s.provider} · {s.access_method} · {s.source_category}</p>
        <p className="text-xs text-slate-500">{(s.data_types||[]).join(", ")} · {(s.markets||[]).join(", ")}</p>
        <div className="flex flex-wrap gap-2 text-xs">{s.documentation_url&&<a className="underline" href={s.documentation_url} target="_blank" rel="noreferrer">Docs</a>}{s.terms_url&&<a className="underline" href={s.terms_url} target="_blank" rel="noreferrer">Terms</a>}{s.permission_evidence_url&&<a className="underline" href={s.permission_evidence_url} target="_blank" rel="noreferrer">Permission evidence</a>}</div>
        {s.permission_status!=="approved"&&<div className="flex gap-2"><button type="button" onClick={()=>changeStatus(s,"approved")} className="rounded-lg border px-3 py-2 text-xs">{t.approve}</button>{s.permission_status!=="paused"&&<button type="button" onClick={()=>changeStatus(s,"paused")} className="rounded-lg border px-3 py-2 text-xs">{t.pause}</button>}</div>}
      </article>)}
    </section>
  </main>;
}
