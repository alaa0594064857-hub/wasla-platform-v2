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
    updateError: "تعذر تحديث الطلب. قد لا تملك صلاحية إدارة هذا المتجر."
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
    updateError: "Could not update the request. You may not have permission to manage this store."
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
