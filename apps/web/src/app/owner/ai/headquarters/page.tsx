"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "../../../../components/locale-provider";
import "./headquarters.css";

type Task = { id: string; specialistKey: string; title: string; status: string; resultText?: string | null; errorCode?: string | null; createdAt: string };
type AssistantStatus = { configured: boolean; managerEnabled: boolean };

const team = [
  ["market_researcher", "باحث الأسواق", "Market Research", "يرصد الأسواق والطلب والفرص", "Studies markets, demand and opportunities", "◉"],
  ["product_analyst", "محلل المنتجات", "Product Analysis", "يحلل المواصفات والمنتجات", "Analyzes products and specifications", "◇"],
  ["supplier_researcher", "باحث الموردين", "Supplier Research", "يقارن أدلة الموردين والعروض", "Compares supplier evidence and offers", "⌂"],
  ["catalogue_manager", "مدير الكتالوج", "Catalogue Management", "يجهز بيانات المنتجات والكتالوج", "Prepares product data and catalogue", "▣"],
  ["sales_support", "المبيعات وخدمة العملاء", "Sales & Customer Care", "يدعم المبيعات وتجربة العملاء", "Supports sales and customer experience", "✧"],
  ["logistics_analyst", "الطلبات والشحن", "Orders & Logistics", "يراجع الشحن والتنفيذ والطلبات", "Reviews shipping and fulfilment", "⇄"],
  ["translator", "أخصائي الترجمة", "Translation", "يحافظ على دقة العربية والإنجليزية", "Maintains Arabic and English accuracy", "文"],
  ["financial_analyst", "المحلل المالي", "Finance", "يحسب التكلفة والربحية", "Calculates costs and profitability", "＄"],
  ["quality_risk_reviewer", "الجودة والمخاطر", "Quality & Risk", "يراجع الجودة والمخاطر والامتثال", "Reviews quality, risk and compliance", "✓"],
] as const;

