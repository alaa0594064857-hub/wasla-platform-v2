"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type SourcingRequest = {
  id: string;
  item_name: string;
  quantity: number;
  unit: string;
  destination_country_code: string;
  destination_city: string;
  status: string;
  created_at: string;
};

const copy = {
  ar: {
    title: "طلبات التوريد", subtitle: "اطلب ما تحتاجه، ودع الموردين يقدمون عروضهم حسب بلد التسليم.",
    newRequest: "إنشاء طلب توريد", item: "ما السلعة التي تبحث عنها؟", quantity: "الكمية",
    unit: "الوحدة", country: "رمز دولة التسليم (مثل TR أو AE)", city: "مدينة التسليم",
    currency: "العملة المطلوبة (اختياري)", description: "المواصفات والتفاصيل (اختياري)",
    submit: "إرسال الطلب للموردين", sending: "جارٍ إرسال الطلب...", refresh: "تحديث",
    mine: "طلباتي", loading: "جارٍ تحميل الطلبات...", empty: "لا توجد طلبات توريد حتى الآن.",
    error: "تعذر إكمال العملية.", sent: "تم إرسال طلب التوريد بنجاح.",
    submitted: "مرسل", searching: "جارٍ البحث", offers_available: "توجد عروض",
    buyer_selected: "تم اختيار عرض", fulfilled: "مكتمل", cancelled: "ملغي", expired: "منتهي",
    hint: "لا تشتري WASLA المخزون ولا تخزنه. المورد هو من يؤكد التوفر والسعر.",
    open: "فتح التفاصيل", details: "التفاصيل",
  },
  en: {
    title: "Sourcing requests", subtitle: "Request what you need and receive supplier offers for your delivery destination.",
    newRequest: "Create a sourcing request", item: "What product do you need?", quantity: "Quantity",
    unit: "Unit", country: "Destination country code (e.g. TR or AE)", city: "Destination city",
    currency: "Preferred currency (optional)", description: "Specifications and details (optional)",
    submit: "Send request to suppliers", sending: "Sending request...", refresh: "Refresh",
    mine: "My requests", loading: "Loading requests...", empty: "You have no sourcing requests yet.",
    error: "Could not complete the operation.", sent: "Sourcing request submitted successfully.",
    submitted: "Submitted", searching: "Searching", offers_available: "Offers available",
    buyer_selected: "Offer selected", fulfilled: "Fulfilled", cancelled: "Cancelled", expired: "Expired",
    hint: "WASLA does not buy or centrally store inventory. Suppliers confirm availability and pricing.",
    open: "Open details", details: "Details",
  },
};

const statusKeys = ["submitted", "searching", "offers_available", "buyer_selected", "fulfilled", "cancelled", "expired"] as const;

