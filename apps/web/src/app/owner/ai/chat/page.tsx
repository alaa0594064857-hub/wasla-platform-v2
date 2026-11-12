"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "../../../../components/locale-provider";

type Message = { role: "user" | "assistant"; content: string };
type AssistantStatus = {
  configured: boolean;
  managerEnabled: boolean;
  pausedReason?: string | null;
  model?: string | null;
  provider?: string;
};

const starters = {
  ar: [
    "راجع وضع المتجر الرسمي وحدد أهم 5 أولويات.",
    "حلل عروض الموردين وحدد ما ينقص قبل اعتماد أي منتج.",
    "ضع خطة عملية لزيادة مبيعات WASLA في السوق الأمريكي.",
  ],
  en: [
    "Review the official store and identify the top five priorities.",
    "Analyze supplier offers and list what is missing before product approval.",
    "Create a practical plan to grow WASLA sales in the US market.",
  ],
};

export default function AiManagerChatPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/platform/ai/assistant", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Could not load AI status");
        if (active) setStatus(data);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "AI status unavailable");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function sendMessage(event?: FormEvent<HTMLFormElement>, preset?: string) {
    event?.preventDefault();
    const text = (preset ?? input).trim();
    if (!text || loading || !status?.configured || !status.managerEnabled) return;

    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/platform/ai/assistant", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12) }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || (response.status === 429
        ? (ar ? "وصلنا إلى حد الاستخدام المؤقت لمحرك الذكاء." : "The AI provider rate limit was reached.")
        : "The manager could not respond."));
      setMessages((current) => [...current, { role: "assistant", content: String(data.answer || "") }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (ar ? "تعذر الاتصال بالمدير." : "Could not reach the manager."));
    } finally {
      setLoading(false);
    }
  }

  const canChat = Boolean(status?.configured && status.managerEnabled && !loading);

  return (
    <main dir={ar ? "rtl" : "ltr"} lang={locale} className="min-h-screen bg-[#f5f2e9] px-4 py-5 text-slate-900 sm:px-7 sm:py-8">
      <div className="mx-auto flex min-h-[85vh] max-w-5xl flex-col gap-5">
        <Link href="/owner/ai/headquarters" className="text-sm font-semibold text-amber-800 hover:underline">
          ← {ar ? "العودة إلى المقر الرئيسي" : "Back to headquarters"}
        </Link>

        <header className="rounded-3xl bg-[#101d35] p-5 text-white shadow-sm sm:p-7">
          <p className="text-xs font-bold tracking-[.2em] text-[#d9b76e]">WASLA · GENERAL MANAGER</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{ar ? "مكتب المدير العام" : "General Manager's Office"}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
            {ar
              ? "تحدث مع مدير WASLA مباشرة. اطلب منه التحليل أو التخطيط أو توزيع المهام على الموظفين. هذه المحادثة استشارية وتقرأ لقطة محدودة من بيانات المتجر."
              : "Talk directly with the WASLA manager. Ask for analysis, planning or task delegation. This chat is advisory and reads a limited snapshot of store data."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/20 px-3 py-2">
              {status?.configured ? (ar ? "محرك Gemini مُعد" : "Gemini configured") : (ar ? "محرك الذكاء غير مُعد" : "AI engine not configured")}
            </span>
            <span className={"rounded-full px-3 py-2 " + (status?.managerEnabled ? "bg-emerald-300/15 text-emerald-100" : "bg-amber-200/15 text-amber-100")}>
              {status?.managerEnabled ? (ar ? "المدير نشط" : "Manager active") : (ar ? "المدير متوقف" : "Manager paused")}
            </span>
          </div>
        </header>

        {(!status?.configured || !status?.managerEnabled) && (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
            {!status?.configured
              ? (ar ? "المحادثة غير متاحة حالياً لأن مفتاح Gemini غير جاهز على الخادم." : "Chat is unavailable because the Gemini server key is not configured.")
              : (ar ? "المدير متوقف من إعدادات المالك. أعد تفعيله من لوحة التحكم إذا رغبت." : "The manager is paused by the owner. Re-enable it from the owner controls if desired.")}
          </section>
        )}

        <section className="flex flex-1 flex-col overflow-hidden rounded-3xl border border-[#e3d6b8] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6">
            <div>
              <h2 className="font-bold">{ar ? "المحادثة مع المدير" : "Manager conversation"}</h2>
              <p className="mt-1 text-xs text-slate-500">{ar ? "خاص بالمالك · لا يرسل رسائل خارجية" : "Owner-only · no external messages are sent"}</p>
            </div>
            <button type="button" onClick={() => { setMessages([]); setError(""); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              {ar ? "محادثة جديدة" : "New chat"}
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-[#fcfbf8] p-4 sm:p-6">
            {!messages.length && (
              <div className="mx-auto max-w-2xl py-5 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#101d35] text-2xl text-[#d9b76e]">✳</div>
                <h3 className="mt-4 text-lg font-bold">{ar ? "أهلاً بك في مكتب المدير" : "Welcome to the manager's office"}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  {ar ? "اكتب ما تريد إنجازه، وسأساعدك في تحليل الوضع ووضع الخطوات المناسبة. لا أعتبر أي إجراء خارجياً منفذاً دون دليل وموافقتك." : "Tell me what you want to achieve. I can analyze the situation and plan the next steps. No external action is treated as completed without evidence and your approval."}
                </p>
                <div className="mt-5 grid gap-2 text-start sm:grid-cols-3">
                  {starters[ar ? "ar" : "en"].map((starter) => (
                    <button key={starter} type="button" disabled={!canChat} onClick={() => void sendMessage(undefined, starter)} className="rounded-xl border border-[#e3d6b8] bg-white p-3 text-start text-sm leading-6 hover:border-amber-400 disabled:opacity-50">
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => (
              <div key={index} className={"flex " + (message.role === "user" ? "justify-start" : "justify-end")}>
                <article className={"max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-7 sm:max-w-[80%] " + (message.role === "user" ? "bg-[#101d35] text-white" : "border border-[#e3d6b8] bg-white text-slate-800")}>
                  <p className="mb-1 text-[10px] font-bold opacity-70">{message.role === "user" ? (ar ? "أنت" : "You") : (ar ? "مدير WASLA" : "WASLA Manager")}</p>
                  {message.content}
                </article>
              </div>
            ))}
            {loading && <div className="text-sm text-slate-500">{ar ? "المدير يراجع طلبك..." : "The manager is reviewing your request..."}</div>}
            <div ref={bottomRef} />
          </div>

          {error && <p role="alert" className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</p>}

          <form onSubmit={(event) => void sendMessage(event)} className="border-t border-slate-100 p-3 sm:p-4">
            <div className="flex items-end gap-2">
              <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={2} maxLength={3000} disabled={!canChat} placeholder={ar ? "اكتب توجيهك للمدير العام..." : "Write your instruction to the General Manager..."} className="min-h-[56px] flex-1 resize-y rounded-xl border border-slate-300 p-3 text-sm leading-6 outline-none focus:border-amber-500 disabled:bg-slate-50" />
              <button type="submit" disabled={!canChat || !input.trim()} className="rounded-xl bg-[#101d35] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1c3153] disabled:opacity-40">
                {loading ? (ar ? "..." : "...") : (ar ? "إرسال" : "Send")}
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              {ar ? "المدير يقرأ بيانات محدودة للمتجر والموردين والطلبات. لا ترسل كلمات مرور أو بيانات دفع أو معلومات حساسة للعملاء." : "The manager reads a limited store, supplier and order snapshot. Do not send passwords, payment credentials or sensitive customer data."}
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
