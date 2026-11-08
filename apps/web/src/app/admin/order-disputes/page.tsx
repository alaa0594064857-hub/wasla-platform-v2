"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import WorkspaceHeader from "@/components/workspace-header";

type Complaint = {
  id: string; orderId: string; orderNumber: string; storeId: string; storeSlug: string;
  buyerUserId: string; reason: string; details: string; status: string;
  merchantResponse: string | null; moderatorNote: string | null; createdAt: string;
};
export default function AdminOrderDisputesPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [items, setItems] = useState<Complaint[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const t = {
    title: ar ? "شكاوى ونزاعات طلبات المتاجر" : "Member-store order complaints",
    intro: ar ? "راجع شكوى العميل ورد المتجر، ثم اتخذ قرارًا موثقًا. لا تتضمن هذه العملية حجز الأموال أو تسويتها." : "Review the buyer complaint and merchant response, then record a decision. This workflow does not hold or settle funds.",
    empty: ar ? "لا توجد شكاوى مفتوحة." : "No open complaints.",
    loading: ar ? "جارٍ تحميل الشكاوى..." : "Loading complaints...",
    note: ar ? "ملاحظة قرار المشرف (إلزامية)" : "Moderator decision note (required)",
    resolve: ar ? "حسم الشكوى" : "Resolve complaint",
    dismiss: ar ? "رفض الشكوى" : "Dismiss complaint",
    error: ar ? "تعذر تنفيذ العملية. تحقق من صلاحية إدارة البلاغات." : "Action failed. Check platform reports-management permission.",
    saved: ar ? "تم حفظ القرار وتسجيله في سجل التدقيق." : "Decision saved and audit logged.",
    order: ar ? "الطلب" : "Order",
    store: ar ? "المتجر" : "Store",
    reason: ar ? "السبب" : "Reason",
    buyer: ar ? "تفاصيل العميل" : "Buyer details",
    seller: ar ? "رد المتجر" : "Merchant response",
    back: ar ? "العودة إلى شكاوى التقييمات" : "Back to review disputes",
  };
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/platform/order-disputes", { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true || !Array.isArray(data.disputes)) throw new Error(data.error || t.error);
      setItems(data.disputes);
    } catch (e) { setError(e instanceof Error ? e.message : t.error); }
    finally { setLoading(false); }
  }, [ar]);
  useEffect(() => { void load(); }, [load]);
  async function decide(item: Complaint, status: "resolved" | "dismissed") {
    if (busy) return;
    const note = (notes[item.id] || "").trim();
    if (note.length < 5) { setError(ar ? "اكتب ملاحظة لا تقل عن 5 أحرف." : "Enter a decision note of at least 5 characters."); return; }
    setBusy(item.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/platform/order-disputes/" + item.id, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      setMessage(t.saved); await load();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); }
    finally { setBusy(""); }
  }
  return <main lang={locale} dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f7f4ed] text-[#14243a]">
    <WorkspaceHeader section="account" />
    <div className="mx-auto w-[min(1100px,calc(100%-32px))] py-8">
      <Link href="/admin/review-disputes" className="text-sm text-[#806638] underline">{t.back}</Link>
      <h1 className="mt-5 text-3xl font-bold">{t.title} ({items.length})</h1>
      <p className="mt-2 max-w-3xl leading-7 text-slate-600">{t.intro}</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-green-800">{message}</p>}
      {loading ? <p className="mt-6">{t.loading}</p> : items.length === 0 ? <p className="mt-6 rounded-xl bg-white p-6">{t.empty}</p> :
        <div className="mt-6 space-y-4">{items.map(item => <article key={item.id} className="rounded-2xl border border-[#e5dfd4] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <h2 className="font-bold">{t.order}: {item.orderNumber}</h2>
            <span className="rounded-full bg-[#f4efe3] px-3 py-1 text-xs">{item.status}</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{t.store}: {item.storeSlug} · {t.reason}: {item.reason} · {new Date(item.createdAt).toLocaleString(locale)}</p>
          <div className="mt-4 rounded-xl bg-[#f7f4ed] p-4">
            <b>{t.buyer}</b><p className="mt-2 whitespace-pre-wrap leading-7">{item.details}</p>
          </div>
          {item.merchantResponse && <div className="mt-3 rounded-xl border border-[#e5dfd4] p-4">
            <b>{t.seller}</b><p className="mt-2 whitespace-pre-wrap leading-7">{item.merchantResponse}</p>
          </div>}
          <label className="mt-4 block text-sm font-semibold">{t.note}
            <textarea rows={3} maxLength={1500} value={notes[item.id] || ""} onChange={e => setNotes(v => ({ ...v, [item.id]: e.target.value }))} className="mt-2 w-full rounded-lg border border-[#d8d3c9] p-3 font-normal" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={busy === item.id} onClick={() => void decide(item, "resolved")} className="rounded-lg bg-[#14243a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{ar ? "اعتماد الحل" : "Resolve"}</button>
            <button disabled={busy === item.id} onClick={() => void decide(item, "dismissed")} className="rounded-lg border border-[#9a4d42] px-4 py-2 text-sm font-semibold text-[#9a4d42] disabled:opacity-50">{ar ? "رفض الشكوى" : "Dismiss"}</button>
          </div>
        </article>)}</div>}
    </div>
  </main>;
}