export default function AiHeadquartersPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [tasksResponse, statusResponse] = await Promise.all([
        fetch("/api/platform/ai/tasks?limit=50", { credentials: "include", cache: "no-store" }),
        fetch("/api/platform/ai/assistant", { credentials: "include", cache: "no-store" }),
      ]);
      const [tasksData, statusData] = await Promise.all([tasksResponse.json(), statusResponse.json()]);
      if (!tasksResponse.ok || !tasksData.success) throw new Error(tasksData.error || "Unable to load tasks");
      if (!statusResponse.ok || !statusData.success) throw new Error(statusData.error || "Unable to load AI status");
      setTasks(Array.isArray(tasksData.tasks) ? tasksData.tasks : []);
      setStatus(statusData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load AI headquarters");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => ({
    total: tasks.length,
    active: tasks.filter(task => task.status === "queued" || task.status === "running").length,
    review: tasks.filter(task => task.status === "needs_owner_review").length,
    failed: tasks.filter(task => task.status === "failed").length,
    providerLimited: tasks.some(task => task.errorCode === "PROVIDER_RATE_LIMIT"),
  }), [tasks]);

  const copy = ar ? {
    eyebrow: "WASLA · AI OPERATIONS",
    title: "غرفة عمليات الذكاء الاصطناعي",
    subtitle: "مركز قيادة واحد لمتابعة المدير العام والأقسام والمهام والتقارير.",
    owner: "العودة إلى غرفة المالك",
    refresh: "تحديث البيانات",
    loading: "جارٍ تحميل بيانات التشغيل...",
    total: "إجمالي المهام المعروضة",
    active: "قيد التنفيذ أو الانتظار",
    review: "بانتظار مراجعتك",
    failed: "مهام متعثرة",
    status: "حالة النظام",
    engine: "إعداد محرك الذكاء",
    manager: "حالة المدير العام",
    configured: "إعداد المزود موجود",
    missing: "إعداد المزود غير مكتمل",
    enabled: "مفعّل إدارياً",
    paused: "متوقف إدارياً",
    limitation: "ضوابط التشغيل",
    limitationText: "تعرض هذه الغرفة الأعمال المحفوظة فعلياً وحالة مراجعة المالك. المهام المنتظرة ليست إنجازات مكتملة، ولا يُسمح بالنشر أو تنفيذ الإجراءات الخارجية قبل توثيق الأدلة واعتماد المالك.",
    workspaces: "غرف الإدارة",
    workspacesText: "كل وظيفة في غرفة مستقلة، بنفس أسلوب البطاقات المستخدم في مركز المالك.",
    managerTitle: "مكتب المدير العام",
    managerDesc: "وجّه الأهداف وتابع توزيع المهام وخطة الفريق.",
    reportsTitle: "مركز التقارير",
    reportsDesc: "راجع نتائج التشغيل والإنجازات والمهام التي تحتاج متابعة.",
    meetingTitle: "قاعة الاجتماعات",
    meetingDesc: "راجع ملخص الاجتماع وخطة العمل والتحديات.",
    departments: "الأقسام والمكاتب المتخصصة",
    departmentsText: "تسعة مكاتب متخصصة، ولكل مكتب مساحة مستقلة لمراجعة مهامه.",
    open: "فتح المكتب",
    recorded: "مهمة مسجلة",
    noData: "لا توجد بيانات مهام معروضة حالياً.",
    error: "تعذر تحميل بيانات غرفة الذكاء الاصطناعي.",
    quotaTitle: "توقف التنفيذ بسبب حصة مزود الذكاء الاصطناعي",
    quotaText: "المهام محفوظة، لكن Gemini رفض التنفيذ بسبب استنفاد الحصة (429). لن نعرض المهام كإنجازات حتى ينتج عنها عمل محفوظ فعلياً.",
    footer: "حدود الصلاحيات: لا ينشر النظام المنتجات ولا يتواصل مع الموردين ولا ينفذ المدفوعات تلقائياً. هذه الإجراءات تبقى خاضعة للمراجعة والاعتماد.",
  } : {
    eyebrow: "WASLA · AI OPERATIONS",
    title: "AI Operations Headquarters",
    subtitle: "One command center for the general manager, departments, tasks and reports.",
    owner: "Back to Owner Office",
    refresh: "Refresh data",
    loading: "Loading operational data...",
    total: "Tasks displayed",
    active: "Queued or in progress",
    review: "Awaiting your review",
    failed: "Needs attention",
    status: "System status",
    engine: "AI engine setup",
    manager: "General manager",
    configured: "Provider configured",
    missing: "Provider setup incomplete",
    enabled: "Administratively enabled",
    paused: "Administratively paused",
    limitation: "Operating principles",
    limitationText: "This headquarters shows saved platform work and owner-review status. Queued items are not completed work. External actions and publication remain blocked until evidence and owner approval are recorded.",
    workspaces: "Management rooms",
    workspacesText: "Every function has its own room, using the same card-based approach as the Owner Center.",
    managerTitle: "General Manager Office",
    managerDesc: "Set objectives and follow task allocation and team plans.",
    reportsTitle: "Reports Center",
    reportsDesc: "Review operating results, completed work and items needing attention.",
    meetingTitle: "Meeting Room",
    meetingDesc: "Review meeting summaries, plans and team challenges.",
    departments: "Specialist departments",
    departmentsText: "Nine specialist offices, each with its own workspace for reviewing assigned tasks.",
    open: "Open office",
    recorded: "recorded tasks",
    noData: "No task data is currently available.",
    error: "Unable to load AI headquarters data.",
    quotaTitle: "Execution paused by AI provider quota",
    quotaText: "Tasks are safely retained, but Gemini rejected execution because the quota was exhausted (429). No task will be shown as completed without a saved result.",
    footer: "Permission boundary: the system does not publish products, contact suppliers or execute payments automatically. These actions remain subject to review and approval.",
  };

  return (
    <main dir={ar ? "rtl" : "ltr"} lang={locale} className="wasla-ai-headquarters">
      <div className="wasla-ai-shell">
        <header className="wasla-ai-header">
          <div>
            <p className="text-[10px] font-extrabold tracking-[.18em] text-[#9b783d]">WASLA / AI OPERATIONS</p>
            <h1 className="mt-1 text-xl font-extrabold sm:text-2xl">{copy.title}</h1>
            <p className="mt-1 text-xs text-slate-500">{ar ? "لوحة الأقسام والإدارة والمهام" : "Departments, management and task dashboard"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-[#e5e0d5] px-4 py-2.5 text-xs font-bold hover:border-[#b18d4d] disabled:opacity-50">{loading ? copy.loading : copy.refresh} ↻</button>
            <Link href="/owner" className="rounded-xl bg-[#14243a] px-4 py-2.5 text-xs font-bold text-white no-underline hover:bg-[#29425f]">{copy.owner} ↗</Link>
          </div>
        </header>

        <section aria-labelledby="ai-general-manager" className="wasla-ai-manager">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4 sm:gap-5">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-[#dfc58f]/50 bg-[#dfc58f]/15 text-4xl text-[#dfc58f] sm:h-20 sm:w-20">♛</div>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold tracking-[.2em] text-[#dfc58f]">WASLA · EXECUTIVE AI</p>
                <h2 id="ai-general-manager" className="mt-1 text-xl font-extrabold sm:text-3xl">{copy.managerTitle}</h2>
                <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-200 sm:text-sm">{copy.managerDesc}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                  <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">{status ? (status.configured ? copy.configured : copy.missing) : "—"}</span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">{status ? (status.managerEnabled ? copy.enabled : copy.paused) : "—"}</span>
                </div>
              </div>
            </div>
            <Link href="/owner/ai/chat" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl border border-[#dfc58f] bg-[#dfc58f] px-6 py-3 text-sm font-extrabold text-[#14243a] no-underline transition hover:bg-[#f0dcae]">{ar ? "الدخول إلى مكتب المدير" : "Enter Manager Office"} ↗</Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2 border-t border-white/15 pt-5 sm:grid-cols-4">
            {[
              { label: copy.total, value: stats.total },
              { label: copy.active, value: stats.active },
              { label: copy.review, value: stats.review },
              { label: copy.failed, value: stats.failed },
            ].map(item => (
              <div key={item.label} className="wasla-ai-stat">
                <span className="block text-[11px] leading-5 text-slate-300">{item.label}</span>
                <strong className="mt-1 block text-2xl font-extrabold tabular-nums text-[#dfc58f]">{loading ? "…" : item.value}</strong>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/owner/ai/reports" className="rounded-lg border border-white/20 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-white/10">{copy.reportsTitle} ↗</Link>
            <Link href="/owner/ai/meeting" className="rounded-lg border border-white/20 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-white/10">{copy.meetingTitle} ↗</Link>
          </div>
        </section>

        <section className="wasla-ai-departments" aria-labelledby="ai-team-heading">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><p className="text-[10px] font-extrabold tracking-[.18em] text-[#9b783d]">AI TEAM · REPORTING TO GENERAL MANAGER</p><h2 id="ai-team-heading" className="mt-1 text-lg font-extrabold">{copy.departments}</h2><p className="mt-1 text-xs text-slate-500">{copy.departmentsText}</p></div>
            <span className="rounded-full border border-[#e5e0d5] bg-white px-3 py-1.5 text-xs font-bold text-[#9b783d]">{ar ? "9 موظفين متخصصين" : "9 specialist employees"}</span>
          </div>
          <div className="wasla-ai-team-grid">
            {team.map(([key, arName, enName, arDesc, enDesc, icon], index) => {
              const count = tasks.filter(task => task.specialistKey === key).length;
              return <Link key={key} href={"/owner/ai/office/" + key} className="wasla-ai-team-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f4efe2] text-xl text-[#9b783d]">{icon}</span>
                  <span className="rounded-full bg-[#f7f4ed] px-2.5 py-1 text-[10px] font-bold text-slate-500">{ar ? "موظف" : "SPECIALIST"} {index + 1}</span>
                </div>
                <h3 className="mt-3 text-sm font-extrabold leading-6">{ar ? arName : enName}</h3>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">{ar ? arDesc : enDesc}</p>
                <div className="mt-auto flex items-center justify-between border-t border-[#f0ede6] pt-3">
                  <span className="text-[11px] font-semibold text-[#9b783d]">{copy.open} ↗</span>
                  <span className="text-[11px] text-slate-500">{loading ? "…" : count} {copy.recorded}</span>
                </div>
              </Link>;
            })}
          </div>
        </section>

        {stats.providerLimited ? <section role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><div className="flex items-start gap-3"><span className="text-xl">!</span><div><h2 className="text-sm font-extrabold">{copy.quotaTitle}</h2><p className="mt-1 text-xs leading-6">{copy.quotaText}</p></div></div></section> : null}

        <section className="wasla-ai-status">
          <div className="wasla-ai-info-card">
            <div className="flex items-center gap-2"><span className="text-lg text-[#9b783d]">◈</span><h2 className="text-sm font-extrabold">{copy.status}</h2></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[#f7f4ed] p-3"><span className="text-[11px] text-slate-500">{copy.engine}</span><strong className="mt-1 block text-xs">{status ? (status.configured ? copy.configured : copy.missing) : "—"}</strong></div>
              <div className="rounded-xl bg-[#f7f4ed] p-3"><span className="text-[11px] text-slate-500">{copy.manager}</span><strong className="mt-1 block text-xs">{status ? (status.managerEnabled ? copy.enabled : copy.paused) : "—"}</strong></div>
            </div>
          </div>
          <div className="rounded-2xl border border-[#e5e0d5] bg-white p-4 shadow-sm">
            <h2 className="text-sm font-extrabold">{copy.limitation}</h2>
            <p className="mt-2 text-xs leading-6 text-slate-600">{copy.limitationText}</p>
          </div>
        </section>
        {error ? <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-800"><strong>{copy.error}</strong><p className="mt-1 break-words text-xs">{error}</p><button onClick={() => void load()} className="mt-3 rounded-lg border border-rose-200 px-3 py-2 font-semibold">{copy.refresh}</button></section> : null}
      </div>
    </main>
  );
}