export default function SourcingPage() {
  const { locale } = useLocale();
  const t = copy[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";
  const [requests, setRequests] = useState<SourcingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ itemName: "", quantity: "1", unit: "piece", destinationCountryCode: "", destinationCity: "", requestedCurrency: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/sourcing-requests", { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      setRequests(data.requests as SourcingRequest[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally {
      setLoading(false);
    }
  }, [t.error]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/sourcing-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          itemName: form.itemName.trim(),
          quantity: Number(form.quantity),
          unit: form.unit.trim(),
          destinationCountryCode: form.destinationCountryCode.trim().toUpperCase(),
          destinationCity: form.destinationCity.trim(),
          requestedCurrency: form.requestedCurrency.trim() || undefined,
          description: form.description.trim() || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      setForm({ itemName: "", quantity: "1", unit: "piece", destinationCountryCode: "", destinationCity: "", requestedCurrency: "", description: "" });
      setMessage(t.sent);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally {
      setSending(false);
    }
  }

  const inputStyle = { width: "100%", minWidth: 0, padding: "13px 14px", border: "1px solid var(--border, #d8d4ca)", borderRadius: 12, background: "var(--surface, #fff)", color: "inherit", font: "inherit" };
  const labelStyle = { display: "grid", gap: 7, fontWeight: 600, fontSize: 14 } as const;

  return (
    <main className="shops-page" lang={locale} dir={dir}>
      <WorkspaceHeader section="business" />
      <section className="shops-main">
        <div className="shops-heading">
          <div><span className="shops-eyebrow">WASLA / DEMAND-LED SOURCING</span><h1>{t.title}</h1><p>{t.subtitle}</p></div>
          <div className="shops-heading-icon" aria-hidden="true">↗</div>
        </div>
        <div className="shops-alert" role="note">{t.hint}</div>
        {error && <div className="shops-alert" role="alert">{error}</div>}
        {message && <div className="shops-alert" role="status">{message}</div>}
        <section className="shops-create-card" style={{ marginBottom: 24 }}>
          <h2>{t.newRequest}</h2>
          <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14 }}>
              <label style={labelStyle}>{t.item}<input required minLength={2} maxLength={180} style={inputStyle} value={form.itemName} onChange={e => setForm(v => ({ ...v, itemName: e.target.value }))} /></label>
              <label style={labelStyle}>{t.quantity}<input required type="number" min="1" step="1" style={inputStyle} value={form.quantity} onChange={e => setForm(v => ({ ...v, quantity: e.target.value }))} /></label>
              <label style={labelStyle}>{t.unit}<input required maxLength={40} style={inputStyle} value={form.unit} onChange={e => setForm(v => ({ ...v, unit: e.target.value }))} /></label>
              <label style={labelStyle}>{t.country}<input required minLength={2} maxLength={2} style={inputStyle} value={form.destinationCountryCode} onChange={e => setForm(v => ({ ...v, destinationCountryCode: e.target.value.toUpperCase() }))} /></label>
              <label style={labelStyle}>{t.city}<input required minLength={2} maxLength={120} style={inputStyle} value={form.destinationCity} onChange={e => setForm(v => ({ ...v, destinationCity: e.target.value }))} /></label>
              <label style={labelStyle}>{t.currency}<input maxLength={3} style={inputStyle} value={form.requestedCurrency} onChange={e => setForm(v => ({ ...v, requestedCurrency: e.target.value.toUpperCase() }))} /></label>
            </div>
            <label style={labelStyle}>{t.description}<textarea rows={3} maxLength={5000} style={inputStyle} value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} /></label>
            <button className="shops-primary-button" type="submit" disabled={sending}>{sending ? t.sending : t.submit}</button>
          </form>
        </section>
        <div className="shops-heading" style={{ marginTop: 30 }}>
          <div><h2>{t.mine}</h2></div>
          <button type="button" className="shops-order-details-toggle" onClick={() => void load()} disabled={loading}>{t.refresh}</button>
        </div>
        {loading ? <div className="shops-empty">{t.loading}</div> : requests.length === 0 ? (
          <div className="shops-empty">{t.empty}</div>
        ) : (
          <div className="shops-grid">
            {requests.map(request => {
              const status = statusKeys.includes(request.status as typeof statusKeys[number]) ? t[request.status as keyof typeof t] : request.status;
              return <article className="shops-create-card" key={request.id}>
                <div className="shops-card-top"><span className="shops-eyebrow">{request.id.slice(0, 8).toUpperCase()}</span><span className="shops-status">{status}</span></div>
                <h3>{request.item_name}</h3>
                <div className="shops-info-row"><small>{t.quantity}</small><strong>{request.quantity} {request.unit}</strong></div>
                <div className="shops-info-row"><small>{t.city}</small><strong>{request.destination_city}, {request.destination_country_code}</strong></div>
                <Link href={`/sourcing/${request.id}`} className="shops-order-details-toggle">{t.open} ↗</Link>
              </article>;
            })}
          </div>
        )}
      </section>
    </main>
  );
}
