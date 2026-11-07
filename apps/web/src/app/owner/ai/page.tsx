"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useLocale } from "../../../components/locale-provider";

type Message = { role: "user" | "assistant"; content: string };
type Status = { configured: boolean; model: string | null; provider?: string; engine?: string; readOnlyDataAccess?: boolean; capabilities: string[]; limitations: string[] };
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
  const [createdDraft, setCreatedDraft] = useState<{ id: string; title_ar: string; title_en: string; status: string; price: string; currency: string; warnings: string[] } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/platform/ai/assistant", { credentials: "include", cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error("status"); return data as Status & { success: boolean }; })
      .then(data => { if (active) setStatus(data); })
      .catch(() => { if (active) setError(ar ? "تعذر التحقق من حالة خدمة الذكاء الاصطناعي أو صلاحية الحساب." : "Could not verify AI service status or account access."); });
    return () => { active = false; };
  }, [ar]);
  async function createProductDraft(event: FormEvent) {
    event.preventDefault();
    const prompt = productPrompt.trim();
    if (!prompt || draftBusy || !status?.configured) return;
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
  return <main dir={ar ? "rtl" : "ltr"} lang={locale} className="mx-auto min-h-screen w-full max-w-5xl space-y-6 px-6 py-8 text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><Link href="/owner" className="text-sm text-slate-500 hover:underline">← {ar ? "مركز المالك" : "Owner center"}</Link><p className="mt-3 text-xs font-semibold tracking-[.2em] text-amber-700">WASLA AI OPERATIONS</p><h1 className="mt-1 text-3xl font-bold">{ar ? "مدير WASLA الذكي" : "WASLA AI Manager"}</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">{ar ? "مساعد تشغيلي للمالك لتحليل فرص المنتجات والموردين والتسعير والمخاطر." : "An owner-facing operations copilot for product opportunities, suppliers, pricing, and risk."}</p></div>
      <span className="rounded-full border border-slate-200 px-3 py-1 text-xs">{status?.configured ? (ar ? "Gemini متصل" : "Gemini connected") : (ar ? "بانتظار مفتاح Gemini المجاني" : "Waiting for Gemini free-tier key")}</span>
    </header>
    {error ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{error}</div> : null}
    {status && !status.configured ? <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h2 className="font-bold">{ar ? "مفتاح Gemini المجاني مطلوب" : "Gemini free-tier key required"}</h2>
      <p className="text-sm">{ar ? "أنشئ مفتاحاً مجانياً من Google AI Studio، ثم أضفه في Render كمتغير سري باسم GEMINI_API_KEY لخدمة wasla-api. لا ترسل المفتاح في المحادثة ولا تضعه في كود الموقع." : "Create a free API key in Google AI Studio, then add it in Render as a secret named GEMINI_API_KEY for the wasla-api service. Never share the key in chat or place it in website code."}</p>
      <p className="text-xs text-slate-600">{ar ? "النموذج الافتراضي: gemini-3.5-flash-lite. سنستخدم الطبقة المجانية فقط؛ عند بلوغ الحصة سيتوقف الرد حتى تتجدد، ولن يحدث تحويل إلى خطة مدفوعة." : "Default model: gemini-3.5-flash-lite. Free tier only; if its quota is reached, replies pause until reset. No paid fallback is enabled."}</p>
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
      <div className="border-b bg-slate-50 px-6 py-4"><h2 className="font-semibold">{ar ? "محادثة مدير العمليات" : "Operations conversation"}</h2><p className="text-xs text-slate-500">{status?.model || (ar ? "بانتظار إعداد Gemini" : "Awaiting Gemini free-tier setup")}</p></div>
      <div aria-live="polite" className="min-h-64 space-y-3 px-6 py-5">
        {!messages.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">{ar ? "مثال: حلّل فرصة هذا المنتج باستخدام تكلفة المورد والشحن وسعر البيع..." : "Example: Analyze this product opportunity using the supplier cost, shipping, and selling price..."}</p> : messages.map((message, index) => <div key={index} className={message.role === "user" ? "ms-8 rounded-xl bg-slate-900 px-4 py-4 text-sm leading-7 text-white" : "me-8 whitespace-pre-wrap rounded-xl bg-slate-100 px-4 py-4 text-sm leading-7 text-slate-800"}>{message.content}</div>)}
        {busy ? <p className="text-sm text-slate-500">{ar ? "مدير WASLA يحلل..." : "WASLA Manager is thinking..."}</p> : null}
      </div>
      <form onSubmit={send} className="flex flex-col gap-2 border-t px-5 py-4 sm:flex-row">
        <textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={3000} rows={2} placeholder={ar ? "اكتب سؤالك لمدير WASLA أو تفاصيل الفرصة..." : "Ask WASLA AI a question or describe an opportunity..."} className="min-h-12 flex-1 resize-y rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-amber-600" />
        <button type="submit" disabled={!status?.configured || busy || !draft.trim()} className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? (ar ? "جارٍ الإرسال..." : "Sending...") : (ar ? "إرسال" : "Send")}</button>
      </form>
    </section>
    <section className="space-y-4 rounded-2xl border border-amber-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-bold">{ar ? "إنشاء مسودة منتج بالذكاء الاصطناعي" : "Create an AI product draft"}</h2>
        <p className="mt-1 text-sm text-slate-600">{ar ? "اكتب وصف المنتج والمعلومات المتوفرة. سيُنشئ المدير مسودة خاصة غير منشورة، ولن يخترع المورد أو السعر أو الشحن أو الصور." : "Describe the product using the facts you have. The manager creates a private unpublished draft and will not invent supplier, price, shipping, or image details."}</p>
      </div>
      <form onSubmit={createProductDraft} className="space-y-3">
        <textarea value={productPrompt} onChange={event => setProductPrompt(event.target.value)} maxLength={5000} rows={5} required disabled={!status?.configured || draftBusy} className="w-full rounded-xl border border-slate-300 p-3 text-sm" placeholder={ar ? "مثال: قارورة حرارية من الستانلس ستيل، سعة 1 لتر، لون أسود..." : "Example: Stainless steel insulated bottle, 1 litre, black..."} />
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
