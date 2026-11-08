"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import WorkspaceHeader from "@/components/workspace-header";

type Order = {
  id: string; orderNumber: string; customerEmail: string; productTitle: string;
  quantity: number; unitPrice: string; currency: string; supplierName: string | null;
  supplierConfirmationStatus: string; orderStatus: string; paymentStatus: string;
  shippingCarrier: string | null; trackingReference: string | null; shippingStatus: string;
  destinationCountry: string | null;
  ownerReviewRequired: boolean; supplierPurchaseStatus: string; createdAt: string;
};
type Event = { id: string; actorType: string; eventType: string; details: Record<string, unknown>; createdAt: string };

const navy = "#14243a", gold = "#9b783d", cream = "#f7f4ed", muted = "#738092";

export default function OfficialStoreOrdersPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<{ order: Record<string, unknown>; events: Event[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewEvidenceUrl, setReviewEvidenceUrl] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteCurrency, setQuoteCurrency] = useState("USD");
  const [quoteMinDays, setQuoteMinDays] = useState("5");
  const [quoteMaxDays, setQuoteMaxDays] = useState("10");
  const [quoteValidity, setQuoteValidity] = useState("48");
  const [quoteNote, setQuoteNote] = useState("");
  const [quoteBusy, setQuoteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/platform/official-store/orders", { cache: "no-store", credentials: "include" });
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.orders)) throw new Error("load");
      setOrders(data.orders);
    } catch { setError(ar ? "تعذر تحميل الطلبات. تأكد من صلاحية حساب المالك." : "Could not load orders. Check the platform-owner access."); }
    finally { setLoading(false); }
  }, [ar]);

  useEffect(() => { void load(); }, [load]);

  async function openOrder(id: string) {
    setDetailLoading(true); setError("");
    try {
      const response = await fetch(`/api/platform/official-store/orders/${id}`, { cache: "no-store", credentials: "include" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("detail");
      setSelected({ order: data.order, events: Array.isArray(data.events) ? data.events : [] });
    } catch { setError(ar ? "تعذر تحميل تفاصيل الطلب." : "Could not load order details."); }
    finally { setDetailLoading(false); }
  }

  async function reviewSupplier(orderId: string, decision: "accepted" | "rejected") {
    if (reviewSaving) return;
    setReviewSaving(true); setReviewMessage(""); setReviewError(false);
    try {
      const response = await fetch(`/api/platform/official-store/orders/${orderId}/supplier-confirmation`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, evidenceUrl: reviewEvidenceUrl.trim() || null, note: reviewNote.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(typeof data.error === "string" ? data.error : "review");
      setReviewMessage(ar
        ? (decision === "accepted" ? "تم تسجيل تأكيد المورد. يلزم إعداد عرض السعر النهائي وموافقة العميل؛ الدفع والشراء ما زالا غير مفعّلين." : "تم إغلاق الطلب لعدم تأكيد المورد.")
        : (decision === "accepted" ? "Supplier confirmation recorded. A final quote and customer approval are still required; payment and purchasing remain disabled." : "Request closed because the supplier could not confirm availability."));
      setReviewNote(""); setReviewEvidenceUrl("");
      await load();
      await openOrder(orderId);
    } catch (error) {
      setReviewError(true);
      setReviewMessage(error instanceof Error ? error.message : (ar ? "تعذر حفظ المراجعة." : "Could not save supplier review."));
    } finally { setReviewSaving(false); }
  }

  async function issueFinalQuote(orderId: string) {
    if (quoteBusy) return;
    setQuoteBusy(true); setReviewMessage(""); setReviewError(false);
    try {
      const response = await fetch("/api/platform/official-store/orders/" + orderId + "/final-quote", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(quoteAmount), currency: quoteCurrency.toUpperCase(),
          shippingDaysMin: Number(quoteMinDays), shippingDaysMax: Number(quoteMaxDays),
          validityHours: Number(quoteValidity), customerNote: quoteNote.trim()
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(typeof data.error === "string" ? data.error : "quote");
      setQuoteAmount(""); setQuoteNote("");
      setReviewMessage(ar ? "تم إرسال عرض السعر النهائي للعميل. لم يتم تحصيل أي مبلغ." : "Final quote sent to the customer. No payment was collected.");
      await load(); await openOrder(orderId);
    } catch (error) {
      setReviewError(true);
      setReviewMessage(error instanceof Error ? error.message : (ar ? "تعذر إرسال العرض." : "Could not issue quote."));
    } finally { setQuoteBusy(false); }
  }

  const label = (value: unknown) => typeof value === "string" && value ? value.replaceAll("_", " ") : "—";
  const date = (value: unknown) => typeof value === "string" ? new Date(value).toLocaleString(ar ? "ar" : "en") : "—";

  return <main dir={ar ? "rtl" : "ltr"} lang={locale} style={{ minHeight: "100vh", background: cream, color: "#263448" }}>
    <WorkspaceHeader />
    <div style={{ width: "min(1180px, calc(100% - 32px))", margin: "0 auto", padding: "30px 0 64px" }}>
      <Link href="/owner/official-store" style={{ color: gold, fontWeight: 700, textDecoration: "none" }}>← {ar ? "العودة إلى المتجر الرسمي" : "Back to official store"}</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
        <div>
          <p style={{ color: gold, fontSize: 12, fontWeight: 800, letterSpacing: ".12em", marginBottom: 6 }}>WASLA OFFICIAL STORE</p>
          <h1 style={{ color: navy, margin: 0, fontSize: "clamp(26px,4vw,38px)" }}>{ar ? "إدارة الطلبات" : "Order desk"}</h1>
          <p style={{ color: muted, lineHeight: 1.8 }}>{ar ? "عرض داخلي للمالك لمتابعة حالة الطلبات وسجل أحداثها. لا ينفذ دفعاً أو شراءً أو شحناً." : "Owner-only view of order status and event history. It does not take payments, purchase from suppliers or ship orders."}</p>
        </div>
        <button onClick={() => void load()} style={{ border: "1px solid #b18d4d", borderRadius: 10, padding: "10px 15px", background: "#fff", color: navy, fontWeight: 700 }}>{ar ? "تحديث" : "Refresh"}</button>
      </div>

      <div style={{ margin: "18px 0", padding: 14, borderRadius: 12, background: "#fff8e8", border: "1px solid rgba(177,141,77,.35)", color: "#765a2f", lineHeight: 1.8 }}>
        {ar ? "الدفع والشراء من المورد والشحن غير مفعّلة. لا تعتبر أي حالة مدفوعة إلا بعد تحقق مزود الدفع، ولا يُسمح بتأكيد التوريد أو التسليم من هذه الصفحة." : "Payments, supplier purchasing and shipping are not enabled. An order is not paid until a provider event is verified; this page cannot confirm procurement or delivery."}
      </div>

      {error && <p role="alert" style={{ color: "#a33d3d" }}>{error}</p>}
      {loading ? <p>{ar ? "جارٍ تحميل الطلبات..." : "Loading orders..."}</p> :
       orders.length === 0 ? <section style={{ background: "#fff", padding: 26, borderRadius: 14, border: "1px solid #e3e5e8" }}>
         <h2 style={{ color: navy, marginTop: 0 }}>{ar ? "لا توجد طلبات حتى الآن" : "No orders yet"}</h2>
         <p style={{ color: muted, lineHeight: 1.8, marginBottom: 0 }}>{ar ? "لن ننشئ طلبات تجريبية أو وهمية. ستظهر هنا طلبات العملاء الحقيقية بعد إرسالها للتحقق من المورد." : "No sample or fake orders are created. Real customer requests appear here after they are submitted for supplier confirmation."}</p>
       </section> :
       <div style={{ display: "grid", gap: 10 }}>
         {orders.map(order => <article key={order.id} style={{ background: "#fff", border: "1px solid #e3e5e8", borderRadius: 13, padding: 15 }}>
           <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
             <div><strong style={{ color: navy }}>{order.orderNumber}</strong><div style={{ marginTop: 5 }}>{order.productTitle}</div><small style={{ color: muted }}>{order.customerEmail} · {date(order.createdAt)}</small></div>
             <div style={{ textAlign: ar ? "left" : "right" }}><strong>{order.unitPrice} {order.currency} × {order.quantity}</strong><div style={{ color: gold, marginTop: 5 }}>{label(order.orderStatus)}</div></div>
           </div>
           <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, color: muted, fontSize: 13 }}>
             <span>{ar ? "الدفع" : "Payment"}: {label(order.paymentStatus)}</span>
             <span>·</span><span>{ar ? "دولة التوصيل" : "Destination"}: {label(order.destinationCountry)}</span>
             <span>·</span><span>{ar ? "المورد" : "Supplier"}: {label(order.supplierConfirmationStatus)}</span>
             <span>·</span><span>{ar ? "الشحن" : "Shipping"}: {label(order.shippingStatus)}</span>
           </div>
           <button onClick={() => void openOrder(order.id)} style={{ marginTop: 12, border: "1px solid #b18d4d", borderRadius: 9, padding: "8px 12px", background: "#fff", color: navy, fontWeight: 700 }}>{ar ? "عرض التفاصيل والسجل" : "View details and history"}</button>
         </article>)}
       </div>}

      {detailLoading && <p>{ar ? "جارٍ تحميل التفاصيل..." : "Loading details..."}</p>}
      {selected && <section style={{ marginTop: 22, background: "#fff", border: "1px solid #d9dfe5", borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><h2 style={{ color: navy, marginTop: 0 }}>{ar ? "تفاصيل الطلب الداخلية" : "Internal order details"}</h2><button onClick={() => setSelected(null)}>{ar ? "إغلاق" : "Close"}</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 12 }}>
          {Object.entries(selected.order).filter(([key]) => !["shippingAddress","customerNote","supplierOrderUrl","supplierTrackingUrl"].includes(key)).map(([key,value]) => <div key={key} style={{ padding: 10, borderRadius: 9, background: cream, overflowWrap: "anywhere" }}><small style={{ color: muted }}>{label(key)}</small><div style={{ fontWeight: 650, marginTop: 4 }}>{value === null || value === "" ? "—" : typeof value === "boolean" ? (value ? (ar ? "نعم" : "Yes") : (ar ? "لا" : "No")) : String(value)}</div></div>)}
        </div>
        {selected.order.supplierConfirmationStatus === "pending" && selected.order.orderStatus === "awaiting_supplier" && <section style={{ marginTop: 22, padding: 16, borderRadius: 12, background: "#fff8e8", border: "1px solid rgba(177,141,77,.4)" }}>
          <h3 style={{ color: navy, marginTop: 0 }}>{ar ? "مراجعة تأكيد المورد" : "Supplier confirmation review"}</h3>
          <p style={{ color: muted, lineHeight: 1.8 }}>{ar ? "استخدم هذا الإجراء فقط بعد التواصل الفعلي مع المورد والتحقق من نفس المنتج والسعر والتوصيل. قبول المورد لا يعني تحصيل الدفع أو شراء المنتج." : "Use this only after contacting the supplier and verifying the exact product, price and delivery. Supplier acceptance does not collect payment or place a purchase."}</p>
          <label style={{ display: "block", fontWeight: 700, marginTop: 10 }}>{ar ? "رابط دليل التأكيد (HTTPS مطلوب عند القبول)" : "Confirmation evidence URL (HTTPS required for acceptance)"}
            <input value={reviewEvidenceUrl} onChange={event => setReviewEvidenceUrl(event.target.value)} placeholder="https://" style={{ display: "block", width: "100%", marginTop: 6, padding: 11, border: "1px solid #d9cfbb", borderRadius: 9 }} />
          </label>
          <label style={{ display: "block", fontWeight: 700, marginTop: 10 }}>{ar ? "ملاحظات التحقق (10 أحرف على الأقل)" : "Verification note (at least 10 characters)"}
            <textarea value={reviewNote} onChange={event => setReviewNote(event.target.value)} rows={3} maxLength={1000} style={{ display: "block", width: "100%", marginTop: 6, padding: 11, border: "1px solid #d9cfbb", borderRadius: 9 }} />
          </label>
          {reviewMessage && <p role={reviewError ? "alert" : "status"} style={{ color: reviewError ? "#a33d3d" : "#26734a", lineHeight: 1.7 }}>{reviewMessage}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button disabled={reviewSaving || !reviewEvidenceUrl.trim() || reviewNote.trim().length < 10} onClick={() => void reviewSupplier(String(selected.order.id), "accepted")} style={{ background: navy, color: "#fff", border: 0, borderRadius: 9, padding: "10px 14px", fontWeight: 700, opacity: reviewSaving ? .6 : 1 }}>{ar ? "تأكيد توفر المورد" : "Confirm supplier availability"}</button>
            <button disabled={reviewSaving || reviewNote.trim().length < 10} onClick={() => void reviewSupplier(String(selected.order.id), "rejected")} style={{ background: "#fff", color: "#a33d3d", border: "1px solid #a33d3d", borderRadius: 9, padding: "10px 14px", fontWeight: 700 }}>{ar ? "رفض / إغلاق الطلب" : "Reject / close request"}</button>
          </div>
        </section>}
        {reviewMessage && !reviewError && <p role="status" style={{ color: "#26734a" }}>{reviewMessage}</p>}
        {selected.order.supplierConfirmationStatus === "accepted" && selected.order.orderStatus === "supplier_confirmed" && selected.order.finalQuoteStatus !== "accepted" && <section style={{ marginTop: 22, padding: 16, borderRadius: 12, background: "#eef5f1", border: "1px solid #bfd6c8" }}>
          <h3 style={{ color: navy, marginTop: 0 }}>{ar ? "إصدار عرض السعر النهائي للعميل" : "Issue final customer quote"}</h3>
          <p style={{ color: muted, lineHeight: 1.8 }}>{ar ? "أدخل السعر النهائي الشامل ومدة التوصيل. قبول العميل لا يشغّل الدفع أو الشراء." : "Enter the final customer price and delivery estimate. Customer acceptance does not enable payment or purchasing."}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
            <label>{ar ? "السعر النهائي" : "Final price"}<input type="number" min="0.01" step="0.01" value={quoteAmount} onChange={e => setQuoteAmount(e.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }} /></label>
            <label>{ar ? "العملة" : "Currency"}<input maxLength={3} value={quoteCurrency} onChange={e => setQuoteCurrency(e.target.value.toUpperCase())} style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }} /></label>
            <label>{ar ? "أقل مدة توصيل (يوم)" : "Min delivery days"}<input type="number" min="0" max="365" value={quoteMinDays} onChange={e => setQuoteMinDays(e.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }} /></label>
            <label>{ar ? "أقصى مدة توصيل (يوم)" : "Max delivery days"}<input type="number" min="0" max="365" value={quoteMaxDays} onChange={e => setQuoteMaxDays(e.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }} /></label>
            <label>{ar ? "صلاحية العرض (ساعة)" : "Quote validity (hours)"}<input type="number" min="1" max="336" value={quoteValidity} onChange={e => setQuoteValidity(e.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }} /></label>
          </div>
          <label style={{ display: "block", marginTop: 10 }}>{ar ? "ملاحظة للعميل (اختياري)" : "Customer note (optional)"}<textarea maxLength={1000} value={quoteNote} onChange={e => setQuoteNote(e.target.value)} rows={2} style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }} /></label>
          <button disabled={quoteBusy || !quoteAmount || Number(quoteAmount) <= 0 || !/^[A-Z]{3}$/.test(quoteCurrency) || Number(quoteMinDays) < 0 || Number(quoteMaxDays) < Number(quoteMinDays) || Number(quoteMaxDays) > 365 || Number(quoteValidity) < 1 || Number(quoteValidity) > 336} onClick={() => void issueFinalQuote(String(selected.order.id))} style={{ marginTop: 12, background: navy, color: "#fff", border: 0, borderRadius: 9, padding: "10px 14px", fontWeight: 700 }}>{quoteBusy ? "…" : (ar ? "إرسال عرض السعر للعميل" : "Send final quote to customer")}</button>
        </section>}
        {selected.order.finalQuoteStatus && selected.order.finalQuoteStatus !== "not_issued" && <p style={{ marginTop: 12, padding: 12, background: cream, borderRadius: 9 }}>{ar ? "حالة عرض السعر" : "Quote status"}: {label(selected.order.finalQuoteStatus)} · {selected.order.finalQuoteAmount || "—"} {selected.order.finalQuoteCurrency || ""} · {selected.order.finalQuoteExpiresAt ? date(selected.order.finalQuoteExpiresAt) : "—"}</p>}

                <h3 style={{ color: navy, marginTop: 22 }}>{ar ? "سجل الأحداث" : "Event history"}</h3>
        {selected.events.length ? selected.events.map(event => <div key={event.id} style={{ padding: "10px 0", borderBottom: "1px solid #e7e9ec" }}><strong>{label(event.eventType)}</strong><div style={{ color: muted, fontSize: 13 }}>{label(event.actorType)} · {date(event.createdAt)}</div><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{JSON.stringify(event.details, null, 2)}</pre></div>) : <p style={{ color: muted }}>{ar ? "لا توجد أحداث مسجلة." : "No recorded events."}</p>}
      </section>}
    </div>
  </main>;
}
