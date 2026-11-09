"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import WorkspaceHeader from "@/components/workspace-header";

type Escalation = {
  id: string; returnRequestId: string; orderId: string; orderNumber: string;
  storeId: string; storeName: string; buyerUserId: string; reason: string;
  details: string; status: string; supportNote: string | null; createdAt: string;
};

const navy = "#14243a", gold = "#9b783d", cream = "#f7f4ed", muted = "#738092";

export default function ReturnEscalationsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [items, setItems] = useState<Escalation[]>([]);
  const [notes, setNotes] = useState<Record<string,string>>({});
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState("");
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/platform/store-return-escalations",{credentials:"include",cache:"no-store"});
      const data = await response.json();
      if(!response.ok || !data.success || !Array.isArray(data.escalations)) throw new Error(data.error || "load");
      setItems(data.escalations);
    } catch(e) { setError(e instanceof Error ? e.message : (ar ? "تعذر تحميل طلبات الدعم." : "Could not load support escalations.")); }
    finally { setLoading(false); }
  },[ar]);

  useEffect(()=>{void load();},[load]);

  async function update(item:Escalation,status:"acknowledged"|"closed") {
    const note=(notes[item.id]??"").trim();
    if(note.length<5){setError(ar?"أضف ملاحظة دعم من 5 أحرف على الأقل.":"Enter a support note of at least 5 characters.");return;}
    setBusy(item.id);setError("");setMessage("");
    try{
      const response=await fetch("/api/platform/store-return-escalations/"+item.id,{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,note})});
      const data=await response.json();
      if(!response.ok||!data.success)throw new Error(data.error||"update");
      setMessage(ar?"تم تحديث سجل الدعم.":"Support record updated.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:(ar?"تعذر تحديث السجل.":"Could not update support record."));}
    finally{setBusy("");}
  }

  const date=(value:string)=>new Date(value).toLocaleString(ar?"ar":"en");
  const reason=(value:string)=>({
    legal_rights_claim:ar?"مراجعة حقوق قانونية":"Legal rights review",
    merchant_nonresponse:ar?"عدم رد المتجر":"Merchant nonresponse",
    dispute:ar?"نزاع آخر":"Other dispute",
  }[value]??value);

  return <main dir={ar?"rtl":"ltr"} lang={locale} style={{minHeight:"100vh",background:cream,color:"#263448"}}>
    <WorkspaceHeader/>
    <div style={{width:"min(1180px,calc(100% - 32px))",margin:"0 auto",padding:"30px 0 64px"}}>
      <Link href="/owner" style={{color:gold,fontWeight:700,textDecoration:"none"}}>← {ar?"العودة إلى مساحة المالك":"Back to owner workspace"}</Link>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginTop:20}}>
        <div><p style={{color:gold,fontSize:12,fontWeight:800,letterSpacing:".12em",marginBottom:6}}>WASLA SUPPORT</p>
          <h1 style={{color:navy,margin:0,fontSize:"clamp(26px,4vw,38px)"}}>{ar?"تصعيدات الإرجاع والدعم":"Return support escalations"}</h1>
          <p style={{color:muted,lineHeight:1.8}}>{ar?"مراجعة طلبات الدعم وتوثيق المتابعة. لا تصدر هذه الصفحة حكماً قانونياً أو استرداداً مالياً.":"Review support requests and record follow-up. This workspace does not make legal determinations or issue refunds."}</p>
        </div>
        <button onClick={()=>void load()} style={{border:"1px solid #b18d4d",borderRadius:10,padding:"10px 15px",background:"#fff",color:navy,fontWeight:700}}>{ar?"تحديث":"Refresh"}</button>
      </div>
      {error&&<p role="alert" style={{color:"#a33d3d",marginTop:16}}>{error}</p>}
      {message&&<p role="status" style={{color:"#286343",marginTop:16}}>{message}</p>}
      {loading?<p>{ar?"جارٍ تحميل طلبات الدعم...":"Loading support escalations..."}</p>:
        items.length===0?<section style={{background:"#fff",padding:26,borderRadius:14,border:"1px solid #e3e5e8",marginTop:18}}><h2 style={{color:navy,marginTop:0}}>{ar?"لا توجد تصعيدات مفتوحة":"No open escalations"}</h2><p style={{color:muted}}>{ar?"ستظهر هنا طلبات الدعم الجديدة عند إرسالها.":"New support requests will appear here when submitted."}</p></section>:
        <div style={{display:"grid",gap:14,marginTop:18}}>{items.map(item=><article key={item.id} style={{background:"#fff",padding:20,borderRadius:14,border:"1px solid #e3e5e8"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><strong style={{color:navy}}>{ar?"طلب رقم":"Order"} {item.orderNumber}</strong><span style={{color:gold,fontWeight:700}}>{item.status}</span></div>
          <p style={{margin:"8px 0",color:muted}}>{item.storeName} · {reason(item.reason)} · {date(item.createdAt)}</p>
          <p style={{whiteSpace:"pre-wrap",lineHeight:1.8}}>{item.details}</p>
          <label style={{display:"block",fontWeight:700,fontSize:13,marginTop:12}}>{ar?"ملاحظة الدعم":"Support note"}
            <textarea rows={3} maxLength={2000} value={notes[item.id]??""} onChange={e=>setNotes(v=>({...v,[item.id]:e.target.value}))} style={{display:"block",width:"100%",marginTop:6,border:"1px solid #e3e5e8",borderRadius:10,padding:12,fontWeight:400}}/>
          </label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
            <button disabled={Boolean(busy)} onClick={()=>void update(item,"acknowledged")} style={{background:navy,color:"#fff",padding:"10px 14px",borderRadius:9,fontWeight:700,opacity:busy?0.5:1}}>{ar?"تأكيد الاستلام":"Acknowledge"}</button>
            <button disabled={Boolean(busy)} onClick={()=>void update(item,"closed")} style={{background:"#fff",color:"#8b3434",border:"1px solid #b76b6b",padding:"10px 14px",borderRadius:9,fontWeight:700,opacity:busy?0.5:1}}>{ar?"إغلاق سجل الدعم":"Close support record"}</button>
          </div>
        </article>)}</div>}
    </div>
  </main>;
}
