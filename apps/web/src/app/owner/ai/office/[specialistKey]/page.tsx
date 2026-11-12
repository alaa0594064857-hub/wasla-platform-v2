"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale } from "../../../../../components/locale-provider";
import { GroundedResearchResult } from "../../../../../components/grounded-research-result";

type Task={id:string;specialistKey:string;title:string;status:string;resultText?:string|null;errorCode?:string|null;createdAt:string};
const names:Record<string,{ar:string;en:string;aboutAr:string;aboutEn:string}>={
 market_researcher:{ar:"باحث الأسواق",en:"Market researcher",aboutAr:"أبحاث السوق والطلب والفرص التجارية.",aboutEn:"Market demand and commercial opportunity research."},
 product_analyst:{ar:"محلل المنتجات",en:"Product analyst",aboutAr:"تحليل المنتجات والمواصفات والمتغيرات.",aboutEn:"Product identity, specifications and variants."},
 supplier_researcher:{ar:"باحث الموردين",en:"Supplier researcher",aboutAr:"مقارنة أدلة الموردين والعروض ومخاطر التوريد.",aboutEn:"Supplier evidence, offers and sourcing risks."},
 catalogue_manager:{ar:"مدير الكتالوج",en:"Catalogue manager",aboutAr:"تنظيم بيانات المنتجات وتجهيز المسودات.",aboutEn:"Product data organization and draft preparation."},
 sales_support:{ar:"المبيعات وخدمة العملاء",en:"Sales & customer care",aboutAr:"توصيات المبيعات ومسودات خدمة العملاء.",aboutEn:"Sales recommendations and customer-care drafts."},
 logistics_analyst:{ar:"الطلبات والشحن",en:"Orders & logistics",aboutAr:"تحليل الشحن والتنفيذ والطلبات.",aboutEn:"Shipping, fulfilment and order analysis."},
 translator:{ar:"أخصائي الترجمة",en:"Translation specialist",aboutAr:"الترجمة التجارية الدقيقة بين العربية والإنجليزية.",aboutEn:"Accurate Arabic-English commercial translation."},
 financial_analyst:{ar:"المحلل المالي",en:"Financial analyst",aboutAr:"التكاليف والرسوم والهوامش والربحية.",aboutEn:"Costs, fees, margins and profitability."},
 quality_risk_reviewer:{ar:"الجودة والمخاطر",en:"Quality & risk reviewer",aboutAr:"مراجعة الجودة والأدلة والامتثال والمخاطر.",aboutEn:"Quality, evidence, compliance and risk review."}
};
const statusNames:Record<string,{ar:string;en:string}>={queued:{ar:"في الانتظار",en:"Queued"},running:{ar:"قيد التنفيذ",en:"Running"},needs_owner_review:{ar:"بانتظار مراجعة المدير",en:"Awaiting manager review"},completed:{ar:"مكتملة",en:"Completed"},failed:{ar:"فشلت",en:"Failed"},cancelled:{ar:"ملغاة",en:"Cancelled"}};
export default function SpecialistOfficePage(){
 const {locale}=useLocale(); const ar=locale==="ar"; const params=useParams<{specialistKey:string}>(); const key=params.specialistKey;
 const [tasks,setTasks]=useState<Task[]>([]); const [error,setError]=useState(""); const [loading,setLoading]=useState(true);
 const [taskTitle,setTaskTitle]=useState(""); const [taskInput,setTaskInput]=useState(""); const [submitting,setSubmitting]=useState(false); const [feedback,setFeedback]=useState("");
 const loadTasks=async()=>{const r=await fetch("/api/platform/ai/tasks?limit=50",{credentials:"include",cache:"no-store"});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"tasks");setTasks((d.tasks as Task[]).filter(t=>t.specialistKey===key));};
 useEffect(()=>{let active=true;fetch("/api/platform/ai/tasks?limit=50",{credentials:"include",cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"tasks");return d.tasks as Task[]}).then(rows=>{if(active)setTasks(rows.filter(t=>t.specialistKey===key))}).catch(e=>{if(active)setError(e instanceof Error?e.message:"Unable to load office")}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[key]);
 const submitTask=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!person||!taskTitle.trim()||!taskInput.trim())return;setSubmitting(true);setFeedback("");try{
   const created=await fetch("/api/platform/ai/tasks",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({specialistKey:key,title:taskTitle.trim(),inputText:taskInput.trim(),inputContext:{origin:"specialist_office",scope:"owner_advisory"}})});
   const createdData=await created.json();if(!created.ok||!createdData.success||!createdData.task?.id)throw new Error(createdData.error||"Could not create task");
   const executed=await fetch("/api/platform/ai/tasks/"+createdData.task.id+"/execute",{method:"POST",credentials:"include"});
   const executionData=await executed.json();if(!executed.ok||!executionData.success)throw new Error(executionData.error||"The specialist could not execute this task");
   setFeedback(ar?"اكتملت المهمة وأضيفت نتيجتها إلى سجل المكتب للمراجعة.":"Task completed; its result was added to this office log for review.");
   setTaskTitle("");setTaskInput("");await loadTasks();
  }catch(e){setFeedback(e instanceof Error?e.message:"Task execution failed");try{await loadTasks()}catch{}}
  finally{setSubmitting(false);}
 };
 const person=names[key]; const counts=useMemo(()=>({all:tasks.length,done:tasks.filter(t=>t.resultText).length,waiting:tasks.filter(t=>t.status==="queued"||t.status==="running").length}),[tasks]);
 if(!person)return <main className="p-6"><p>{ar?"هذا المكتب غير معروف.":"Unknown office."}</p><Link href="/owner/ai/headquarters">{ar?"العودة للمقر":"Back to headquarters"}</Link></main>;
 return <main dir={ar?"rtl":"ltr"} lang={locale} className="min-h-screen bg-[#f5f2e9] px-4 py-6 text-slate-900 sm:px-7"><div className="mx-auto max-w-4xl space-y-5">
 <Link href="/owner/ai/headquarters" className="text-sm font-semibold text-amber-800 hover:underline">← {ar?"العودة إلى المقر الرئيسي":"Back to headquarters"}</Link>
 <header className="rounded-3xl bg-[#101d35] p-6 text-white sm:p-8"><p className="text-xs font-bold tracking-[.2em] text-[#d9b76e]">WASLA · DEPARTMENT OFFICE</p><h1 className="mt-3 text-2xl font-bold sm:text-3xl">{ar?person.ar:person.en}</h1><p className="mt-2 text-sm leading-7 text-slate-300">{ar?person.aboutAr:person.aboutEn}</p><div className="mt-5 flex gap-5 text-sm"><span>{counts.all} {ar?"مهام":"tasks"}</span><span>{counts.done} {ar?"نتائج":"results"}</span><span>{counts.waiting} {ar?"معلقة":"pending"}</span></div></header>
 <section className="rounded-2xl border border-[#e3d6b8] bg-white p-5">
  <h2 className="text-lg font-bold">{ar?"تكليف هذا الموظف بمهمة":"Assign this specialist a task"}</h2>
  <p className="mt-1 text-sm leading-6 text-slate-500">{ar?"اكتب المطلوب والمعلومات المتاحة. سينفذ الموظف تحليلاً استشارياً، وتبقى النتيجة بانتظار مراجعتك.":"Describe the task and provide available information. The specialist will produce advisory analysis for your review."}</p>
  <form onSubmit={submitTask} className="mt-4 space-y-3">
   <input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} required maxLength={180} placeholder={ar?"عنوان المهمة":"Task title"} className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-amber-500"/>
   <textarea value={taskInput} onChange={e=>setTaskInput(e.target.value)} required maxLength={5000} rows={5} placeholder={ar?"اكتب تفاصيل المهمة والبيانات التي تريد تحليلها...":"Describe the task and provide the information to analyze..."} className="w-full rounded-xl border border-slate-300 p-3 text-sm leading-6 outline-none focus:border-amber-500"/>
   <button type="submit" disabled={submitting||!taskTitle.trim()||!taskInput.trim()} className="rounded-xl bg-[#101d35] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{submitting?(ar?"جارٍ تنفيذ المهمة...":"Executing task..."):(ar?"إسناد وتنفيذ المهمة":"Assign and execute task")}</button>
  </form>
  {feedback?<p role="status" className="mt-3 rounded-xl bg-[#fbf8f0] p-3 text-sm leading-6">{feedback}</p>:null}
  <p className="mt-3 text-xs leading-5 text-slate-500">{ar?"حدود التنفيذ: يعتمد هذا المكتب على البيانات التي تقدمها، ولا يتصفح الويب أو يرسل رسائل أو ينشر منتجات أو ينفذ مدفوعات.":"Execution boundary: this office uses the information you provide; it does not browse the web, send messages, publish products or make payments."}</p>
 </section>
 <section className="space-y-3"><h2 className="text-lg font-bold">{ar?"سجل أعمال المكتب":"Office work log"}</h2>{loading?<p className="rounded-xl bg-white p-5 text-sm text-slate-500">{ar?"جارٍ تحميل السجل...":"Loading work log..."}</p>:error?<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">{error}</p>:!tasks.length?<p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">{ar?"لا توجد مهام مسجلة لهذا المكتب حتى الآن. يتلقى الموظف مهامه من المدير العام.":"No tasks recorded for this office yet. The specialist receives work from the General Manager."}</p>:tasks.map(task=><article key={task.id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-bold">{task.title}</h3><span className="rounded-full bg-[#f4efe2] px-3 py-1 text-xs">{statusNames[task.status]?.[ar?"ar":"en"]||task.status}</span></div><p className="text-xs text-slate-400">{new Date(task.createdAt).toLocaleString(locale)}</p>{task.resultText?<div className="rounded-xl bg-slate-50 p-4"><GroundedResearchResult value={task.resultText}/></div>:null}{task.errorCode?<p className="text-xs text-rose-700">{ar?"رمز الخطأ: ":"Error: "}{task.errorCode}</p>:null}</article>)}</section>
 </div></main>
}
