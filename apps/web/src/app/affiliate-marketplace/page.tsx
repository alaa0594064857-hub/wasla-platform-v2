"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";

type Program = { id: string; name: string; description: string | null; commissionBps: number; merchantStoreName: string; merchantStoreSlug: string; eligibleProductCount: number };
type Store = { id: string; name: string; slug: string; status: string };

export default function AffiliateMarketplacePage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [programs,setPrograms]=useState<Program[]>([]);
  const [stores,setStores]=useState<Store[]>([]);
  const [selectedStore,setSelectedStore]=useState("");
  const [messages,setMessages]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{
    const controller=new AbortController();
    Promise.all([
      fetch("/api/public/affiliate-programs",{cache:"no-store",signal:controller.signal}).then(r=>r.json()),
      fetch("/api/stores",{credentials:"include",cache:"no-store",signal:controller.signal}).then(r=>r.ok?r.json():null).catch(()=>null)
    ]).then(([p,s])=>{
      if(!p?.success||!Array.isArray(p.programs))throw new Error("programs");
      setPrograms(p.programs);
      if(s?.success&&Array.isArray(s.stores)){
        const active=s.stores.filter((x:Store)=>x.status==="active");
        setStores(active);
        setSelectedStore(active[0]?.slug??"");
      }
    }).catch(cause=>{
      if(cause instanceof Error&&cause.name!=="AbortError")setError(ar?"تعذر تحميل برامج العمولة حالياً.":"Affiliate programs could not be loaded.");
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[ar]);

  async function apply(program:Program){
    if(!selectedStore){setMessages(v=>({...v,[program.id]:ar?"تحتاج إلى متجر نشط للتقديم.":"You need an active store to apply."}));return;}
    setBusy(program.id);
    try{
      const response=await fetch("/api/affiliate-programs/"+program.id+"/applications",{
        method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({affiliateStoreSlug:selectedStore})
      });
      const data=await response.json();
      if(!response.ok||!data.success)throw new Error(data.error||"apply");
      setMessages(v=>({...v,[program.id]:ar?"تم إرسال طلب الانضمام إلى صاحب المتجر.":"Application sent to the merchant for approval."}));
    }catch(cause){
      setMessages(v=>({...v,[program.id]:cause instanceof Error?cause.message:(ar?"تعذر إرسال الطلب.":"Could not submit application.")}));
    }finally{setBusy("");}
  }

  return <main className="min-h-screen bg-[#f7f4ec] px-4 py-9 text-[#14233b]" dir={ar?"rtl":"ltr"}>
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#a47e37]">WASLA · وصلة</p><h1 className="mt-2 text-3xl font-extrabold">{ar?"سوق فرص التسويق بالعمولة":"Affiliate opportunity marketplace"}</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{ar?"اكتشف برامج المتاجر، وقدّم بمتجرك للترويج لمنتجات مختارة مقابل عمولة يحددها التاجر. لا يتم قبولك إلا بعد موافقته.":"Discover store programs and apply with your own store to promote selected products for a merchant-defined commission. You join only after the merchant approves."}</p></div>
        <Link href="/business/store-preview" className="rounded-xl border border-[#d8c69f] bg-white px-4 py-2 text-sm font-bold">{ar?"متاجري":"My stores"}</Link>
      </header>
      <section className="rounded-2xl border border-[#d8c69f] bg-[#fffaf0] p-4 text-sm leading-7">{ar?"الموافقة مطلوبة من صاحب كل برنامج. العمولات المسجلة تقديرية ومعلّقة، ولا تحتفظ وصلة بأموال المبيعات أو تتيح السحب في هذه المرحلة.":"Each program requires merchant approval. Recorded commissions are estimates in pending status; WASLA does not hold sales funds or offer withdrawals in this phase."}</section>
      {stores.length>0&&<section className="rounded-2xl border border-[#e5dfd1] bg-white p-4">
        <label className="block text-sm font-bold">{ar?"اختر متجرك الذي سيقوم بالتسويق":"Choose the store that will promote products"}
          <select value={selectedStore} onChange={e=>setSelectedStore(e.target.value)} className="mt-2 w-full rounded-lg border border-[#ddd5c4] bg-white px-3 py-3 font-normal sm:max-w-md">
            {stores.map(store=><option key={store.id} value={store.slug}>{store.name}</option>)}
          </select>
        </label>
      </section>}
      {error&&<p role="alert" className="rounded-xl bg-white p-4 text-sm">{error}</p>}
      {loading?<p className="rounded-xl bg-white p-5">{ar?"جارٍ تحميل الفرص...":"Loading opportunities..."}</p>:programs.length===0?<p className="rounded-xl bg-white p-5">{ar?"لا توجد برامج نشطة متاحة حالياً.":"No active programs are available yet."}</p>:
        <div className="grid gap-4 md:grid-cols-2">
          {programs.map(program=><article key={program.id} className="rounded-2xl border border-[#e5dfd1] bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-[#a47e37]">{ar?"برنامج متجر":"Merchant program"}</p>
            <h2 className="mt-2 text-xl font-extrabold">{program.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{program.merchantStoreName}</p>
            {program.description&&<p className="mt-3 text-sm leading-7 text-slate-600">{program.description}</p>}
            <div className="mt-4 flex flex-wrap gap-3 text-sm"><span className="rounded-full bg-[#f7f4ec] px-3 py-2 font-bold text-[#8a672d]">{(program.commissionBps/100).toFixed(2)}% {ar?"عمولة":"commission"}</span><span className="rounded-full bg-[#f7f4ec] px-3 py-2">{program.eligibleProductCount} {ar?"منتج مؤهل":"eligible products"}</span></div>
            <button disabled={busy===program.id||stores.length===0} onClick={()=>void apply(program)} className="mt-5 rounded-xl bg-[#14233b] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy===program.id?(ar?"جارٍ الإرسال...":"Submitting..."):(ar?"التقديم بمتجري":"Apply with my store")}</button>
            {messages[program.id]&&<p role="status" className="mt-3 rounded-lg bg-[#f7f4ec] p-3 text-xs leading-6">{messages[program.id]}</p>}
          </article>)}
        </div>}
    </div>
  </main>;
}
