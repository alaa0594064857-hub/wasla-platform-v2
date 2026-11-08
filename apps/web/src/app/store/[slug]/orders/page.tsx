"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "@/components/locale-provider";

type OrderLine = {
  productId: string;
  title: string;
  sku: string | null;
  unitPrice: string;
  currency: string;
  quantity: number;
  availabilityAtRequest: number;
};
type OrderEvent = { id: string; eventType: string; fromStatus: string | null; toStatus: string | null; source: string; reasonCode: string | null; createdAt: string };
type StoreOrder = {
  id: string;
  orderNumber: string;
  buyerUserId: string;
  status: string;
  currency: string;
  items: OrderLine[];
  subtotal: string;
  buyerNote: string | null;
  merchantNote: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveryConfirmedAt: string | null;
  disputeId: string | null;
  disputeReason: string | null;
  disputeDetails: string | null;
  disputeStatus: string | null;
  merchantResponse: string | null;
  moderatorNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function MemberStoreOrdersPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { data: session } = authClient.useSession();
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [merchantNotes, setMerchantNotes] = useState<Record<string, string>>({});
  const [shippingDetails, setShippingDetails] = useState<Record<string, { carrierName: string; trackingNumber: string; trackingUrl: string }>>({});
  const [complaintDetails, setComplaintDetails] = useState<Record<string, string>>({});
  const [complaintReasons, setComplaintReasons] = useState<Record<string, string>>({});
  const [merchantResponses, setMerchantResponses] = useState<Record<string, string>>({});
  const [disputeBusy, setDisputeBusy] = useState("");
  const [orderEvents, setOrderEvents] = useState<Record<string, OrderEvent[]>>({});
  const [eventLoading, setEventLoading] = useState("");
  const [eventErrors, setEventErrors] = useState<Record<string, string>>({});

  const copy = ar ? {
    title: "طلبات المتجر",
    intro: "طلبات العملاء وقرارات البائع. لا يتم تحصيل الدفع أو حجز المخزون من وصلة.",
    back: "العودة إلى المتجر",
    loading: "جارٍ تحميل الطلبات...",
    empty: "لا توجد طلبات لهذا المتجر حتى الآن.",
    loadError: "تعذر تحميل الطلبات. سجّل الدخول وتأكد من صلاحية الوصول.",
    request: "رقم الطلب",
    subtotal: "الإجمالي المسجل",
    note: "ملاحظة العميل",
    merchantNote: "ملاحظة المتجر",
    stockAtRequest: "المخزون المسجل وقت الطلب (للاسترشاد)",
    pending: "بانتظار مراجعة البائع",
    accepted: "قبله البائع",
    shipped: "تم الشحن - بانتظار تأكيد الاستلام",
    completed: "اكتمل بعد تأكيد الاستلام",
    rejected: "رفضه البائع",
    cancelled: "ملغي",
    accept: "قبول الطلب",
    reject: "رفض الطلب",
    notePlaceholder: "أضف ملاحظة للعميل (اختياري)",
    cancel: "إلغاء الطلب",
    carrier: "شركة الشحن", trackingNumber: "رقم التتبع", trackingUrl: "رابط التتبع الآمن", markShipped: "تأكيد الشحن", confirmDelivery: "تأكيد استلام الطلب", tracking: "معلومات الشحن",
    buyer: "العميل",
    submitted: "تاريخ الإرسال",
    noPayment: "هذا طلب وليس عملية شراء مدفوعة. قبول البائع لا يخصم المخزون ولا يحصّل الأموال ولا ينشئ شحنة.",
    updated: "تم تحديث حالة الطلب.",
    updateError: "تعذر تحديث الطلب. قد لا تملك صلاحية إدارة هذا المتجر.",
    history: "سجل حركة الطلب", historyLoading: "جارٍ تحميل السجل...", historyError: "تعذر تحميل سجل الطلب.", historyEmpty: "لا توجد أحداث مسجلة.",
    createdEvent: "إنشاء الطلب", statusChange: "تغيير الحالة", eventSource: "المصدر", from: "من", to: "إلى"
  } : {
    title: "Store orders",
    intro: "Customer requests and merchant decisions. WASLA does not collect payment or reserve stock.",
    back: "Back to store",
    loading: "Loading orders...",
    empty: "There are no requests for this store yet.",
    loadError: "Could not load orders. Sign in and check your access.",
    request: "Order request",
    subtotal: "Recorded subtotal",
    note: "Customer note",
    merchantNote: "Store note",
    stockAtRequest: "Stock recorded when the request was placed (reference only)",
    pending: "Awaiting merchant review",
    accepted: "Accepted by merchant",
    shipped: "Shipped — awaiting buyer confirmation",
    completed: "Completed — receipt confirmed",
    rejected: "Rejected by merchant",
    cancelled: "Cancelled",
    accept: "Accept request",
    reject: "Reject request",
    notePlaceholder: "Add a note for the customer (optional)",
    cancel: "Cancel request",
    carrier: "Carrier", trackingNumber: "Tracking number", trackingUrl: "Secure tracking URL", markShipped: "Mark as shipped", confirmDelivery: "Confirm delivery received", tracking: "Shipment details",
    buyer: "Buyer",
    submitted: "Submitted",
    noPayment: "This is an order request, not a paid purchase. Merchant acceptance does not decrement stock, collect funds or create a shipment.",
    updated: "Order status updated.",
    updateError: "Could not update the request. You may not have permission to manage this store.",
    history: "Order activity history", historyLoading: "Loading history...", historyError: "Could not load order history.", historyEmpty: "No events recorded.",
    createdEvent: "Order created", statusChange: "Status changed", eventSource: "Source", from: "From", to: "To"
  };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(slug)}/orders`, {
        credentials: "include", cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.orders)) throw new Error("orders");
      setOrders(data.orders);
    } catch {
      setError(copy.loadError);
    } finally { setLoading(false); }
  }, [slug, copy.loadError]);

  useEffect(() => { void load(); }, [load]);

  async function loadOrderEvents(orderId: string) {
    if (eventLoading === orderId) return;
    setEventLoading(orderId);
    setEventErrors(current => ({ ...current, [orderId]: "" }));
    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(slug)}/orders/${orderId}`, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.events)) throw new Error("events");
      setOrderEvents(current => ({ ...current, [orderId]: data.events }));
    } catch {
      setEventErrors(current => ({ ...current, [orderId]: copy.historyError }));
    } finally { setEventLoading(""); }
  }

  async function updateOrder(orderId: string, status: "accepted" | "rejected" | "cancelled" | "shipped" | "completed", note = "", shipping?: { carrierName: string; trackingNumber: string; trackingUrl: string }) {
    if (busy) return;
    setBusy(orderId); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(slug)}/orders/${orderId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: note.trim(), ...(shipping ?? {}) })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("update");
      setMessage(copy.updated);
      await load();
    } catch {
      setError(copy.updateError);
    } finally { setBusy(""); }
  }

  async function disputeAction(order: StoreOrder, action: "submit" | "respond" | "close") {
    if (disputeBusy) return;
    const value = action === "submit" ? complaintDetails[order.id] ?? "" : merchantResponses[order.id] ?? "";
    if (action !== "close" && value.trim().length < 10) {
      setError(ar ? "اكتب تفاصيل لا تقل عن 10 أحرف." : "Enter at least 10 characters.");
      return;
    }
    setDisputeBusy(order.id); setError(""); setMessage("");
    try {
      const suffix = action === "respond" ? "/response" : action === "close" ? "/close" : "";
      const response = await fetch(`/api/stores/${encodeURIComponent(slug)}/orders/${order.id}/dispute${suffix}`, {
        method: action === "close" ? "PATCH" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "submit" ? { reason: complaintReasons[order.id] ?? "other", details: value } : action === "respond" ? { response: value } : {})
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "dispute");
      setMessage(ar ? "تم تحديث الشكوى بنجاح." : "Complaint updated successfully.");
      setComplaintDetails(v => ({ ...v, [order.id]: "" }));
      setMerchantResponses(v => ({ ...v, [order.id]: "" }));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر تحديث الشكوى." : "Could not update complaint.")); }
    finally { setDisputeBusy(""); }
  }

  function statusText(status: string) {
    if (status === "accepted") return copy.accepted;
    if (status === "shipped") return copy.shipped;
    if (status === "completed") return copy.completed;
    if (status === "rejected") return copy.rejected;
    if (status === "cancelled") return copy.cancelled;
    return copy.pending;
  }

  return <main className="min-h-screen bg-[#f7f4ec] text-[#14233b]" dir={ar ? "rtl" : "ltr"} lang={locale}>
    <header className="border-b border-[#e5dfd1] bg-white px-5 py-4">
      <Link href="/" className="font-bold tracking-wide">WASLA <span className="text-[#b89545]">وصلة</span></Link>
    </header>
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href={`/store/${encodeURIComponent(slug)}`} className="text-sm font-semibold text-[#9b792f] underline">{copy.back}</Link>
      <h1 className="mt-5 text-3xl font-bold">{copy.title}</h1>
      <p className="mt-2 leading-7 text-slate-600">{copy.intro}</p>
      <p className="mt-4 rounded-xl border border-[#d8bd79] bg-[#fff9eb] p-4 text-sm leading-7 text-[#765a2f]">{copy.noPayment}</p>
      {message && <p role="status" className="mt-4 rounded-xl bg-white p-3 text-sm">{message}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-white p-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="mt-6 rounded-2xl bg-white p-8">{copy.loading}</p>
        : orders.length === 0 ? <p className="mt-6 rounded-2xl bg-white p-8">{copy.empty}</p>
        : <div className="mt-6 space-y-4">{orders.map(order => {
          const isMerchantView = Boolean(session?.user?.id && session.user.id !== order.buyerUserId);
          return <article key={order.id} className="rounded-2xl border border-[#e5dfd1] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-semibold text-[#9b792f]">{copy.request}: {order.orderNumber}</p><p className="mt-2 text-sm text-slate-500">{copy.submitted}: {new Date(order.createdAt).toLocaleString(locale)}</p></div>
              <span className="rounded-full bg-[#f4efe3] px-3 py-2 text-xs font-semibold">{statusText(order.status)}</span>
            </div>
            <section className="mt-4 rounded-xl border border-[#e5dfd1] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{copy.history}</strong>
                <button type="button" onClick={() => void loadOrderEvents(order.id)} disabled={eventLoading === order.id} className="rounded-lg border border-[#14233b] px-3 py-2 text-xs font-semibold disabled:opacity-50">{eventLoading === order.id ? copy.historyLoading : copy.history}</button>
              </div>
              {eventErrors[order.id] && <p role="alert" className="mt-2 text-sm text-red-700">{eventErrors[order.id]}</p>}
              {orderEvents[order.id] && (orderEvents[order.id].length === 0
                ? <p className="mt-3 text-sm text-slate-500">{copy.historyEmpty}</p>
                : <ol className="mt-3 space-y-3 border-s-2 border-[#e5dfd1] ps-4">{orderEvents[order.id].map(event => <li key={event.id} className="text-sm">
                    <p className="font-semibold">{event.eventType === "order_created" ? copy.createdEvent : event.eventType === "status_changed" ? copy.statusChange : event.eventType}</p>
                    {(event.fromStatus || event.toStatus) && <p className="mt-1 text-slate-600">{event.fromStatus ? `${copy.from}: ${event.fromStatus}` : ""}{event.fromStatus && event.toStatus ? " · " : ""}{event.toStatus ? `${copy.to}: ${event.toStatus}` : ""}</p>}
                    <p className="mt-1 text-xs text-slate-500">{copy.eventSource}: {event.source} · {new Date(event.createdAt).toLocaleString(locale)}</p>
                  </li>)}</ol>)}
            </section>
            <div className="mt-4 divide-y divide-[#eee8dc]">
              {order.items.map(line => <div key={line.productId} className="flex flex-wrap justify-between gap-2 py-3">
                <div><p className="font-semibold">{line.title}</p><p className="text-xs text-slate-500">{line.sku || "—"} · {line.quantity} × {line.unitPrice} {line.currency}</p>{isMerchantView && <p className="mt-1 text-xs text-slate-500">{copy.stockAtRequest}: {line.availabilityAtRequest}</p>}</div>
                <p className="font-bold">{(Number(line.unitPrice) * line.quantity).toFixed(2)} {line.currency}</p>
              </div>)}
            </div>
            <p className="mt-3 font-bold">{copy.subtotal}: {order.subtotal} {order.currency}</p>
            {order.carrierName && <div className="mt-4 rounded-xl border border-[#e5dfd1] bg-[#f7f4ec] p-4 text-sm">
              <strong>{copy.tracking}</strong>
              <p className="mt-2">{copy.carrier}: {order.carrierName} · {copy.trackingNumber}: <b dir="ltr">{order.trackingNumber}</b></p>
              {order.trackingUrl && <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[#9b792f] underline">{copy.tracking}: ↗</a>}
              {order.shippedAt && <p className="mt-1 text-xs text-slate-500">{new Date(order.shippedAt).toLocaleString(locale)}</p>}
              {order.deliveryConfirmedAt && <p className="mt-1 text-xs text-slate-500">{copy.completed}: {new Date(order.deliveryConfirmedAt).toLocaleString(locale)}</p>}
            </div>}
            {order.buyerNote && <p className="mt-3 text-sm text-slate-600"><strong>{copy.note}:</strong> {order.buyerNote}</p>}
            {order.merchantNote && <p className="mt-2 text-sm text-slate-600"><strong>{copy.merchantNote}:</strong> {order.merchantNote}</p>}
            {order.disputeId && <section className="mt-4 rounded-xl border border-[#d8bd79] bg-[#fff9eb] p-4 text-sm">
              <strong>{ar ? "شكوى الطلب" : "Order complaint"} · {order.disputeStatus}</strong>
              {order.disputeDetails && <p className="mt-2 whitespace-pre-wrap">{order.disputeDetails}</p>}
              {order.merchantResponse && <p className="mt-2 border-t border-[#e8d9b6] pt-2"><b>{ar ? "رد المتجر:" : "Store response:"}</b> {order.merchantResponse}</p>}
              {order.moderatorNote && <p className="mt-2"><b>{ar ? "قرار WASLA:" : "WASLA decision:"}</b> {order.moderatorNote}</p>}
              {isMerchantView && order.disputeStatus === "open" && <div className="mt-3 space-y-2">
                <textarea rows={3} maxLength={3000} value={merchantResponses[order.id] ?? ""} onChange={e => setMerchantResponses(v => ({ ...v, [order.id]: e.target.value }))} placeholder={ar ? "اكتب رد المتجر..." : "Write the store response..."} className="w-full rounded-lg border border-[#e5dfd1] bg-white p-3" />
                <button disabled={disputeBusy === order.id || (merchantResponses[order.id] ?? "").trim().length < 10} onClick={() => void disputeAction(order, "respond")} className="rounded-lg bg-[#14233b] px-4 py-2 font-semibold text-white disabled:opacity-50">{ar ? "إرسال الرد" : "Send response"}</button>
              </div>}
              {!isMerchantView && ["resolved", "dismissed"].includes(order.disputeStatus ?? "") && <button disabled={disputeBusy === order.id} onClick={() => void disputeAction(order, "close")} className="mt-3 rounded-lg border border-[#14233b] px-4 py-2 font-semibold">{ar ? "إغلاق الشكوى" : "Close complaint"}</button>}
            </section>}
            {!isMerchantView && !order.disputeId && ["accepted", "shipped", "completed"].includes(order.status) && <section className="mt-4 space-y-2 rounded-xl border border-[#e5dfd1] p-4">
              <strong>{ar ? "تقديم شكوى على الطلب" : "Report an order issue"}</strong>
              <select value={complaintReasons[order.id] ?? "other"} onChange={e => setComplaintReasons(v => ({ ...v, [order.id]: e.target.value }))} className="w-full rounded-lg border border-[#e5dfd1] bg-white p-3">
                <option value="not_as_described">{ar ? "المنتج لا يطابق الوصف" : "Not as described"}</option>
                <option value="damaged_or_defective">{ar ? "تالف أو معيب" : "Damaged or defective"}</option>
                <option value="missing_items">{ar ? "نواقص في الطلب" : "Missing items"}</option>
                <option value="delivery_problem">{ar ? "مشكلة في التوصيل" : "Delivery problem"}</option>
                <option value="seller_communication">{ar ? "مشكلة في التواصل مع المتجر" : "Seller communication"}</option>
                <option value="other">{ar ? "سبب آخر" : "Other"}</option>
              </select>
              <textarea rows={3} maxLength={3000} value={complaintDetails[order.id] ?? ""} onChange={e => setComplaintDetails(v => ({ ...v, [order.id]: e.target.value }))} placeholder={ar ? "اشرح المشكلة بالتفصيل..." : "Describe the issue..."} className="w-full rounded-lg border border-[#e5dfd1] p-3" />
              <button disabled={disputeBusy === order.id || (complaintDetails[order.id] ?? "").trim().length < 10} onClick={() => void disputeAction(order, "submit")} className="rounded-lg bg-[#14233b] px-4 py-2 font-semibold text-white disabled:opacity-50">{ar ? "إرسال الشكوى" : "Submit complaint"}</button>
            </section>}
            {!isMerchantView && order.status === "shipped" && <div className="mt-4">
              <button disabled={busy === order.id} onClick={() => void updateOrder(order.id, "completed")} className="rounded-lg bg-[#14233b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{copy.confirmDelivery}</button>
            </div>}
            {!isMerchantView && order.status === "pending_merchant_review" && <div className="mt-4">
              <button disabled={busy === order.id} onClick={() => void updateOrder(order.id, "cancelled")} className="rounded-lg border border-red-700 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">{copy.cancel}</button>
            </div>}
            {isMerchantView && order.status === "accepted" && <div className="mt-4 space-y-3 rounded-xl border border-[#e5dfd1] bg-[#faf8f3] p-4">
              <label className="block text-sm font-semibold">{copy.carrier}<input value={shippingDetails[order.id]?.carrierName ?? ""} onChange={event => setShippingDetails(current => ({ ...current, [order.id]: { carrierName: event.target.value, trackingNumber: current[order.id]?.trackingNumber ?? "", trackingUrl: current[order.id]?.trackingUrl ?? "" } }))} maxLength={100} required className="mt-1 block w-full rounded-lg border border-[#e5dfd1] bg-white p-2" /></label>
              <label className="block text-sm font-semibold">{copy.trackingNumber}<input value={shippingDetails[order.id]?.trackingNumber ?? ""} onChange={event => setShippingDetails(current => ({ ...current, [order.id]: { carrierName: current[order.id]?.carrierName ?? "", trackingNumber: event.target.value, trackingUrl: current[order.id]?.trackingUrl ?? "" } }))} maxLength={120} required className="mt-1 block w-full rounded-lg border border-[#e5dfd1] bg-white p-2" /></label>
              <label className="block text-sm font-semibold">{copy.trackingUrl}<input type="url" inputMode="url" placeholder="https://..." value={shippingDetails[order.id]?.trackingUrl ?? ""} onChange={event => setShippingDetails(current => ({ ...current, [order.id]: { carrierName: current[order.id]?.carrierName ?? "", trackingNumber: current[order.id]?.trackingNumber ?? "", trackingUrl: event.target.value } }))} maxLength={1000} required className="mt-1 block w-full rounded-lg border border-[#e5dfd1] bg-white p-2" /></label>
              <button disabled={busy === order.id || !shippingDetails[order.id]?.carrierName?.trim() || !shippingDetails[order.id]?.trackingNumber?.trim() || !shippingDetails[order.id]?.trackingUrl?.trim()} onClick={() => void updateOrder(order.id, "shipped", merchantNotes[order.id] ?? "", shippingDetails[order.id])} className="rounded-lg bg-[#14233b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{copy.markShipped}</button>
            </div>}
            {isMerchantView && order.status === "pending_merchant_review" && <div className="mt-4 space-y-3">
              <textarea value={merchantNotes[order.id] ?? ""} onChange={event => setMerchantNotes(current => ({ ...current, [order.id]: event.target.value.slice(0, 2000) }))} maxLength={2000} rows={3} placeholder={copy.notePlaceholder} className="w-full rounded-lg border border-[#e5dfd1] p-3 text-sm outline-none focus:border-[#b89545]" />
              <div className="flex flex-wrap gap-3">
              <button disabled={busy === order.id} onClick={() => void updateOrder(order.id, "accepted", merchantNotes[order.id] ?? "")} className="rounded-lg bg-[#14233b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{copy.accept}</button>
              <button disabled={busy === order.id} onClick={() => void updateOrder(order.id, "rejected", merchantNotes[order.id] ?? "")} className="rounded-lg border border-red-700 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">{copy.reject}</button>
              </div>
            </div>}
          </article>;
        })}</div>}
    </div>
  </main>;
}
