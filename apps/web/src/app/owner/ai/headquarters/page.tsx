"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "../../../../components/locale-provider";

type Task = { id: string; specialistKey: string; title: string; status: string; resultText?: string | null; createdAt: string };
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

const rooms = [
  { href: "/owner/ai/chat", key: "manager", icon: "♛" },
  { href: "/owner/ai/reports", key: "reports", icon: "▤" },
  { href: "/owner/ai/meeting", key: "meeting", icon: "◷" },
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
    footer: "Permission boundary: the system does not publish products, contact suppliers or execute payments automatically. These actions remain subject to review and approval.",
  };

  const statCards = [
    { label: copy.total, value: stats.total, icon: "▦", tone: "navy" },
    { label: copy.active, value: stats.active, icon: "◷", tone: "blue" },
    { label: copy.review, value: stats.review, icon: "✓", tone: "gold" },
    { label: copy.failed, value: stats.failed, icon: "!", tone: "rose" },
  ];

  return (
    <main dir={ar ? "rtl" : "ltr"} lang={locale} className="min-h-screen bg-[#f7f4ed] px-4 py-5 text-[#14243a] sm:px-7 sm:py-8">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <header className="rounded-3xl bg-[#14243a] p-5 text-white shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] font-extrabold tracking-[.2em] text-[#dfc58f]">{copy.eyebrow}</p>
            <Link href="/owner" className="rounded-xl border border-white/20 px-4 py-2.5 text-xs font-semibold text-white no-underline transition hover:border-[#dfc58f] hover:text-[#dfc58f]">{copy.owner} ↗</Link>
          </div>
          <div className="mt-5 max-w-3xl">
            <h1 className="text-2xl font-extrabold sm:text-4xl">{copy.title}</h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">{copy.subtitle}</p>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statCards.map(card => (
              <div key={card.label} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                <div className="flex items-center justify-between gap-2"><span className="text-xs leading-5 text-slate-300">{card.label}</span><span className="text-lg text-[#dfc58f]">{card.icon}</span></div>
                <strong className="mt-2 block text-3xl font-extrabold tabular-nums">{loading ? "…" : card.value}</strong>
              </div>
            ))}
          </div>
        </header>

        <nav aria-label={ar ? "اختصارات غرفة الذكاء" : "AI room shortcuts"} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {rooms.map(room => {
            const title = room.key === "manager" ? copy.managerTitle : room.key === "reports" ? copy.reportsTitle : copy.meetingTitle;
            const description = room.key === "manager" ? copy.managerDesc : room.key === "reports" ? copy.reportsDesc : copy.meetingDesc;
            return <Link key={"quick-" + room.key} href={room.href} className="flex items-center gap-3 rounded-2xl border border-[#dcd4c4] bg-white p-4 text-inherit no-underline shadow-sm transition hover:border-[#b18d4d] hover:shadow-md">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#14243a] text-xl text-[#dfc58f]">{room.icon}</span>
              <span className="min-w-0"><strong className="block text-sm">{title}</strong><small className="mt-1 block text-xs leading-5 text-slate-500">{description}</small></span>
              <span className="ms-auto text-sm font-bold text-[#9b783d]">↗</span>
            </Link>;
          })}
        </nav>

        {error ? <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-5 text-sm text-rose-800"><strong>{copy.error}</strong><p className="mt-1 break-words text-xs">{error}</p><button onClick={() => void load()} className="mt-3 rounded-lg border border-rose-200 px-3 py-2 font-semibold">{copy.refresh}</button></section> : null}

        <section className="rounded-2xl border border-[#e5e0d5] bg-white p-5 shadow-[0_4px_16px_#17243707] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[10px] font-extrabold tracking-[.18em] text-[#9b783d]">SYSTEM CONTROL</p><h2 className="mt-1 text-xl font-extrabold">{copy.status}</h2></div>
            <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-[#e5e0d5] px-4 py-2.5 text-xs font-bold transition hover:border-[#b18d4d] disabled:opacity-50">{loading ? copy.loading : copy.refresh} ↻</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#e8e2d6] bg-[#fbfaf7] p-4"><span className="text-xs text-slate-500">{copy.engine}</span><strong className="mt-2 block text-sm">{status ? (status.configured ? copy.configured : copy.missing) : "—"}</strong></div>
            <div className="rounded-xl border border-[#e8e2d6] bg-[#fbfaf7] p-4"><span className="text-xs text-slate-500">{copy.manager}</span><strong className="mt-2 block text-sm">{status ? (status.managerEnabled ? copy.enabled : copy.paused) : "—"}</strong></div>
          </div>
          <div className="mt-3 rounded-xl border border-amber-200 bg-[#fbf8f0] p-4">
            <p className="text-xs font-extrabold text-[#805f2e]">{copy.limitation}</p>
            <p className="mt-2 text-sm leading-7 text-slate-700">{copy.limitationText}</p>
          </div>
        </section>

        <section className="space-y-3">
          <div><p className="text-[10px] font-extrabold tracking-[.18em] text-[#9b783d]">MANAGEMENT WORKSPACES</p><h2 className="mt-1 text-xl font-extrabold">{copy.workspaces}</h2><p className="mt-1 text-sm text-slate-600">{copy.workspacesText}</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rooms.map(room => {
              const title = room.key === "manager" ? copy.managerTitle : room.key === "reports" ? copy.reportsTitle : copy.meetingTitle;
              const description = room.key === "manager" ? copy.managerDesc : room.key === "reports" ? copy.reportsDesc : copy.meetingDesc;
              return <Link key={room.key} href={room.href} className="group flex min-h-[178px] flex-col rounded-2xl border border-[#e5e0d5] bg-white p-5 text-inherit no-underline shadow-[0_4px_16px_#17243707] transition hover:-translate-y-0.5 hover:border-[#b18d4d] hover:shadow-md">
                <div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f4efe2] text-xl text-[#9b783d]">{room.icon}</span><span className="text-xs font-bold text-[#9b783d]">{copy.open} ↗</span></div>
                <h3 className="mt-5 text-lg font-extrabold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </Link>;
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div><p className="text-[10px] font-extrabold tracking-[.18em] text-[#9b783d]">SPECIALIST DEPARTMENTS</p><h2 className="mt-1 text-xl font-extrabold">{copy.departments}</h2><p className="mt-1 text-sm text-slate-600">{copy.departmentsText}</p></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {team.map(([key, arName, enName, arDesc, enDesc, icon]) => {
              const count = tasks.filter(task => task.specialistKey === key).length;
              return <Link key={key} href={"/owner/ai/office/" + key} className="group flex min-h-[174px] flex-col rounded-2xl border border-[#e5e0d5] bg-white p-5 text-inherit no-underline shadow-[0_4px_16px_#17243707] transition hover:-translate-y-0.5 hover:border-[#b18d4d] hover:shadow-md">
                <div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f4efe2] text-xl text-[#9b783d]">{icon}</span><span className="text-xs font-bold text-[#9b783d]">{copy.open} ↗</span></div>
                <h3 className="mt-4 font-extrabold">{ar ? arName : enName}</h3><p className="mt-1 flex-1 text-sm leading-6 text-slate-600">{ar ? arDesc : enDesc}</p>
                <div className="mt-4 flex items-center justify-between border-t border-[#f0ede6] pt-3"><span className="text-xs text-slate-500">{copy.recorded}</span><strong className="text-sm tabular-nums text-[#14243a]">{count}</strong></div>
              </Link>;
            })}
          </div>
          {!loading && tasks.length === 0 && !error ? <p className="rounded-xl border border-dashed border-[#d9d2c5] bg-white p-4 text-sm text-slate-500">{copy.noData}</p> : null}
        </section>

        <footer className="rounded-2xl border border-[#e5e0d5] bg-white p-5 text-xs leading-6 text-slate-600">{copy.footer}</footer>
      </div>
    </main>
  );
}
