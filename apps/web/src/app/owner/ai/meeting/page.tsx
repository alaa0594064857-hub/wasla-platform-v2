"use client";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../../components/locale-provider";
import { GroundedResearchResult } from "../../../../components/grounded-research-result";

type Task = { id: string; specialistKey: string; title: string; status: string; resultText?: string | null; createdAt: string };

export default function AiMeetingPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch("/api/platform/ai/tasks?limit=50", { credentials: "include", cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || "tasks"); return data.tasks || []; })
      .then(data => { if (active) setTasks(data); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load meeting data"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const recent = useMemo(() => tasks.filter(task => Date.now() - new Date(task.createdAt).getTime() <= 7 * 86400000), [tasks]);
  const done = recent.filter(task => Boolean(task.resultText));
  const open = recent.filter(task => ["queued", "running", "failed", "needs_owner_review"].includes(task.status));
  const agenda = ar
    ? ["مراجعة إنجازات الموظفين ونتائج المهام.", "مناقشة المهام المتأخرة والأخطاء والعقبات.", "مراجعة الأدلة والقرارات التي تحتاج موافقة المالك.", "تبادل الخبرات وتحديد ما يجب تحسينه.", "اعتماد أهداف الأسبوع القادم وتوزيع الأولويات."]
    : ["Review staff achievements and task results.", "Discuss overdue tasks, errors and blockers.", "Review evidence and decisions requiring owner approval.", "Share lessons and identify improvements.", "Set next week's goals and priorities."];
  return <main dir={ar ? "rtl" : "ltr"} lang={locale} className="min-h-screen bg-[#f7f4ed] px-4 py-6 text-[#14243a] sm:px-7">
    <div className="mx-auto max-w-[1440px] space-y-5">
      <header className="rounded-3xl bg-[#14243a] p-6 text-white sm:p-8">
        <p className="text-[10px] font-extrabold tracking-[.2em] text-[#dfc58f]">WASLA · BOARDROOM</p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{ar ? "قاعة الاجتماع الأسبوعي" : "Weekly Team Meeting Room"}</h1>
        <p className="mt-2 text-sm leading-7 text-slate-300">{ar ? "مراجعة أعمال الأسبوع والعقبات والقرارات وفرص تحسين أداء الفريق." : "Review weekly work, blockers, decisions and opportunities to improve team performance."}</p>
      </header>
      {error ? <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-800">{ar ? "تعذر تحميل بيانات الاجتماع: " : "Unable to load meeting data: "}{error}</section> : null}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[#e5e0d5] bg-white p-5 shadow-[0_4px_16px_#17243707]"><p className="text-xs text-slate-500">{ar ? "مهام الأسبوع" : "Weekly tasks"}</p><strong className="mt-2 block text-3xl font-extrabold tabular-nums">{loading ? "…" : recent.length}</strong></div>
        <div className="rounded-2xl border border-[#e5e0d5] bg-white p-5 shadow-[0_4px_16px_#17243707]"><p className="text-xs text-slate-500">{ar ? "نتائج محفوظة" : "Saved results"}</p><strong className="mt-2 block text-3xl font-extrabold tabular-nums">{loading ? "…" : done.length}</strong></div>
      </section>
      <section className="rounded-2xl border border-[#e5e0d5] bg-white p-5 shadow-[0_4px_16px_#17243707] sm:p-6">
        <p className="text-[10px] font-extrabold tracking-[.18em] text-[#9b783d]">AGENDA</p><h2 className="mt-1 text-xl font-extrabold">{ar ? "جدول أعمال الاجتماع" : "Meeting Agenda"}</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">{agenda.map((item, index) => <li key={item} className="flex items-start gap-3 rounded-xl border border-[#eee9df] bg-[#fcfbf8] p-4"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#f4efe2] text-xs font-extrabold text-[#805f2e]">{index + 1}</span><span className="text-sm leading-6">{item}</span></li>)}</ol>
      </section>
      <section className="rounded-2xl border border-[#e5e0d5] bg-white p-5 shadow-[0_4px_16px_#17243707] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-extrabold tracking-[.18em] text-[#9b783d]">WEEKLY REVIEW</p><h2 className="mt-1 text-xl font-extrabold">{ar ? "نتائج الأسبوع" : "This Week's Results"}</h2></div><span className="rounded-full bg-[#f4efe2] px-3 py-1.5 text-xs font-bold text-[#805f2e]">{recent.length} {ar ? "مهمة" : "tasks"}</span></div>
        {!loading && !recent.length ? <p className="mt-4 rounded-xl border border-dashed border-[#d9d2c5] p-5 text-sm text-slate-500">{ar ? "لا توجد مهام مسجلة هذا الأسبوع بعد." : "No tasks recorded this week yet."}</p> : <ul className="mt-4 space-y-3">{recent.map(task => <li key={task.id} className="rounded-xl border border-[#eee9df] bg-[#fcfbf8] p-4"><p className="font-bold">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.specialistKey} · {task.status}</p>{task.resultText ? <div className="mt-3"><GroundedResearchResult value={task.resultText}/></div> : null}</li>)}</ul>}
      </section>
      <section className="rounded-2xl border border-[#e5e0d5] bg-white p-5 shadow-[0_4px_16px_#17243707]"><h2 className="font-extrabold">{ar ? "مهام تحتاج نقاشاً" : "Items for Discussion"}</h2>{!open.length ? <p className="mt-2 text-sm text-slate-500">{ar ? "لا توجد مهام معلقة ضمن السجل المتاح." : "No outstanding tasks in the available log."}</p> : <ul className="mt-3 grid gap-2 sm:grid-cols-2">{open.map(task => <li key={task.id} className="rounded-xl border border-[#eee9df] bg-[#fcfbf8] p-3 text-sm">{task.title}<span className="mt-1 block text-xs text-slate-500">{task.status}</span></li>)}</ul>}</section>
      <section className="rounded-2xl border border-amber-200 bg-[#fbf8f0] p-4 text-xs leading-6 text-slate-600">{ar ? "هذه قاعة مراجعة وجدول أعمال أسبوعي داخل المنصة. عقد الاجتماع تلقائياً وتوليد محضر بواسطة المدير يحتاجان تفعيل خدمة الجدولة والتنسيق الخلفي." : "This is the weekly review room and agenda. Automatically convening the meeting and generating minutes by the manager require the scheduler and backend orchestration to be activated."}</section>
    </div>
  </main>;
}
