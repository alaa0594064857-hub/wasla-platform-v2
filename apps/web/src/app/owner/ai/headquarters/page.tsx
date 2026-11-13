"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useLocale } from "../../../../components/locale-provider";

type Task = { id:string; specialistKey:string; title:string; status:string; resultText?:string|null; createdAt:string };
const team = [
  ["market_researcher","باحث الأسواق","Market researcher","يرصد الأسواق والطلب والفرص","Studies markets, demand and opportunities","◉"],
  ["product_analyst","محلل المنتجات","Product analyst","يحلل المواصفات والمنتجات","Analyzes products and specifications","◇"],
  ["supplier_researcher","باحث الموردين","Supplier researcher","يقارن أدلة الموردين والعروض","Compares supplier evidence and offers","⌂"],
  ["catalogue_manager","مدير الكتالوج","Catalogue manager","يجهز بيانات المنتجات والكتالوج","Prepares product data and catalogue","▣"],
  ["sales_support","المبيعات وخدمة العملاء","Sales & customer care","يدعم المبيعات وتجربة العملاء","Supports sales and customer experience","✧"],
  ["logistics_analyst","الطلبات والشحن","Orders & logistics","يراجع الشحن والتنفيذ والطلبات","Reviews shipping and fulfilment","⇄"],
  ["translator","أخصائي الترجمة","Translation specialist","يحافظ على دقة العربية والإنجليزية","Maintains Arabic and English accuracy","文"],
  ["financial_analyst","المحلل المالي","Financial analyst","يحسب التكلفة والربحية","Calculates costs and profitability","＄"],
  ["quality_risk_reviewer","الجودة والمخاطر","Quality & risk","يراجع الجودة والمخاطر والامتثال","Reviews quality, risk and compliance","✓"],
] as const;

