"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type Deal = {
  id: string; deal_number: string; sourcing_order_id: string; buyer_user_id: string;
  supplier_account_id: string; supplier_name: string; status: string; terms_version: number;
  terms_snapshot: Record<string, unknown>; proposed_by_user_id: string;
  accepted_by_user_id: string | null; accepted_at: string | null; created_at: string; can_respond: boolean;
};
type SourcingOrder = { id: string; orderNumber: string; status: string; currency: string; grandTotal: string; supplierName: string };
type Amendment = { id: string; version: number; proposed_by_user_id: string; can_respond: boolean; status: string; terms_snapshot: Record<string, unknown>; reason: string | null; created_at: string };
type Milestone = { id: string; title: string; description: string | null; due_at: string | null; status: string; created_by_user_id: string };
type Detail = { deal: Deal; amendments: Amendment[]; milestones: Milestone[]; events: { id: string; event_type: string; created_at: string }[] };

const copy = {
  ar: {
    title: "إدارة الصفقات", subtitle: "اتفق مع المورد على الشروط، وتابع مراحل التنفيذ والتعديلات بسجل واضح.",
    loading: "جارٍ تحميل الصفقات...", empty: "لا توجد صفقات بعد. أنشئ صفقة من طلب توريد معتمد.",
    create: "إنشاء صفقة", order: "طلب التوريد", choose: "اختر طلباً", terms: "الشروط المقترحة", termsHint: "اكتب الشروط التجارية بوضوح، مثل المواصفات والتسليم والضمان.", submit: "إرسال للطرف الآخر",
    status: "الحالة", supplier: "المورد", version: "نسخة الشروط", proposed: "بانتظار موافقة الطرف الآخر", agreed: "متفق عليها", in_progress: "قيد التنفيذ", completed: "مكتملة", cancelled: "ملغاة", disputed: "متنازع عليها", accepted: "مقبول", rejected: "مرفوض",
    details: "تفاصيل الصفقة", accept: "موافقة", decline: "رفض", amendment: "اقتراح تعديل", reason: "سبب التعديل (اختياري)", propose: "إرسال التعديل", milestones: "مراحل التنفيذ", milestoneTitle: "اسم المرحلة", milestoneDescription: "التفاصيل (اختياري)", dueAt: "موعد مستهدف (اختياري)", addMilestone: "إضافة مرحلة", pending: "معلقة", milestoneCompleted: "مكتملة", milestoneCancelled: "ملغاة", markComplete: "تأكيد الإنجاز", cancelMilestone: "إلغاء المرحلة", amendments: "تعديلات الشروط", events: "سجل الأحداث", noMilestones: "لا توجد مراحل بعد.", noAmendments: "لا توجد تعديلات.", error: "تعذر إكمال العملية.", loadingDetails: "جارٍ تحميل التفاصيل...", back: "العودة للصفقات", submitBusy: "جارٍ الحفظ...", note: "لا توجد مدفوعات أو تحويلات مالية تلقائية ضمن هذه النسخة."
  },
  en: {
    title: "Trade deals", subtitle: "Agree supplier terms, track execution milestones, and keep a clear change history.",
    loading: "Loading deals...", empty: "No deals yet. Create one from an accepted sourcing order.",
    create: "Create a deal", order: "Sourcing order", choose: "Choose an order", terms: "Proposed terms", termsHint: "Describe commercial terms clearly, including specifications, delivery, and warranty.", submit: "Send to the other party",
    status: "Status", supplier: "Supplier", version: "Terms version", proposed: "Awaiting the other party", agreed: "Agreed", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled", disputed: "Disputed", accepted: "Accepted", rejected: "Rejected",
    details: "Deal details", accept: "Accept", decline: "Decline", amendment: "Propose an amendment", reason: "Reason (optional)", propose: "Send amendment", milestones: "Execution milestones", milestoneTitle: "Milestone title", milestoneDescription: "Details (optional)", dueAt: "Target date (optional)", addMilestone: "Add milestone", pending: "Pending", milestoneCompleted: "Completed", milestoneCancelled: "Cancelled", markComplete: "Mark complete", cancelMilestone: "Cancel milestone", amendments: "Terms amendments", events: "Activity log", noMilestones: "No milestones yet.", noAmendments: "No amendments.", error: "Could not complete the operation.", loadingDetails: "Loading details...", back: "Back to deals", submitBusy: "Saving...", note: "Payments and automatic money transfers are not included in this version."
  }
};

