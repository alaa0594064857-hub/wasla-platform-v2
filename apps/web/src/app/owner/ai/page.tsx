"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useLocale } from "../../../components/locale-provider";

type Message = { role: "user" | "assistant"; content: string };
type AuditEntry = { id: string; model: string; prompt_preview: string; response_preview: string; createdAt: string };
type Status = { configured: boolean; managerEnabled: boolean; pausedReason: string | null; model: string | null; provider?: string; engine?: string; readOnlyDataAccess?: boolean; auditTrail?: AuditEntry[]; capabilities: string[]; limitations: string[] };
type TeamTask = { id: string; specialistKey: string; title: string; status: string; resultText?: string | null; errorCode?: string | null; createdAt: string };
type TaskEvent = { actorType: string; actorKey: string | null; eventType: string; createdAt: string };
export default function OwnerAiAssistantPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [status, setStatus] = useState<Status | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [productPrompt, setProductPrompt] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [pauseReason, setPauseReason] = useState("Owner maintenance");
  const [createdDraft, setCreatedDraft] = useState<{ id: string; title_ar: string; title_en: string; status: string; price: string; currency: string; warnings: string[] } | null>(null);
  const [teamTasks, setTeamTasks] = useState<TeamTask[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [taskSpecialist, setTaskSpecialist] = useState("product_analyst");
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskBusyId, setTaskBusyId] = useState("");
  const [taskError, setTaskError] = useState("");
  const [taskEvents, setTaskEvents] = useState<Record<string, TaskEvent[]>>({});


  useEffect(() => {
    let active = true;
    fetch("/api/platform/ai/assistant", { credentials: "include", cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error("status"); return data as Status & { success: boolean }; })
      .then(data => { if (active) setStatus(data); })
      .catch(() => { if (active) setError(ar ? "تعذر التحقق من حالة خدمة الذكاء الاصطناعي أو صلاحية الحساب." : "Could not verify AI service status or account access."); });
    return () => { active = false; };
  }, [ar]);
  useEffect(() => {
    let active = true;
    fetch("/api/platform/ai/tasks?limit=30", { credentials: "include", cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || "tasks"); return data; })
      .then(data => { if (active) setTeamTasks(Array.isArray(data.tasks) ? data.tasks : []); })
      .catch(() => { if (active) setTaskError(ar ? "تعذر تحميل مهام الفريق." : "Could not load team tasks."); });
    return () => { active = false; };
  }, [ar]);

  async function refreshTeamTasks() {
    const response = await fetch("/api/platform/ai/tasks?limit=30", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Could not refresh tasks");
    setTeamTasks(Array.isArray(data.tasks) ? data.tasks : []);
  }

  async function createTeamTask(event: FormEvent) {
    event.preventDefault();
    if (!taskTitle.trim() || !taskInput.trim() || taskBusy || !status?.managerEnabled || !status.configured) return;
    setTaskBusy(true); setTaskError("");
    try {
      const response = await fetch("/api/platform/ai/tasks", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialistKey: taskSpecialist, title: taskTitle.trim(), inputText: taskInput.trim() })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Task creation failed");
      setTaskTitle(""); setTaskInput("");
      await refreshTeamTasks();
    } catch (e) { setTaskError(e instanceof Error ? e.message : (ar ? "تعذر إنشاء المهمة." : "Could not create task.")); }
    finally { setTaskBusy(false); }
  }

  async function executeTeamTask(taskId: string) {
    if (taskBusyId || !status?.managerEnabled) return;
    setTaskBusyId(taskId); setTaskError("");
    try {
      const response = await fetch(`/api/platform/ai/tasks/${taskId}/execute`, { method: "POST", credentials: "include" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Task execution failed");
      await refreshTeamTasks();
    } catch (e) { setTaskError(e instanceof Error ? e.message : (ar ? "تعذر تنفيذ المهمة." : "Could not execute task.")); }
    finally { setTaskBusyId(""); }
  }

  async function cancelTeamTask(taskId: string) {
    setTaskBusyId(taskId); setTaskError("");
    try {
      const response = await fetch(`/api/platform/ai/tasks/${taskId}/cancel`, { method: "POST", credentials: "include" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Task cancellation failed");
      await refreshTeamTasks();
    } catch (e) { setTaskError(e instanceof Error ? e.message : (ar ? "تعذر إلغاء المهمة." : "Could not cancel task.")); }
    finally { setTaskBusyId(""); }
  }

  async function loadTaskEvents(taskId: string) {
    try {
      const response = await fetch(`/api/platform/ai/tasks/${taskId}`, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Task history unavailable");
      setTaskEvents(current => ({ ...current, [taskId]: Array.isArray(data.events) ? data.events : [] }));
    } catch (e) { setTaskError(e instanceof Error ? e.message : (ar ? "تعذر تحميل سجل المهمة." : "Could not load task history.")); }
  }

  async function toggleManager() {
    if (!status || controlBusy) return;
    const enabled = !status.managerEnabled;
    setControlBusy(true); setError("");
    try {
      const response = await fetch("/api/platform/ai/assistant", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, reason: enabled ? null : pauseReason.trim() })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not update AI manager control");
      setStatus(current => current ? { ...current, managerEnabled: data.managerEnabled, pausedReason: data.pausedReason } : current);
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذر تغيير حالة المدير." : "Could not change manager state."));
    } finally { setControlBusy(false); }
  }
  async function createProductDraft(event: FormEvent) {
    event.preventDefault();
    const prompt = productPrompt.trim();
    if (!prompt || draftBusy || !status?.configured || !status.managerEnabled) return;
    setDraftBusy(true); setError(""); setCreatedDraft(null);
    try {
      const response = await fetch("/api/platform/ai/product-drafts", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.product) throw new Error(data.error || "Draft creation failed");
      setCreatedDraft({ ...data.product, warnings: Array.isArray(data.warnings) ? data.warnings : [] });
      setProductPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذر إنشاء مسودة المنتج." : "Could not create product draft."));
    } finally { setDraftBusy(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy || !status?.configured || !status.managerEnabled) return;
    const next = [...messages, { role: "user" as const, content }].slice(-12);
    setMessages(next); setDraft(""); setBusy(true); setError("");
    try {
      const response = await fetch("/api/platform/ai/assistant", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "AI request failed");
      setMessages(current => [...current, { role: "assistant" as const, content: String(data.answer) }].slice(-12));
    } catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر الاتصال بالمساعد." : "Could not reach the assistant.")); }
    finally { setBusy(false); }
  }
  return <main dir={ar ? "rtl" : "ltr"} lang={locale} className="mx-auto min-h-screen w-full max-w-5xl space-y-6 px-6 py-8 text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><Link href="/owner" className="text-sm text-slate-500 hover:underline">← {ar ? "مركز المالك" : "Owner center"}</Link><p className="mt-3 text-xs font-semibold tracking-[.2em] text-amber-700">WASLA AI OPERATIONS</p><h1 className="mt-1 text-3xl font-bold">{ar ? "مدير WASLA الذكي" : "WASLA AI Manager"}</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">{ar ? "المدير المركزي لمتجر WASLA الرسمي وفريق الموظفين الرقميين: أبحاث السوق والمنتجات والموردين والمبيعات والشحن." : "The central manager for the official WASLA Store and its digital team: market research, products, suppliers, sales, and fulfilment."}</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-slate-200 px-3 py-1 text-xs">{status?.configured ? (ar ? "Gemini متصل" : "Gemini connected") : (ar ? "بانتظار مفتاح Gemini المجاني" : "Waiting for Gemini free-tier key")}</span><span className={"rounded-full border px-3 py-1 text-xs " + (status?.managerEnabled ? "border-emerald-200 text-emerald-800" : "border-amber-300 text-amber-800")}>{status?.managerEnabled ? (ar ? "المدير نشط" : "Manager active") : (ar ? "المدير متوقف" : "Manager paused")}</span><button type="button" onClick={() => void toggleManager()} disabled={!status || controlBusy} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">{controlBusy ? "…" : status?.managerEnabled ? (ar ? "إيقاف المدير" : "Pause manager") : (ar ? "استئناف المدير" : "Resume manager")}</button></div>
    </header>
    {error ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{error}</div> : null}
    {status && !status.managerEnabled ? <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><strong>{ar ? "مدير WASLA متوقف مؤقتاً" : "WASLA AI Manager is paused"}</strong><p className="mt-1">{status.pausedReason || (ar ? "أوقفه المالك." : "Paused by the owner.")} · {ar ? "لن تعمل المحادثة أو مسودات المنتجات حتى استئنافه." : "Chat and product drafts are disabled until it is resumed."}</p><label className="mt-3 block text-xs">{ar ? "سبب الإيقاف" : "Pause reason"}<input value={pauseReason} onChange={event => setPauseReason(event.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" /></label></section> : null}
    {status && !status.configured ? <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h2 className="font-bold">{ar ? "مفتاح Gemini المجاني مطلوب" : "Gemini free-tier key required"}</h2>
      <p className="text-sm">{ar ? "أنشئ مفتاحاً مجانياً من Google AI Studio، ثم أضفه في Render كمتغير سري باسم GEMINI_API_KEY لخدمة wasla-api. لا ترسل المفتاح في المحادثة ولا تضعه في كود الموقع." : "Create a free API key in Google AI Studio, then add it in Render as a secret named GEMINI_API_KEY for the wasla-api service. Never share the key in chat or place it in website code."}</p>
      <p className="text-xs text-slate-600">{ar ? "النموذج الافتراضي: gemini-3.5-flash-lite. سنستخدم الطبقة المجانية فقط؛ عند بلوغ الحصة سيتوقف الرد حتى تتجدد، ولن يحدث تحويل إلى خطة مدفوعة." : "Default model: gemini-3.5-flash-lite. Free tier only; if its quota is reached, replies pause until reset. No paid fallback is enabled."}</p>
    </section> : null}
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{ar ? "سجل نشاط مدير الذكاء الاصطناعي" : "AI manager activity log"}</h2>
        <span className="text-xs text-slate-500">{ar ? "آخر 20 طلباً للمالك فقط" : "Latest 20 owner requests only"}</span>
      </div>
      {!status?.auditTrail?.length ? <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{ar ? "لا توجد محادثات مسجلة حتى الآن." : "No recorded conversations yet."}</p> :
        <ol className="space-y-3">{status.auditTrail.map(entry => <li key={entry.id} className="rounded-xl border border-slate-100 p-3">
          <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>{entry.model}</span><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(locale)}</time></div>
          <p className="mt-2 text-sm font-semibold">{entry.prompt_preview}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{entry.response_preview}</p>
        </li>)}</ol>}
      <p className="text-xs text-slate-500">{ar ? "هذا سجل تدقيق خاص بالمالك، ويعرض مقتطفات محدودة فقط. لا يتضمن بيانات العملاء الشخصية." : "Private owner audit history with limited excerpts only; customer personal data is not included."}</p>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        [ar ? "تحليل فرص المنتجات" : "Opportunity analysis", ar ? "مراجعة دليل الطلب والتكلفة والهامش." : "Review demand evidence, costs, and margin."],
        [ar ? "تقييم الموردين" : "Supplier review", ar ? "تحديد الأدلة والنواقص ومخاطر التوريد." : "Identify evidence gaps and sourcing risks."],
        [ar ? "مراجعة التسعير" : "Pricing review", ar ? "فهم التكلفة الواصلة والافتراضات." : "Understand landed cost and assumptions."],
        [ar ? "جودة الكتالوج" : "Catalogue quality", ar ? "كشف المواصفات غير المؤكدة والنسخ المختلفة." : "Spot unverified specs and variant mismatches."]
      ].map(([title, description]) => <article key={title} className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></article>)}
    </section>
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[.16em] text-amber-700">WASLA DIGITAL TEAM</p>
          <h2 className="mt-1 text-xl font-bold">{ar ? "فريق الموظفين الرقميين" : "Digital employee team"}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{ar ? "مدير واحد ينسق فرقاً متخصصة. هذه لوحة توزيع المسؤوليات المعتمدة؛ الموظفون المعروضون تخصصات مخططة وليست وكلاء مستقلين مفعّلين بعد." : "One manager coordinates specialist roles. This is the approved responsibility map; these are planned roles, not independently deployed agents yet."}</p>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">{ar ? "التفعيل المرحلي" : "Phased activation"}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["◉", ar ? "باحث الأسواق" : "Market researcher", ar ? "يرصد الطلب والاتجاهات من مصادر مسموح بها." : "Finds demand signals and trends from approved sources."],
          ["◇", ar ? "خبير المنتجات" : "Product intelligence", ar ? "يفهم المواصفات والمتغيرات ويكشف التكرار والنواقص." : "Normalizes specifications, variants, duplicates, and missing facts."],
          ["⌂", ar ? "باحث الموردين" : "Supplier sourcing", ar ? "يقارن الموردين والعروض والتغطية وموثوقية الأدلة." : "Compares suppliers, offers, destination coverage, and evidence."],
          ["▣", ar ? "مدير الكتالوج" : "Catalogue manager", ar ? "يجهز مسودات المنتجات والصور المصرح بها والترجمة." : "Prepares product drafts, authorized media, and localization."],
          ["✧", ar ? "المبيعات والعملاء" : "Sales & customer care", ar ? "يقدم توصيات دقيقة ويتابع استفسارات العملاء." : "Makes grounded recommendations and handles customer questions."],
          ["⇄", ar ? "مدير الطلبات والشحن" : "Orders & logistics", ar ? "ينسق الطلبات والتجهيز والتتبع والاستثناءات." : "Coordinates orders, fulfilment, tracking, and exceptions."],
          ["文", ar ? "مدير الترجمة" : "Translation specialist", ar ? "يحافظ على معنى المحتوى التجاري بالعربية والإنجليزية." : "Preserves commercial meaning in Arabic and English."],
          ["＄", ar ? "المحلل المالي" : "Financial analyst", ar ? "يحسب التكلفة الواصلة والهامش والرسوم المعروفة." : "Calculates landed cost, margin, and known fees."],
          ["✓", ar ? "الجودة والمخاطر" : "Quality & risk", ar ? "يراجع الأدلة والسلامة والامتثال ومخاطر الموردين." : "Reviews evidence, safety, compliance, and supplier risk."]
        ].map(([icon, title, description]) => <article key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xl text-amber-700">{icon}</span>
            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-500">{ar ? "مخطط" : "Planned"}</span>
          </div>
          <h3 className="mt-2 text-sm font-bold">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
        </article>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-900 p-4 text-white"><p className="text-xs text-slate-300">{ar ? "نطاق السوق" : "Market scope"}</p><p className="mt-1 font-semibold">{ar ? "عالمي" : "Global"}</p></div>
        <div className="rounded-xl bg-slate-900 p-4 text-white"><p className="text-xs text-slate-300">{ar ? "نموذج التوريد" : "Fulfilment model"}</p><p className="mt-1 font-semibold">{ar ? "دروبشيبينغ + مخزون انتقائي" : "Dropshipping + selective stock"}</p></div>
        <div className="rounded-xl bg-slate-900 p-4 text-white"><p className="text-xs text-slate-300">{ar ? "سياسة التشغيل" : "Operating budget"}</p><p className="mt-1 font-semibold">{ar ? "أقل تكلفة ممكنة" : "Minimum viable cost"}</p></div>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-950">
        <strong>{ar ? "بوابة موافقة المالك: " : "Owner approval gate: "}</strong>
        {ar ? "شراء المخزون، اعتماد مورد جديد، نشر منتج، تغيير جوهري في السعر، الدفع، الاسترداد، أو أي التزام مالي لا ينفذه الذكاء الاصطناعي دون موافقة مخولة. لا توجد حالياً عمليات شراء أو شحن مستقلة مفعلة." : "Inventory purchases, new supplier approval, product publication, material price changes, payments, refunds, and financial commitments require authorized approval. Autonomous purchasing or shipping is not currently enabled."}
      </div>
    </section>
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <div>
        <p className="text-xs font-bold tracking-[.16em] text-amber-700">TASK DESK</p>
        <h2 className="mt-1 text-xl font-bold">{ar ? "مكتب مهام الموظفين الرقميين" : "Digital team task desk"}</h2>
        <p className="mt-1 text-sm text-slate-600">{ar ? "أنشئ مهمة لموظف متخصص، ثم شغّلها عند الحاجة. كل نتيجة تحتاج مراجعتك؛ لا توجد إجراءات شراء أو نشر أو إرسال تلقائية." : "Assign a task to a specialist and run it when needed. Every result requires your review; no purchasing, publishing or sending actions are automated."}</p>
      </div>
      {taskError ? <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{taskError}</p> : null}
      <form onSubmit={createTeamTask} className="grid gap-3 rounded-xl bg-slate-50 p-4">
        <label className="text-sm font-semibold">{ar ? "الموظف المختص" : "Specialist"}
          <select value={taskSpecialist} onChange={event => setTaskSpecialist(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm">
            <option value="market_researcher">{ar ? "باحث الأسواق" : "Market researcher"}</option>
            <option value="product_analyst">{ar ? "خبير المنتجات" : "Product analyst"}</option>
            <option value="supplier_researcher">{ar ? "باحث الموردين" : "Supplier researcher"}</option>
            <option value="catalogue_manager">{ar ? "مدير الكتالوج" : "Catalogue manager"}</option>
            <option value="sales_support">{ar ? "المبيعات وخدمة العملاء" : "Sales support"}</option>
            <option value="logistics_analyst">{ar ? "الطلبات والشحن" : "Orders & logistics"}</option>
            <option value="translator">{ar ? "الترجمة" : "Translator"}</option>
            <option value="financial_analyst">{ar ? "المحلل المالي" : "Financial analyst"}</option>
            <option value="quality_risk_reviewer">{ar ? "الجودة والمخاطر" : "Quality & risk reviewer"}</option>
          </select>
        </label>
        <label className="text-sm font-semibold">{ar ? "عنوان المهمة" : "Task title"}
          <input value={taskTitle} onChange={event => setTaskTitle(event.target.value)} maxLength={180} required className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" />
        </label>
        <label className="text-sm font-semibold">{ar ? "تفاصيل المهمة والمعلومات المتوفرة" : "Task instructions and available evidence"}
          <textarea value={taskInput} onChange={event => setTaskInput(event.target.value)} maxLength={5000} rows={4} required className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" />
        </label>
        <div><button type="submit" disabled={!status?.configured || !status.managerEnabled || taskBusy || !taskTitle.trim() || !taskInput.trim()} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{taskBusy ? (ar ? "جارٍ إنشاء المهمة..." : "Creating task...") : (ar ? "إضافة مهمة للفريق" : "Assign task")}</button></div>
      </form>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{ar ? "المهام الأخيرة" : "Recent tasks"}</h3><button type="button" onClick={() => void refreshTeamTasks().catch(e => setTaskError(e.message))} className="text-xs font-semibold text-amber-800 underline">{ar ? "تحديث" : "Refresh"}</button></div>
        {!teamTasks.length ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{ar ? "لا توجد مهام بعد. أنشئ أول مهمة للفريق." : "No tasks yet. Assign the team's first task."}</p> : teamTasks.map(task => <article key={task.id} className="space-y-2 rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h4 className="font-semibold">{task.title}</h4><p className="mt-1 text-xs text-slate-500">{task.specialistKey.replaceAll("_", " ")} · {new Date(task.createdAt).toLocaleString(locale)}</p></div>
            <span className="rounded-full border border-slate-200 px-2 py-1 text-xs">{task.status === "needs_owner_review" ? (ar ? "بانتظار مراجعتك" : "Needs your review") : task.status}</span>
          </div>
          {task.resultText ? <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6">{task.resultText}</div> : null}
          {task.errorCode ? <p className="text-xs text-rose-700">{ar ? "رمز الخطأ: " : "Error: "}{task.errorCode}</p> : null}
          <div className="flex flex-wrap gap-2">
            {task.status === "queued" ? <button type="button" onClick={() => void executeTeamTask(task.id)} disabled={!status?.configured || !status.managerEnabled || Boolean(taskBusyId)} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{taskBusyId === task.id ? (ar ? "جارٍ التنفيذ..." : "Running...") : (ar ? "تشغيل الموظف" : "Run specialist")}</button> : null}
            {task.status === "queued" ? <button type="button" onClick={() => void cancelTeamTask(task.id)} disabled={Boolean(taskBusyId)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs">{ar ? "إلغاء" : "Cancel"}</button> : null}
            <button type="button" onClick={() => void loadTaskEvents(task.id)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs">{ar ? "سجل المهمة" : "Task history"}</button>
          </div>
          {taskEvents[task.id]?.length ? <ol className="space-y-1 border-s-2 border-slate-200 ps-3 text-xs text-slate-500">{taskEvents[task.id].map((event, index) => <li key={index}>{event.eventType} · {event.actorType} · {new Date(event.createdAt).toLocaleString(locale)}</li>)}</ol> : null}
        </article>)}
      </div>
      <p className="text-xs text-slate-500">{ar ? "تشغيل المهمة يستدعي نموذج Gemini المجاني الحالي فقط. إذا انتهت الحصة، تتوقف المهمة دون تحويل إلى خدمة مدفوعة. النتائج استشارية وتتطلب مراجعة المالك." : "Execution uses the existing Gemini free-tier configuration only. If quota is exhausted, the task stops without a paid fallback. Results are advisory and require owner review."}</p>
    </section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b bg-slate-50 px-6 py-4"><h2 className="font-semibold">{ar ? "محادثة مدير العمليات" : "Operations conversation"}</h2><p className="text-xs text-slate-500">{status?.model || (ar ? "بانتظار إعداد Gemini" : "Awaiting Gemini free-tier setup")}</p></div>
      <div aria-live="polite" className="min-h-64 space-y-3 px-6 py-5">
        {!messages.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">{ar ? "مثال: حلّل فرصة هذا المنتج باستخدام تكلفة المورد والشحن وسعر البيع..." : "Example: Analyze this product opportunity using the supplier cost, shipping, and selling price..."}</p> : messages.map((message, index) => <div key={index} className={message.role === "user" ? "ms-8 rounded-xl bg-slate-900 px-4 py-4 text-sm leading-7 text-white" : "me-8 whitespace-pre-wrap rounded-xl bg-slate-100 px-4 py-4 text-sm leading-7 text-slate-800"}>{message.content}</div>)}
        {busy ? <p className="text-sm text-slate-500">{ar ? "مدير WASLA يحلل..." : "WASLA Manager is thinking..."}</p> : null}
      </div>
      <form onSubmit={send} className="flex flex-col gap-2 border-t px-5 py-4 sm:flex-row">
        <textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={3000} rows={2} placeholder={ar ? "اكتب سؤالك لمدير WASLA أو تفاصيل الفرصة..." : "Ask WASLA AI a question or describe an opportunity..."} className="min-h-12 flex-1 resize-y rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-amber-600" />
        <button type="submit" disabled={!status?.configured || !status.managerEnabled || busy || !draft.trim()} className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? (ar ? "جارٍ الإرسال..." : "Sending...") : (ar ? "إرسال" : "Send")}</button>
      </form>
    </section>
    <section className="space-y-4 rounded-2xl border border-amber-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-bold">{ar ? "إنشاء مسودة منتج بالذكاء الاصطناعي" : "Create an AI product draft"}</h2>
        <p className="mt-1 text-sm text-slate-600">{ar ? "اكتب وصف المنتج والمعلومات المتوفرة. سيُنشئ المدير مسودة خاصة غير منشورة، ولن يخترع المورد أو السعر أو الشحن أو الصور." : "Describe the product using the facts you have. The manager creates a private unpublished draft and will not invent supplier, price, shipping, or image details."}</p>
      </div>
      <form onSubmit={createProductDraft} className="space-y-3">
        <textarea value={productPrompt} onChange={event => setProductPrompt(event.target.value)} maxLength={5000} rows={5} required disabled={!status?.configured || !status.managerEnabled || draftBusy} className="w-full rounded-xl border border-slate-300 p-3 text-sm" placeholder={ar ? "مثال: قارورة حرارية من الستانلس ستيل، سعة 1 لتر، لون أسود..." : "Example: Stainless steel insulated bottle, 1 litre, black..."} />
        <button type="submit" disabled={!status?.configured || draftBusy || !productPrompt.trim()} className="rounded-xl bg-amber-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{draftBusy ? (ar ? "جارٍ تجهيز المسودة..." : "Creating draft...") : (ar ? "أنشئ مسودة المنتج" : "Create product draft")}</button>
      </form>
      {createdDraft ? <div role="status" className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm">
        <strong>{ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully"}</strong>
        <p>{ar ? createdDraft.title_ar : createdDraft.title_en}</p>
        <p className="text-xs">{ar ? "الحالة: مسودة خاصة · السعر غير محدد (قيمة مؤقتة صفر)" : "Status: private draft · price not set (temporary zero placeholder)"}</p>
        <p className="text-xs">{ar ? "معرّف المنتج:" : "Product ID:"} {createdDraft.id}</p>
        {createdDraft.warnings.map((warning, index) => <p key={index} className="text-xs">{warning}</p>)}
        <Link href="/owner/official-store" className="inline-block font-semibold text-amber-800 underline">{ar ? "افتح إدارة المتجر لمراجعة المنتج" : "Open store administration to review the product"}</Link>
      </div> : null}
    </section>
    <p className="text-xs leading-5 text-slate-500">{ar ? "يقرأ المساعد حالياً لقطة محدودة للقراءة فقط من أحدث 30 منتجاً و50 عرض مورد في متجر WASLA الرسمي، بما فيها بيانات المورد والتكلفة المخصصة للمالك. لا يتصل بالموردين ولا ينشر منتجات ولا ينشئ طلبات أو مدفوعات ولا يغيّر البيانات. قد لا تشمل اللقطة كل السجلات، ويجب التحقق من الأدلة قبل القرار. تطبق حدود الاستخدام المجاني. لا ترسل كلمات مرور أو مفاتيح API أو بيانات عملاء حساسة. تُسجل رسائل المالك والردود لأغراض التدقيق." : "Read-only access: the assistant receives a limited snapshot of up to the 30 latest official-store products and 50 latest supplier offers, including owner-private supplier and cost details. It cannot contact suppliers, publish products, create orders/payments, or change data. The snapshot may not include every record; verify evidence before acting. Free-tier limits apply. Do not send passwords, API keys, or sensitive customer data. Owner prompts and replies are stored for audit."}</p>
  </main>;
}
