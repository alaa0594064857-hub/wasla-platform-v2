"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useLocale } from "../../../../components/locale-provider";

type Message = { role: "user" | "assistant"; content: string };
type AssistantStatus = { configured: boolean; managerEnabled: boolean; pausedReason: string | null; model: string | null };

const prompts = {
  ar: [
    "حلّل فرصة منتج جديد للسوق العالمي.",
    "ساعدني في مقارنة موردين وتكاليف الشحن.",
    "ضع خطة عملية لزيادة مبيعات متجر WASLA.",
    "راجع فكرة تجارية وحدد مخاطرها."
  ],
  en: [
    "Analyze a new product opportunity for global markets.",
    "Help compare suppliers and shipping costs.",
    "Create a practical plan to grow WASLA Store sales.",
    "Review a business idea and identify its risks."
  ]
};

export default function WaslaAiChatPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/platform/ai/assistant", { credentials: "include", cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "status");
        return data as AssistantStatus & { success: boolean };
      })
      .then(data => { if (active) setStatus(data); })
      .catch(() => { if (active) setError(ar ? "تعذر التحقق من حالة المساعد أو صلاحية الحساب." : "Could not verify assistant status or account access."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ar]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy || !status?.configured || !status.managerEnabled) return;
    const conversation = [...messages, { role: "user" as const, content }];
    // Keep the latest 12 turns, but never send a model reply as Gemini's first message.
    const bounded = conversation.slice(-12);
    const next = bounded[0]?.role === "assistant" ? bounded.slice(1) : bounded;
    setMessages(conversation);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/platform/ai/assistant", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || (ar ? "تعذر الحصول على الرد." : "The assistant could not respond."));
      setMessages(current => [...current, { role: "assistant", content: String(data.answer) }].slice(-12));
    } catch (err) {
      // Remove the unanswered turn so the next attempt does not send two user messages in a row.
      setMessages(current => current.length && current[current.length - 1].role === "user" && current[current.length - 1].content === content ? current.slice(0, -1) : current);
      setDraft(content);
      setError(err instanceof Error ? err.message : (ar ? "حدث خطأ أثناء الاتصال بالمساعد." : "A connection error occurred."));
    } finally {
      setBusy(false);
    }
  }

  function startNewConversation() {
    if (busy) return;
    setMessages([]);
    setDraft("");
    setError("");
  }

  const suggestions = ar ? prompts.ar : prompts.en;

  return (
    <main dir={ar ? "rtl" : "ltr"} lang={locale} className="min-h-screen bg-[#f7f5ef] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
          <div>
            <Link href="/owner/ai" className="text-sm font-medium text-slate-500 hover:text-slate-900">← {ar ? "لوحة مدير WASLA AI" : "WASLA AI Manager dashboard"}</Link>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#101d35] text-lg font-bold text-[#d8b66a]">W</div>
              <div>
                <p className="text-[10px] font-bold tracking-[.24em] text-amber-700">WASLA INTELLIGENCE</p>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">WASLA AI Manager</h1>
                <p className="mt-1 text-xs text-slate-500">{ar ? "مساعدك التجاري الذكي داخل وصلة" : "Your intelligent business assistant inside WASLA"}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1.5 text-xs font-medium ${status?.managerEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              {loading ? (ar ? "جارٍ التحقق…" : "Checking…") : status?.managerEnabled ? (ar ? "المدير نشط" : "Manager active") : (ar ? "المدير متوقف" : "Manager paused")}
            </span>
            <button type="button" onClick={startNewConversation} disabled={busy || !messages.length} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40">{ar ? "محادثة جديدة" : "New chat"}</button>
          </div>
        </header>

        <div className="grid flex-1 gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="flex min-h-[68vh] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4 sm:px-7">
              <h2 className="font-semibold">{ar ? "المحادثة مع مديرك الذكي" : "Chat with your AI business manager"}</h2>
              <p className="mt-1 text-xs text-slate-500">{ar ? "اكتب طلبك بطريقتك، وسيساعدك في تحليله وتحديد الخطوة التالية." : "Describe what you need in your own words. The assistant will help analyze it and identify next steps."}</p>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-7" aria-live="polite">
              {!messages.length ? (
                <div className="mx-auto flex min-h-[42vh] max-w-2xl flex-col justify-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#101d35] text-2xl font-bold text-[#d8b66a]">W</div>
                  <h3 className="text-2xl font-bold">{ar ? "أهلاً بك، كيف أساعدك اليوم؟" : "Welcome. What can I help you with today?"}</h3>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-slate-600">{ar ? "أنا WASLA AI Manager، مساعدك في دراسة المنتجات والأسواق والموردين والتسعير والمبيعات. ابدأ بسؤال أو اختر أحد الاقتراحات." : "I’m WASLA AI Manager, here to help with products, markets, suppliers, pricing, and sales. Start with a question or choose a suggestion."}</p>
                  <div className="mt-6 grid gap-2 sm:grid-cols-2">
                    {suggestions.map(item => <button key={item} type="button" onClick={() => setDraft(item)} className="rounded-2xl border border-slate-200 bg-[#fbfaf7] p-4 text-start text-sm leading-6 transition hover:border-amber-400 hover:bg-amber-50">{item}</button>)}
                  </div>
                </div>
              ) : messages.map((message, index) => (
                <div key={index} className={message.role === "user" ? "ms-auto max-w-[88%] rounded-2xl rounded-ee-md bg-[#101d35] px-4 py-3 text-sm leading-7 text-white" : "me-auto max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-es-md border border-slate-200 bg-[#f8f7f3] px-4 py-3 text-sm leading-7 text-slate-800"}>
                  <p className="mb-1 text-[10px] font-bold tracking-wide opacity-60">{message.role === "user" ? (ar ? "أنت" : "YOU") : "WASLA AI MANAGER"}</p>
                  {message.content}
                </div>
              ))}
              {busy ? <div className="me-auto rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">{ar ? "مدير WASLA يحلل طلبك…" : "WASLA AI Manager is thinking…"}</div> : null}
              <div ref={endRef} />
            </div>

            {error ? <div role="alert" className="mx-4 mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-7">{error}</div> : null}
            <form onSubmit={send} className="border-t border-slate-100 bg-white p-4 sm:p-5">
              <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-100">
                <textarea value={draft} onChange={event => setDraft(event.target.value)} rows={2} maxLength={3000} disabled={!status?.configured || !status.managerEnabled || busy} placeholder={ar ? "اكتب رسالتك إلى WASLA AI Manager…" : "Message WASLA AI Manager…"} className="max-h-40 min-h-12 flex-1 resize-y bg-transparent px-2 py-2 text-sm outline-none disabled:opacity-50" />
                <button type="submit" disabled={!status?.configured || !status.managerEnabled || busy || !draft.trim()} className="rounded-xl bg-[#101d35] px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "…" : (ar ? "إرسال" : "Send")}</button>
              </div>
              <p className="mt-2 px-1 text-[11px] text-slate-400">{ar ? "حتى 3,000 حرف في الرسالة. لا ترسل كلمات مرور أو مفاتيح سرية أو بيانات دفع." : "Up to 3,000 characters per message. Do not send passwords, secret keys, or payment details."}</p>
            </form>
          </section>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-slate-200 bg-white p-5">
              <p className="text-[10px] font-bold tracking-[.2em] text-amber-700">{ar ? "ماذا أستطيع أن أفعل؟" : "WHAT I CAN HELP WITH"}</p>
              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                {(ar ? ["تحليل الأسواق والفرص التجارية", "دراسة المنتجات والطلب والتكلفة", "مقارنة بيانات الموردين والعروض", "مراجعة التسعير وهوامش الربح", "تخطيط المبيعات وتحسين المتجر", "الترجمة والتواصل التجاري", "مراجعة الشحن والجودة والمخاطر"] : ["Market and opportunity analysis", "Product, demand, and cost review", "Supplier and offer comparison", "Pricing and margin analysis", "Sales and store planning", "Translation and business communication", "Shipping, quality, and risk review"]).map(item => <li key={item} className="flex gap-2"><span className="mt-0.5 text-amber-600">✦</span><span>{item}</span></li>)}
              </ul>
            </section>
            <section className="rounded-3xl border border-[#e6d6b1] bg-[#f4efe2] p-5">
              <h3 className="font-semibold">{ar ? "أنت صاحب القرار" : "You stay in control"}</h3>
              <p className="mt-2 text-xs leading-6 text-slate-600">{ar ? "المساعد يقدم تحليلاً واقتراحات فقط. لا ينشر منتجات ولا يتواصل مع الموردين ولا ينفذ مدفوعات أو طلبات. راجع المعلومات ووافق بنفسك قبل أي إجراء." : "The assistant provides analysis and recommendations only. It does not publish products, contact suppliers, or execute payments or orders. Review and approve before taking action."}</p>
            </section>
            {!loading && status && !status.configured ? (
              <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                <h3 className="font-semibold text-amber-900">{ar ? "المساعد بانتظار الإعداد" : "Setup required"}</h3>
                <p className="mt-2 text-xs leading-6 text-amber-900">{ar ? "يلزم إعداد مفتاح Gemini كسرّ على خادم WASLA حتى تعمل الردود. لا ترسل المفتاح في المحادثة." : "A Gemini API key must be configured as a server secret before replies can work. Never send the key in chat."}</p>
              </section>
            ) : null}
            {status && !status.managerEnabled ? (
              <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                <h3 className="font-semibold text-amber-900">{ar ? "المدير متوقف مؤقتاً" : "Manager paused"}</h3>
                <p className="mt-2 text-xs leading-6 text-amber-900">{status.pausedReason || (ar ? "أوقفه مالك المنصة." : "Paused by the platform owner.")}</p>
              </section>
            ) : null}
          </aside>
        </div>
        <footer className="pb-2 text-center text-[11px] text-slate-400">{ar ? "WASLA AI Manager · مساعد الأعمال داخل وصلة" : "WASLA AI Manager · Your business assistant inside WASLA"}</footer>
      </div>
    </main>
  );
}