export default function TradePage() {
  const { locale } = useLocale();
  const t = copy[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";
  const [deals, setDeals] = useState<Deal[]>([]);
  const [orders, setOrders] = useState<SourcingOrder[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [terms, setTerms] = useState("");
  const [amendmentTerms, setAmendmentTerms] = useState("");
  const [reason, setReason] = useState("");
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDescription, setMilestoneDescription] = useState("");
  const [dueAt, setDueAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [dealResponse, orderResponse] = await Promise.all([
        fetch("/api/trade-deals", { credentials: "include", cache: "no-store" }),
        fetch("/api/orders", { credentials: "include", cache: "no-store" }),
      ]);
      const [dealData, orderData] = await Promise.all([dealResponse.json(), orderResponse.json()]);
      if (!dealResponse.ok || dealData.success !== true) throw new Error(dealData.error || t.error);
      setDeals(dealData.deals as Deal[]);
      setOrders(orderData.success ? ((orderData.sourcingOrders ?? []) as SourcingOrder[]).filter(o => ["awaiting_payment", "payment_pending", "paid", "fulfilment_pending"].includes(o.status)) : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
    finally { setLoading(false); }
  }, [t.error]);

  useEffect(() => { void load(); }, [load]);

  async function openDeal(id: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/trade-deals/${encodeURIComponent(id)}`, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      setSelected(data as Detail);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
    finally { setBusy(false); }
  }

  async function action(url: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      if (selected) await openDeal(selected.deal.id);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
    finally { setBusy(false); }
  }

  async function createDeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let proposedTerms: Record<string, unknown>;
    try { proposedTerms = JSON.parse(terms); if (!proposedTerms || Array.isArray(proposedTerms) || typeof proposedTerms !== "object") throw new Error(); }
    catch { setError(locale === "ar" ? "اكتب الشروط بصيغة JSON صحيحة." : "Enter valid JSON terms."); return; }
    await action("/api/trade-deals", "POST", { sourcingOrderId: orderId, termsSnapshot: proposedTerms });
    setOrderId(""); setTerms("");
  }

  const statusLabel = (status: string) => (t as Record<string, string>)[status] ?? status;
  return <main dir={dir} className="min-h-screen bg-[#f7f4ec] text-[#17243a]">
    <WorkspaceHeader section="business" />
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="mt-2 text-sm text-slate-600">{t.subtitle}</p>
        <p className="mt-2 text-xs text-slate-500">{t.note}</p>
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {selected ? <section className="space-y-5">
        <button className="text-sm underline" onClick={() => setSelected(null)}>{t.back}</button>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-bold">{selected.deal.deal_number}</h2><p className="mt-1 text-sm text-slate-600">{t.supplier}: {selected.deal.supplier_name}</p></div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">{statusLabel(selected.deal.status)}</span>
          </div>
          <p className="mt-3 text-sm">{t.version}: {selected.deal.terms_version}</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(selected.deal.terms_snapshot, null, 2)}</pre>
          {selected.deal.status === "proposed" && selected.deal.can_respond && <div className="mt-4 flex gap-2">
            <button disabled={busy} className="rounded-lg bg-[#17243a] px-4 py-2 text-white disabled:opacity-50" onClick={() => void action(`/api/trade-deals/${selected.deal.id}/respond`, "POST", { decision: "accept" })}>{t.accept}</button>
            <button disabled={busy} className="rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => void action(`/api/trade-deals/${selected.deal.id}/respond`, "POST", { decision: "decline" })}>{t.decline}</button>
          </div>}
        </div>
        {["agreed", "in_progress"].includes(selected.deal.status) && <>
          <form className="rounded-xl border bg-white p-5" onSubmit={e => { e.preventDefault(); let parsed: Record<string, unknown>; try { parsed = JSON.parse(amendmentTerms); if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(); } catch { setError(locale === "ar" ? "صيغة الشروط غير صحيحة." : "Invalid terms JSON."); return; } void action(`/api/trade-deals/${selected.deal.id}/amendments`, "POST", { termsSnapshot: parsed, reason }); setAmendmentTerms(""); setReason(""); }}>
            <h3 className="mb-3 font-semibold">{t.amendment}</h3>
            <textarea required value={amendmentTerms} onChange={e => setAmendmentTerms(e.target.value)} placeholder='{"delivery":"...","warranty":"..."}' className="min-h-24 w-full rounded-lg border p-3 text-sm" />
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder={t.reason} className="mt-2 w-full rounded-lg border p-3 text-sm" />
            <button disabled={busy} className="mt-3 rounded-lg bg-[#17243a] px-4 py-2 text-white disabled:opacity-50">{busy ? t.submitBusy : t.propose}</button>
          </form>
          <form className="rounded-xl border bg-white p-5" onSubmit={e => { e.preventDefault(); void action(`/api/trade-deals/${selected.deal.id}/milestones`, "POST", { title: milestoneTitle, description: milestoneDescription || undefined, dueAt: dueAt || undefined }); setMilestoneTitle(""); setMilestoneDescription(""); setDueAt(""); }}>
            <h3 className="mb-3 font-semibold">{t.milestones}</h3>
            <input required maxLength={180} value={milestoneTitle} onChange={e => setMilestoneTitle(e.target.value)} placeholder={t.milestoneTitle} className="w-full rounded-lg border p-3 text-sm" />
            <input maxLength={2000} value={milestoneDescription} onChange={e => setMilestoneDescription(e.target.value)} placeholder={t.milestoneDescription} className="mt-2 w-full rounded-lg border p-3 text-sm" />
            <input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} className="mt-2 w-full rounded-lg border p-3 text-sm" />
            <button disabled={busy} className="mt-3 rounded-lg bg-[#17243a] px-4 py-2 text-white disabled:opacity-50">{t.addMilestone}</button>
            <div className="mt-4 space-y-2">{selected.milestones.length ? selected.milestones.map(m => <div key={m.id} className="rounded-lg bg-slate-50 p-3"><div className="flex flex-wrap justify-between gap-2"><strong>{m.title}</strong><span className="text-xs">{statusLabel(m.status === "pending" ? "pending" : m.status === "completed" ? "milestoneCompleted" : "milestoneCancelled")}</span></div>{m.description && <p className="mt-1 text-sm text-slate-600">{m.description}</p>}{m.due_at && <p className="mt-1 text-xs text-slate-500">{new Date(m.due_at).toLocaleString(locale === "ar" ? "ar" : "en")}</p>}{m.status === "pending" && <div className="mt-2 flex gap-2"><button type="button" disabled={busy} className="text-xs underline" onClick={() => void action(`/api/trade-deals/${selected.deal.id}/milestones/${m.id}`, "PATCH", { status: "completed" })}>{t.markComplete}</button><button type="button" disabled={busy} className="text-xs underline" onClick={() => void action(`/api/trade-deals/${selected.deal.id}/milestones/${m.id}`, "PATCH", { status: "cancelled" })}>{t.cancelMilestone}</button></div>}</div>) : <p className="text-sm text-slate-500">{t.noMilestones}</p>}</div>
          </form>
        </>}
        <section className="rounded-xl border bg-white p-5"><h3 className="font-semibold">{t.amendments}</h3>{selected.amendments.length ? selected.amendments.map(a => <div key={a.id} className="mt-3 border-t pt-3"><div className="flex justify-between gap-2 text-sm"><strong>v{a.version}</strong><span>{statusLabel(a.status)}</span></div><pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(a.terms_snapshot, null, 2)}</pre>{a.reason && <p className="text-xs text-slate-600">{a.reason}</p>}{a.status === "proposed" && a.can_respond && <div className="mt-2 flex gap-2"><button className="text-sm underline" onClick={() => void action(`/api/trade-deals/${selected.deal.id}/amendments/${a.id}/respond`, "POST", { decision: "accept" })}>{t.accept}</button><button className="text-sm underline" onClick={() => void action(`/api/trade-deals/${selected.deal.id}/amendments/${a.id}/respond`, "POST", { decision: "reject" })}>{t.decline}</button></div>}</div>) : <p className="mt-2 text-sm text-slate-500">{t.noAmendments}</p>}</section>
        <section className="rounded-xl border bg-white p-5"><h3 className="font-semibold">{t.events}</h3>{selected.events.map(ev => <p key={ev.id} className="mt-2 border-t pt-2 text-xs text-slate-600">{ev.event_type} · {new Date(ev.created_at).toLocaleString(locale === "ar" ? "ar" : "en")}</p>)}</section>
      </section> : <>
        <form onSubmit={createDeal} className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">{t.create}</h2>
          <select required value={orderId} onChange={e => setOrderId(e.target.value)} className="w-full rounded-lg border p-3 text-sm"><option value="">{t.choose}</option>{orders.map(o => <option key={o.id} value={o.id}>{o.orderNumber} · {o.supplierName} · {o.grandTotal} {o.currency} ({o.status})</option>)}</select>
          <label className="mt-3 block text-sm font-medium">{t.terms}</label>
          <textarea required value={terms} onChange={e => setTerms(e.target.value)} placeholder='{"delivery":"...","warranty":"..."}' className="mt-1 min-h-24 w-full rounded-lg border p-3 text-sm" />
          <p className="mt-1 text-xs text-slate-500">{t.termsHint}</p>
          <button disabled={busy || !orderId} className="mt-3 rounded-lg bg-[#17243a] px-4 py-2 text-white disabled:opacity-50">{busy ? t.submitBusy : t.submit}</button>
        </form>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">{t.title}</h2>
          {loading ? <p>{t.loading}</p> : deals.length ? <div className="divide-y">{deals.map(d => <button key={d.id} onClick={() => void openDeal(d.id)} className="flex w-full flex-wrap items-center justify-between gap-3 py-4 text-start hover:bg-slate-50"><span><strong className="block">{d.deal_number}</strong><span className="text-sm text-slate-600">{t.supplier}: {d.supplier_name}</span></span><span className="text-sm">{statusLabel(d.status)} · v{d.terms_version}</span></button>)}</div> : <p className="text-sm text-slate-500">{t.empty}</p>}
        </section>
      </>}
    </div>
  </main>;
}