export default function AiHeadquartersPage(){
 const {locale}=useLocale(); const ar=locale==="ar";
 const [tasks,setTasks]=useState<Task[]>([]); const [status,setStatus]=useState<{configured:boolean;managerEnabled:boolean}|null>(null);
 const [error,setError]=useState("");
 useEffect(()=>{let active=true;
  Promise.all([
   fetch("/api/platform/ai/tasks?limit=50",{credentials:"include",cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"tasks");return d.tasks as Task[]}),
   fetch("/api/platform/ai/assistant",{credentials:"include",cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"status");return d})
  ]).then(([t,s])=>{if(active){setTasks(t);setStatus(s)}}).catch(e=>{if(active)setError(e instanceof Error?e.message:"Unable to load headquarters")});
  return()=>{active=false};
 },[]);
 const stats=useMemo(()=>({total:tasks.length,waiting:tasks.filter(t=>t.status==="queued"||t.status==="running").length,review:tasks.filter(t=>t.status==="needs_owner_review").length,failed:tasks.filter(t=>t.status==="failed").length}),[tasks]);

 return <main dir={ar?"rtl":"ltr"} lang={locale} className="min-h-screen bg-[#f5f2e9] px-4 py-5 text-slate-900 sm:px-7 sm:py-8">
  <div className="mx-auto max-w-6xl space-y-6">
   <header className="rounded-3xl bg-[#101d35] p-5 text-white shadow-sm sm:p-8">
    <Link href="/owner" className="text-sm text-slate-300 hover:text-white">← {ar?"مركز المالك":"Owner center"}</Link>
    <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
     <div><p className="text-xs font-bold tracking-[.2em] text-[#d9b76e]">WASLA · EXECUTIVE FLOOR</p><h1 className="mt-2 text-2xl font-bold sm:text-4xl">{ar?"المقر الرئيسي — مكتب المدير العام":"Headquarters — General Manager"}</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">{ar?"أنت تتعامل مع المدير العام. هو المسؤول عن تنسيق الفريق وتوزيع العمل ومراجعة النتائج ورفع التقارير إليك.":"You work with the General Manager, who coordinates the team, assigns work, reviews results and reports to you."}</p></div>
     <div className="flex flex-wrap gap-2">
      <span className="rounded-full border border-white/20 px-3 py-2 text-xs">{status?.configured?(ar?"محرك الذكاء متصل":"AI configured"):(ar?"المحرك يحتاج إعداداً":"AI setup required")}</span>
      <span className={"rounded-full px-3 py-2 text-xs "+(status?.managerEnabled?"bg-emerald-400/15 text-emerald-200":"bg-amber-300/15 text-amber-200")}>{status?.managerEnabled?(ar?"المدير نشط":"Manager active"):(ar?"المدير متوقف":"Manager paused")}</span>
     </div>
    </div>
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
     {[[ar?"كل المهام":"All tasks",stats.total],[ar?"قيد العمل":"In progress",stats.waiting],[ar?"بانتظار المراجعة":"For review",stats.review],[ar?"تحتاج معالجة":"Needs attention",stats.failed]].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4"><p className="text-xs text-slate-300">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}
    </div>
   </header>
   {error?<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>:null}
   <section className="rounded-2xl border border-amber-200 bg-[#fbf8f0] p-5 sm:p-6">
    <div className="flex items-start gap-3"><span className="text-xl">⏸</span><div>
     <p className="text-xs font-bold tracking-[.18em] text-amber-800">{ar?"حالة التشغيل":"EXECUTION STATUS"}</p>
     <h2 className="mt-2 text-xl font-bold">{ar?"الجدولة الآلية تعمل، والإنجاز مرتبط بتوفر Gemini":"Automated scheduling is active; completion depends on Gemini availability"}</h2>
     <p className="mt-2 text-sm leading-7 text-slate-700">{ar?"الجدولة تعمل تلقائياً كل 15 دقيقة. عند بلوغ Gemini حد الاستخدام، تُؤجَّل المهام تلقائياً إلى موعد إعادة المحاولة. لا تُحتسب أي مهمة منجزة إلا بعد حفظ نتيجتها.":"The scheduler runs automatically every 15 minutes. When Gemini reaches a usage limit, tasks are deferred until their retry time. A task is counted as complete only after its result is saved."}</p>
     <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><p className="rounded-xl bg-white p-3">{ar?"حالة إعداد المزود: ":"Provider configuration: "}<strong>{status?.configured?(ar?"مفتاح موجود — لا يعني أن الخدمة تعمل":"Key present — not proof of service availability"):(ar?"غير مكتمل":"Not configured")}</strong></p><p className="rounded-xl bg-white p-3">{ar?"حالة المدير: ":"Manager flag: "}<strong>{status?.managerEnabled?(ar?"مفعّل إدارياً — التنفيذ موقوف":"Enabled in settings — execution paused"):(ar?"متوقف":"Paused")}</strong></p></div>
     <p className="mt-3 text-xs leading-6 text-slate-600">{ar?"الفريق مكوّن من تسعة مكاتب متخصصة تعمل بالتعليمات نفسها عبر محرك Gemini واحد. النتائج البحثية والمسودات تبقى للمراجعة، ولا ينشر النظام منتجات أو يتواصل مع الموردين أو ينفذ المدفوعات تلقائياً.":"The team has nine specialist offices using one Gemini model with role-specific instructions. Research and drafts remain subject to review; the system does not publish products, contact suppliers or execute payments autonomously."}</p>
    </div></div>
   </section>
   <section className="grid gap-3 sm:grid-cols-3">
    <Link href="/owner/ai/chat" className="rounded-2xl border border-[#e3d6b8] bg-white p-5 transition hover:border-amber-500"><p className="text-xs font-bold tracking-wider text-amber-700">{ar?"مكتب المدير":"MANAGER OFFICE"}</p><h2 className="mt-2 text-lg font-bold">{ar?"تحدث مع المدير العام":"Talk to the General Manager"}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{ar?"أعطه الهدف، وهو يحدد خطة العمل والمسؤوليات.":"Give the goal; the manager defines the work plan and responsibilities."}</p><span className="mt-4 inline-block text-sm font-semibold text-amber-800">{ar?"فتح المكتب ←":"Open office →"}</span></Link>
    <Link href="/owner/ai/reports" className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-amber-500"><p className="text-xs font-bold tracking-wider text-amber-700">{ar?"التقارير":"REPORTS"}</p><h2 className="mt-2 text-lg font-bold">{ar?"تقارير الأداء":"Performance reports"}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{ar?"ملخص النشاط والإنجازات والمهام المتأخرة.":"Activity, completed work and outstanding tasks."}</p><span className="mt-4 inline-block text-sm font-semibold text-amber-800">{ar?"عرض التقارير ←":"View reports →"}</span></Link>
    <Link href="/owner/ai/meeting" className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-amber-500"><p className="text-xs font-bold tracking-wider text-amber-700">{ar?"قاعة الاجتماعات":"MEETING ROOM"}</p><h2 className="mt-2 text-lg font-bold">{ar?"الاجتماع الأسبوعي":"Weekly team meeting"}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{ar?"مراجعة النتائج والتحديات وخطة التطوير.":"Review results, challenges and improvement plans."}</p><span className="mt-4 inline-block text-sm font-semibold text-amber-800">{ar?"دخول القاعة ←":"Enter meeting room →"}</span></Link>
   </section>
   <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-bold tracking-[.18em] text-amber-700">{ar?"الأقسام والمكاتب":"DEPARTMENTS & OFFICES"}</p><h2 className="mt-1 text-xl font-bold">{ar?"مكاتب الموظفين التسعة":"Nine specialist offices"}</h2><p className="mt-1 text-sm text-slate-600">{ar?"المدير يكلّف الموظف المناسب؛ هذه الغرف للاطلاع على أعمال كل قسم.":"The manager assigns the right specialist; these rooms let you review each department's work."}</p></div></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
     {team.map(([key,arName,enName,arDesc,enDesc,icon])=><Link key={key} href={"/owner/ai/office/"+key} className="group flex aspect-square flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-sm sm:p-5"><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f4efe2] text-xl text-amber-800">{icon}</span><span className="text-xs text-slate-400">{ar?"فتح المكتب":"Open office"} ↗</span></div><h3 className="mt-3 font-bold">{ar?arName:enName}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{ar?arDesc:enDesc}</p><p className="mt-3 text-xs font-semibold text-amber-800">{tasks.filter(t=>t.specialistKey===key).length} {ar?"مهمة مسجلة":"recorded tasks"}</p></Link>)}
    </div>
   </section>
   <footer className="rounded-2xl border border-amber-200 bg-[#fbf8f0] p-4 text-xs leading-6 text-slate-600">{ar?"حدود التشغيل الحالية: الموظفون يستخدمون نموذج الذكاء الاصطناعي نفسه بأدوار متخصصة، والمهام الحالية استشارية وتحتاج مراجعة المالك. لا توجد حتى الآن جدولة تلقائية للتقارير أو اجتماعات دورية منفذة؛ هذه الصفحة هي واجهة المقر ومراجعة النشاط.":"Current operating boundary: specialists use the same AI model with role-specific instructions; task results are advisory and require owner review. Automated report scheduling and recurring meetings are not yet active; this is the headquarters and activity-review interface."}</footer>
  </div>
 </main>
}
