"use client";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../../components/locale-provider";
import { GroundedResearchResult } from "../../../../components/grounded-research-result";

type Task = { id: string; specialistKey: string; title: string; status: string; resultText?: string | null; createdAt: string };

export default function AiReportsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/platform/ai/tasks?limit=50", { credentials: "include", cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "tasks");
        return data.tasks || [];
      })
      .then(data => { if (active) setTasks(data); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load report"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const week = useMemo(
    () => tasks.filter(task => Date.now() - new Date(task.createdAt).getTime() <= 7 * 86400000),
    [tasks],
  );
  const completed = week.filter(task => Boolean(task.resultText));
  const cards = [
    [ar ? "مهام هذا الأسبوع" : "Tasks this week", week.length],
    [ar ? "نتائج محفوظة للمراجعة" : "Saved results for review", completed.length],
    [ar ? "بانتظار مراجعتك" : "Awaiting your review", week.filter(task => task.status === "needs_owner_review").length],
    [ar ? "في قائمة الانتظار أو متعثرة" : "Queued or blocked", week.filter(task => ["queued", "failed"].includes(task.status)).length],
  ] as const;

  return <main dir={ar ? "rtl" : "ltr"} lang={locale} className="min-h-screen bg-[#f7f4ed] px-4 py-6 text-[#14243a] sm:px-7">
    <div className="mx-auto max-w-[1440px] space-y-5">
      <header className="rounded-3xl bg-[#14243a] p-6 text-white sm:p-8">
        <p className="text-[10px] font-extrabold tracking-[.2em] text-[#dfc58f]">WASLA · WEEKLY TEAM SUMMARY</p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{ar ? "ملخص الفريق الأسبوعي" : "Weekly Team Summary"}</h1>
        <p className="mt-2 text-sm leading-7 text-slate-300">{ar ? "ملخص عند فتح الصفحة، يعرض مهام ونتائج آخر سبعة أيام فقط. لا يرسل تقارير يومية أو إشعارات تلقائية." : "An on-demand summary of tasks and saved results from the last seven days. No daily reports or automatic notifications are sent."}</p>
      </header>
      {error ? <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-800">{ar ? "تعذر تحميل الملخص: " : "Unable to load the summary: "}{error}</section> : null}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map(([label, value]) => <div key={label} className="rounded-2xl border border-[#e5e0d5] bg-white p-4 shadow-[0_4px_16px_#17243707]"><p className="text-xs leading-5 text-slate-500">{label}</p><strong className="mt-2 block text-3xl font-extrabold tabular-nums">{loading ? "…" : value}</strong></div>)}
      </section>
      <section className="rounded-2xl border border-[#e5e0d5] bg-white p-5 shadow-[0_4px_16px_#17243707] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-[10px] font-extrabold tracking-[.18em] text-[#9b783d]">WEEKLY ACTIVITY</p><h2 className="mt-1 text-xl font-extrabold">{ar ? "نشاط آخر سبعة أيام" : "Last Seven Days"}</h2></div>
          <span className="rounded-full bg-[#f4efe2] px-3 py-1.5 text-xs font-bold text-[#805f2e]">{week.length} {ar ? "مهمة" : "tasks"}</span>
        </div>
        {!loading && !week.length
          ? <p className="mt-4 rounded-xl border border-dashed border-[#d9d2c5] p-5 text-sm text-slate-500">{ar ? "لا توجد مهام خلال هذا الأسبوع." : "No tasks in the last seven days."}</p>
          : <ul className="mt-4 space-y-3">{week.map(task => <li key={task.id} className="rounded-xl border border-[#eee9df] bg-[#fcfbf8] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-bold">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.specialistKey} · {task.status}</p></div>
              <time className="text-xs text-slate-500">{new Date(task.createdAt).toLocaleString(locale)}</time>
            </div>
            {task.resultText ? <div className="mt-3"><GroundedResearchResult value={task.resultText}/></div> : null}
          </li>)}</ul>}
      </section>
      <section className="rounded-2xl border border-[#e5e0d5] bg-white p-4 text-xs leading-6 text-slate-600">{ar ? "هذا ملخص أسبوعي عند فتح الصفحة، وليس متابعة يومية أو إشعاراً تلقائياً. تبقى النتائج البحثية خاصة وبانتظار مراجعة مالك المنصة." : "This is a weekly on-demand summary, not daily tracking or an automatic notification. Research results remain private and require platform-owner review."}</section>
    </div>
  </main>;
}
