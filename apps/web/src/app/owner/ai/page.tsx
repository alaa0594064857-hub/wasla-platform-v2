"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useLocale } from "../../../components/locale-provider";

type Message = { role: "user" | "assistant"; content: string };
type Status = { configured: boolean; model: string | null; capabilities: string[]; limitations: string[] };
export default function OwnerAiAssistantPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [status, setStatus] = useState<Status | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/platform/ai/assistant", { credentials: "include", cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error("status"); return data as Status & { success: boolean }; })
      .then(data => { if (active) setStatus(data); })
      .catch(() => { if (active) setError(ar ? "تعذر التحقق من حالة خدمة الذكاء الاصطناعي أو صلاحية الحساب." : "Could not verify AI service status or account access."); });
    return () => { active = false; };
  }, [ar]);
  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy || !status?.configured) return;
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
  return <main dir={ar ? "rtl" : "ltr"} lang={locale} className="mx-auto min-h-screen w-full max-w-5xl space-y-6 px-4 py-8 text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><Link href="/owner" className="text-sm text-slate-500 hover:underline">← {ar ? "مركز المالك" : "Owner center"}</Link><p className="mt-3 text-xs font-semibold tracking-[.2em] text-amber-700">WASLA AI OPERATIONS</p><h1 className="mt-1 text-3xl font-bold">{ar ? "مدير WASLA الذكي" : "WASLA AI Manager"}</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">{ar ? "مساعد تشغيلي للمالك لتحليل فرص المنتجات والموردين والتسعير والمخاطر." : "An owner-facing operations copilot for product opportunities, suppliers, pricing, and risk."}</p></div>
      <span className="rounded-full border border-slate-200 px-3 py-1 text-xs">{status?.configured ? (ar ? "الاتصال مهيأ" : "Provider configured") : (ar ? "بانتظار إعداد الاتصال" : "Provider setup pending")}</span>
    </header>
    {error ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{error}</div> : null}
    {status && !status.configured ? <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h2 className="font-bold">{ar ? "خطوة الربط الأخيرة مطلوبة" : "One provider setup step remains"}</h2>
      <p className="text-sm">{ar ? "واجهة المساعد وواجهة API الآمنة أصبحتا جاهزتين، لكن لا يوجد مفتاح مزود AI مضبوط على الخادم. أضف OPENAI_API_KEY كمتغير سري في Render لخدمة wasla-api. لا تضع المفتاح هنا أو في كود المتصفح." : "The assistant UI and secured API are in place, but no AI provider key is configured on the server. Add OPENAI_API_KEY as a secret environment variable on the wasla-api Render service. Never paste it here or into browser code."}</p>
      <p className="text-xs text-slate-600">{ar ? "النموذج الافتراضي بعد الربط: gpt-4.1-mini. يمكن تغييره عبر OPENAI_MODEL." : "Default model after connection: gpt-4.1-mini. Override with OPENAI_MODEL."}</p>
    </section> : null}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        [ar ? "تحليل فرص المنتجات" : "Opportunity analysis", ar ? "مراجعة دليل الطلب والتكلفة والهامش." : "Review demand evidence, costs, and margin."],
        [ar ? "تقييم الموردين" : "Supplier review", ar ? "تحديد الأدلة والنواقص ومخاطر التوريد." : "Identify evidence gaps and sourcing risks."],
        [ar ? "مراجعة التسعير" : "Pricing review", ar ? "فهم التكلفة الواصلة والافتراضات." : "Understand landed cost and assumptions."],
        [ar ? "جودة الكتالوج" : "Catalogue quality", ar ? "كشف المواصفات غير المؤكدة والنسخ المختلفة." : "Spot unverified specs and variant mismatches."]
      ].map(([title, description]) => <article key={title} className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></article>)}
    </section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b bg-slate-50 p-4"><h2 className="font-semibold">{ar ? "محادثة مدير العمليات" : "Operations conversation"}</h2><p className="text-xs text-slate-500">{status?.model || (ar ? "بانتظار إعداد المزود" : "Awaiting provider configuration")}</p></div>
      <div aria-live="polite" className="min-h-64 space-y-3 p-4">
        {!messages.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{ar ? "مثال: حلّل فرصة بيع منتج في السوق الأمريكي، وهذه تكلفة المورد والشحن..." : "Example: Analyze a product opportunity in the US market using this supplier cost and shipping..."}</p> : messages.map((message, index) => <div key={index} className={message.role === "user" ? "ms-8 rounded-xl bg-slate-900 p-3 text-sm text-white" : "me-8 whitespace-pre-wrap rounded-xl bg-slate-100 p-3 text-sm text-slate-800"}>{message.content}</div>)}
        {busy ? <p className="text-sm text-slate-500">{ar ? "مدير WASLA يحلل..." : "WASLA Manager is thinking..."}</p> : null}
      </div>
      <form onSubmit={send} className="flex flex-col gap-2 border-t p-3 sm:flex-row">
        <textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={3000} rows={2} placeholder={ar ? "اكتب سؤالك أو تفاصيل الفرصة..." : "Ask a question or describe an opportunity..."} className="min-h-12 flex-1 resize-y rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-amber-600" />
        <button type="submit" disabled={!status?.configured || busy || !draft.trim()} className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? (ar ? "جارٍ الإرسال..." : "Sending...") : (ar ? "إرسال" : "Send")}</button>
      </form>
    </section>
    <p className="text-xs leading-5 text-slate-500">{ar ? "حالياً المساعد استشاري فقط: لا يقرأ بيانات المنصة الحية ولا يتصل بالموردين ولا ينشر منتجات ولا ينشئ طلبات أو مدفوعات. كل توصية تحتاج مراجعة الأدلة. ستُسجل رسائل المالك والردود لأغراض التدقيق." : "Currently advisory only: it cannot read live platform records, contact suppliers, publish products, or create orders/payments. Verify evidence before acting. Owner prompts and replies are stored for audit."}</p>
  </main>;
}
