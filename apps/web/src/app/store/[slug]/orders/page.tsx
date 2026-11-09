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
  returnPolicySnapshot: Record<string, unknown> | null;
  returnPolicyVersion: number | null;
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
  returnRequestId: string | null;
  returnResolution: string | null;
  returnReason: string | null;
  returnDetails: string | null;
  returnStatus: string | null;
  returnMerchantResponse: string | null;
  returnCreatedAt: string | null;
  returnItemReceivedAt: string | null;
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
  const [returnDetails, setReturnDetails] = useState<Record<string, string>>({});
  const [returnReasons, setReturnReasons] = useState<Record<string, string>>({});
  const [returnResolutions, setReturnResolutions] = useState<Record<string, string>>({});
  const [returnResponses, setReturnResponses] = useState<Record<string, string>>({});
  const [returnBusy, setReturnBusy] = useState("");
  const [canManagePolicy, setCanManagePolicy] = useState(false);
  const [escalationDetails, setEscalationDetails] = useState<Record<string, string>>({});
  const [escalationReasons, setEscalationReasons] = useState<Record<string, string>>({});

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
  useEffect(() => {
    let active = true;
    fetch(`/api/stores/${encodeURIComponent(slug)}/return-policy/manage`, { credentials: "include", cache: "no-store" })
      .then(response => { if (active) setCanManagePolicy(response.ok); })
      .catch(() => { if (active) setCanManagePolicy(false); });
    return () => { active = false; };
  }, [slug]);

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

  async function returnAction(order: StoreOrder, action: "submit" | "respond" | "received" | "close") {
    if (returnBusy) return;
    const details = action === "submit" ? returnDetails[order.id] ?? "" : returnResponses[order.id] ?? "";
    if (action === "submit" && details.trim().length < 10) {
      setError(ar ? "اشرح سبب الإرجاع أو الاستبدال بعشرة أحرف على الأقل." : "Explain the return or exchange reason in at least 10 characters.");
      return;
    }
    if (action === "respond" && details.trim().length < 5) {
      setError(ar ? "أضف ردًا لا يقل عن 5 أحرف." : "Enter a response of at least 5 characters.");
      return;
    }
    setReturnBusy(order.id); setError(""); setMessage("");
    try {
      const suffix = action === "respond" ? "/response" : action === "received" ? "/received" : action === "close" ? "/close" : "";
      const response = await fetch(`/api/stores/${encodeURIComponent(slug)}/orders/${order.id}/return${suffix}`, {
        method: action === "received" || action === "close" ? "PATCH" : "POST",
        credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "submit"
          ? { resolution: returnResolutions[order.id] ?? "return", reason: returnReasons[order.id] ?? "other", details }
          : action === "respond" ? { decision: "approved", note: details } : {})
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "return");
      setMessage(ar ? "تم تحديث طلب الإرجاع أو الاستبدال." : "Return or exchange request updated.");
      setReturnDetails(v => ({ ...v, [order.id]: "" }));
      setReturnResponses(v => ({ ...v, [order.id]: "" }));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر تحديث الطلب." : "Could not update request.")); }
    finally { setReturnBusy(""); }
  }

  function statusText(status: string) {
    if (status === "accepted") return copy.accepted;
    if (status === "shipped") return copy.shipped;
    if (status === "completed") return copy.completed;
    if (status === "rejected") return copy.rejected;
    if (status === "cancelled") return copy.cancelled;
    return copy.pending;
  }

  function eventTypeText(eventType: string) {
    const labels: Record<string, [string, string]> = {
      "order.created": ["إنشاء الطلب", "Order created"],
      "order.legacy_snapshot": ["سجل سابق قبل تفعيل سجل الأحداث", "Legacy snapshot"],
      "order.status_changed": ["تغيير حالة الطلب", "Order status changed"],
      "shipment.manual_recorded": ["تسجيل بيانات الشحن يدويًا", "Shipment details recorded manually"],
    };
    const label = labels[eventType];
    return label ? label[ar ? 0 : 1] : eventType;
  }

  function sourceText(source: string) {
    const labels: Record<string, [string, string]> = {
      application: ["النظام", "Application"],
      merchant_manual: ["إدخال يدوي من المتجر", "Merchant-entered"],
      owner_manual: ["إدخال يدوي من الإدارة", "Owner-entered"],
      carrier_api: ["واجهة شركة الشحن", "Carrier API"],
      carrier_webhook: ["إشعار شركة الشحن", "Carrier webhook"],
      legacy_migration: ["ترحيل سجل سابق", "Legacy migration"],
    };
    const label = labels[source];
    return label ? label[ar ? 0 : 1] : source;
  }

  return <main className="min-h-screen bg-[#f7f4ec] text-[#14233b]" dir={ar ? "rtl" : "ltr"} lang={locale}>
    <header className="border-b border-[#e5dfd1] bg-white px-5 py-4">
      <Link href="/" className="font-bold tracking-wide">WASLA <span className="text-[#b89545]">وصلة</span></Link>
    </header>
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href={`/store/${encodeURIComponent(slug)}`} className="text-sm font-semibold text-[#9b792f] underline">{copy.back}</Link>
      <h1 className="mt-5 text-3xl font-bold">{copy.title}</h1>
      {canManagePolicy && <Link href={`/store/${encodeURIComponent(slug)}/return-policy`} className="mt-3 inline-block rounded-xl border border-[#b89545] bg-white px-4 py-2 text-sm font-semibold text-[#8a682b]">{ar ? "إدارة سياسة الإرجاع والاستبدال" : "Manage returns & exchanges policy"}</Link>}
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
                    <p className="font-semibold">{eventTypeText(event.eventType)}</p>
                    {(event.fromStatus || event.toStatus) && <p className="mt-1 text-slate-600">{event.fromStatus ? `${copy.from}: ${statusText(event.fromStatus)}` : ""}{event.fromStatus && event.toStatus ? " · " : ""}{event.toStatus ? `${copy.to}: ${statusText(event.toStatus)}` : ""}</p>}
                    <p className="mt-1 text-xs text-slate-500">{copy.eventSource}: {sourceText(event.source)} · {new Date(event.createdAt).toLocaleString(locale)}</p>
                  </li>)}</ol>)}
            </section>
            <div className="mt-4 divide-y divide-[#eee8dc]">
              {order.items.map(line => <div key={line.productId} className="flex flex-wrap justify-between gap-2 py-3">
                <div><p className="font-semibold">{line.title}</p><p className="text-xs text-slate-500">{line.sku || "—"} · {line.quantity} × {line.unitPrice} {line.currency}</p>{isMerchantView && <p className="mt-1 text-xs text-slate-500">{copy.stockAtRequest}: {line.availabilityAtRequest}</p>}</div>
                <p className="font-bold">{(Number(line.unitPrice) * line.quantity).toFixed(2)} {line.currency}</p>
              </div>)}
            </div>
            <p className="mt-3 font-bold">{copy.subtotal}: {order.subtotal} {order.currency}</p>
            <section className="mt-4 rounded-xl border border-[#e5dfd1] bg-[#faf8f3] p-4 text-sm">
              <strong>{ar ? "سياسة الإرجاع وقت الطلب" : "Return policy at order time"}{order.returnPolicyVersion ? ` · v${order.returnPolicyVersion}` : ""}</strong>
              {order.returnPolicySnapshot?.status === "not_provided" || !order.returnPolicySnapshot
                ? <p className="mt-2 leading-6 text-slate-600">{ar ? "لم تكن هناك سياسة منشورة عند إنشاء هذا الطلب. تواصل مع البائع للاستفسار؛ ولا يعني ذلك تلقائيًا رفض الإرجاع أو إسقاط الحقوق القانونية." : "No policy was published when this order was created. Contact the seller; this does not automatically mean returns are refused or legal rights are waived."}</p>
                : <>
                  <p className="mt-2 text-slate-600">{order.returnPolicySnapshot.acceptsReturns ? (ar ? "الإرجاع مقبول حسب السياسة" : "Returns enabled by policy") : (ar ? "الإرجاع غير مفعّل حسب السياسة" : "Returns not enabled by policy")} · {order.returnPolicySnapshot.acceptsExchanges ? (ar ? "الاستبدال مقبول" : "Exchanges enabled") : (ar ? "الاستبدال غير مفعّل" : "Exchanges not enabled")} · {ar ? "المهلة:" : "Window:"} {String(order.returnPolicySnapshot.requestWindowDays ?? "—")} {ar ? "يومًا" : "days"}</p>
                  {typeof order.returnPolicySnapshot[ar ? "itemConditionsAr" : "itemConditionsEn"] === "string" && <p className="mt-2 whitespace-pre-wrap">{String(order.returnPolicySnapshot[ar ? "itemConditionsAr" : "itemConditionsEn"])}</p>}
                  {typeof order.returnPolicySnapshot[ar ? "exclusionsAr" : "exclusionsEn"] === "string" && <p className="mt-2 whitespace-pre-wrap">{ar ? "الاستثناءات: " : "Exclusions: "}{String(order.returnPolicySnapshot[ar ? "exclusionsAr" : "exclusionsEn"])}</p>}
                  {typeof order.returnPolicySnapshot[ar ? "buyerInstructionsAr" : "buyerInstructionsEn"] === "string" && <p className="mt-2 whitespace-pre-wrap">{String(order.returnPolicySnapshot[ar ? "buyerInstructionsAr" : "buyerInstructionsEn"])}</p>}
                  {typeof order.returnPolicySnapshot[ar ? "contactInstructionsAr" : "contactInstructionsEn"] === "string" && <p className="mt-2 whitespace-pre-wrap">{ar ? "التواصل: " : "Contact: "}{String(order.returnPolicySnapshot[ar ? "contactInstructionsAr" : "contactInstructionsEn"])}</p>}
                </>}
              <p className="mt-3 border-t border-[#e5dfd1] pt-2 text-xs leading-6 text-slate-500">{ar ? "تظل الحقوق الإلزامية للمستهلك بموجب القانون محفوظة. طلب الإرجاع لا يعني استردادًا ماليًا تلقائيًا." : "Mandatory consumer rights under applicable law remain unaffected. A return request does not issue an automatic refund."}</p>
            </section>
            {order.carrierName && <div className="mt-4 rounded-xl border border-[#e5dfd1] bg-[#f7f4ec] p-4 text-sm">
              <strong>{copy.tracking}</strong>
              <p className="mt-2">{copy.carrier}: {order.carrierName} · {copy.trackingNumber}: <b dir="ltr">{order.trackingNumber}</b></p>
              {order.trackingUrl && <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[#9b792f] underline">{copy.tracking}: ↗</a>}
              {order.shippedAt && <p className="mt-1 text-xs text-slate-500">{new Date(order.shippedAt).toLocaleString(locale)}</p>}
              {order.deliveryConfirmedAt && <p className="mt-1 text-xs text-slate-500">{copy.completed}: {new Date(order.deliveryConfirmedAt).toLocaleString(locale)}</p>}
            </div>}
            {order.buyerNote && <p className="mt-3 text-sm text-slate-600"><strong>{copy.note}:</strong> {order.buyerNote}</p>}
            {order.merchantNote && <p className="mt-2 text-sm text-slate-600"><strong>{copy.merchantNote}:</strong> {order.merchantNote}</p>}
            {order.returnRequestId && <section className="mt-4 rounded-xl border border-[#d8bd79] bg-[#fff9eb] p-4 text-sm">
              <strong>{ar ? "طلب الإرجاع أو الاستبدال" : "Return or exchange request"} · {order.returnStatus}</strong>
              <p className="mt-2">{ar ? "النوع:" : "Requested resolution:"} {order.returnResolution === "replacement" ? (ar ? "استبدال" : "Replacement") : (ar ? "إرجاع" : "Return")}</p>
              <p className="mt-1">{order.returnDetails}</p>
              {order.returnMerchantResponse && <p className="mt-2 border-t border-[#e8d9b6] pt-2">{ar ? "رد المتجر:" : "Store response:"} {order.returnMerchantResponse}</p>}
              {isMerchantView && order.returnStatus === "submitted" && <div className="mt-3 space-y-2">
                <textarea rows={2} maxLength={2000} value={returnResponses[order.id] ?? ""} onChange={e => setReturnResponses(v => ({ ...v, [order.id]: e.target.value }))} placeholder={ar ? "اكتب رد المتجر..." : "Write the store response..."} className="w-full rounded-lg border border-[#e5dfd1] bg-white p-3" />
                <div className="flex flex-wrap gap-2">
                  <button disabled={returnBusy === order.id || (returnResponses[order.id] ?? "").trim().length < 5} onClick={() => void returnAction(order, "respond")} className="rounded-lg bg-[#14233b] px-4 py-2 font-semibold text-white disabled:opacity-50">{ar ? "الموافقة على الطلب" : "Approve request"}</button>
                  <button disabled={returnBusy === order.id} onClick={async () => {
                    if (returnBusy) return;
                    setReturnBusy(order.id); setError("");
                    try { const response = await fetch(`/api/stores/${encodeURIComponent(slug)}/orders/${order.id}/return/response`, { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body:JSON.stringify({decision:"rejected",note:(returnResponses[order.id] ?? "").trim() || (ar ? "يرجى التواصل مع المتجر لمزيد من التفاصيل." : "Please contact the store for more details.")}) }); const data=await response.json(); if(!response.ok||!data.success) throw new Error(data.error||"return"); await load(); }
                    catch(e){setError(e instanceof Error?e.message:(ar?"تعذر تحديث الطلب.":"Could not update request."));} finally{setReturnBusy("");}
                  }} className="rounded-lg border border-red-700 px-4 py-2 font-semibold text-red-700 disabled:opacity-50">{ar ? "رفض الطلب" : "Reject request"}</button>
                </div>
              </div>}
              {isMerchantView && order.returnStatus === "approved" && order.returnResolution === "return" && <button disabled={returnBusy === order.id} onClick={() => void returnAction(order, "received")} className="mt-3 rounded-lg border border-[#14233b] px-4 py-2 font-semibold">{ar ? "تأكيد استلام المنتج المُعاد" : "Confirm returned item received"}</button>}
              {isMerchantView && order.returnStatus === "approved" && order.returnResolution === "replacement" && <p className="mt-3 text-xs text-slate-600">{ar ? "تمت الموافقة على الاستبدال. تنفيذ شحن البديل سيُفعّل بعد استكمال تكامل الشحن." : "Replacement approved. Dispatching the replacement will be enabled after shipping integration."}</p>}
              {!isMerchantView && <div className="mt-3 space-y-2 border-t border-[#e8d9b6] pt-3">
                <strong>{ar ? "التواصل مع دعم وصلة" : "Contact WASLA support"}</strong>
                <p className="text-xs leading-6 text-slate-600">{ar ? "يمكنك تصعيد الطلب للمراجعة والدعم. هذا لا يمثل حكمًا قانونيًا ولا ينشئ استردادًا ماليًا تلقائيًا." : "You can escalate this request for support review. This is not a legal determination and does not trigger an automatic refund."}</p>
                <select value={escalationReasons[order.id] ?? (order.returnReason === "legal_rights_claim" ? "legal_rights_claim" : "merchant_nonresponse")} onChange={e => setEscalationReasons(v => ({...v,[order.id]:e.target.value}))} className="w-full rounded-lg border border-[#e5dfd1] bg-white p-3">
                  <option value="legal_rights_claim">{ar ? "مراجعة حقوق قانونية" : "Legal rights review"}</option>
                  <option value="merchant_nonresponse">{ar ? "عدم رد المتجر" : "Merchant has not responded"}</option>
                  <option value="dispute">{ar ? "نزاع آخر" : "Other dispute"}</option>
                </select>
                <textarea rows={2} maxLength={3000} value={escalationDetails[order.id] ?? ""} onChange={e => setEscalationDetails(v => ({...v,[order.id]:e.target.value}))} placeholder={ar ? "اشرح سبب طلب الدعم..." : "Explain why you need support..."} className="w-full rounded-lg border border-[#e5dfd1] bg-white p-3" />
                <button disabled={returnBusy === order.id || (escalationDetails[order.id] ?? "").trim().length < 10} onClick={async () => {
                  setReturnBusy(order.id); setError("");
                  try {
                    const response = await fetch(`/api/stores/${encodeURIComponent(slug)}/orders/${order.id}/return/escalation`, { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body:JSON.stringify({reason:escalationReasons[order.id] ?? (order.returnReason === "legal_rights_claim" ? "legal_rights_claim" : "merchant_nonresponse"),details:escalationDetails[order.id]}) });
                    const data = await response.json(); if(!response.ok || !data.success) throw new Error(data.error || "escalation");
                    setEscalationDetails(v => ({...v,[order.id]:""}));
                    setError(ar ? "تم إرسال طلبك إلى دعم وصلة للمراجعة." : "Your request was sent to WASLA support for review.");
                  } catch(e) { setError(e instanceof Error ? e.message : (ar ? "تعذر إرسال طلب الدعم." : "Could not send support request.")); }
                  finally { setReturnBusy(""); }
                }} className="rounded-lg border border-[#b89545] px-4 py-2 font-semibold text-[#8a682b] disabled:opacity-50">{ar ? "تصعيد إلى دعم وصلة" : "Escalate to WASLA support"}</button>
              </div>}
              {!isMerchantView && ["rejected","item_received"].includes(order.returnStatus ?? "") && <button disabled={returnBusy === order.id} onClick={() => void returnAction(order, "close")} className="mt-3 rounded-lg border border-[#14233b] px-4 py-2 font-semibold">{ar ? "إغلاق طلب الإرجاع" : "Close return request"}</button>}
            </section>}
            {!isMerchantView && !order.returnRequestId && ["shipped","completed"].includes(order.status) && <section className="mt-4 space-y-2 rounded-xl border border-[#e5dfd1] p-4">
              <strong>{ar ? "طلب إرجاع أو استبدال" : "Request a return or exchange"}</strong>
              <select value={returnResolutions[order.id] ?? "return"} onChange={e => setReturnResolutions(v => ({...v,[order.id]:e.target.value}))} className="w-full rounded-lg border border-[#e5dfd1] bg-white p-3">
                <option value="return">{ar ? "إرجاع المنتج" : "Return item"}</option><option value="replacement">{ar ? "استبدال المنتج" : "Replace item"}</option>
              </select>
              <select value={returnReasons[order.id] ?? "other"} onChange={e => setReturnReasons(v => ({...v,[order.id]:e.target.value}))} className="w-full rounded-lg border border-[#e5dfd1] bg-white p-3">
                <option value="damaged_or_defective">{ar ? "تالف أو معيب" : "Damaged or defective"}</option><option value="not_as_described">{ar ? "لا يطابق الوصف" : "Not as described"}</option><option value="wrong_item">{ar ? "منتج خاطئ" : "Wrong item"}</option><option value="missing_items">{ar ? "نواقص" : "Missing items"}</option><option value="legal_rights_claim">{ar ? "مطالبة بحقوق المستهلك القانونية" : "Mandatory consumer-rights claim"}</option><option value="other">{ar ? "سبب آخر" : "Other"}</option>
              </select>
              <textarea rows={3} maxLength={3000} value={returnDetails[order.id] ?? ""} onChange={e => setReturnDetails(v => ({...v,[order.id]:e.target.value}))} placeholder={ar ? "اشرح سبب طلبك..." : "Explain your request..."} className="w-full rounded-lg border border-[#e5dfd1] p-3" />
              <button disabled={returnBusy === order.id || (returnDetails[order.id] ?? "").trim().length < 10} onClick={() => void returnAction(order,"submit")} className="rounded-lg bg-[#14233b] px-4 py-2 font-semibold text-white disabled:opacity-50">{ar ? "إرسال طلب الإرجاع أو الاستبدال" : "Submit return or exchange request"}</button>
              <p className="text-xs text-slate-500">{ar ? "يخضع الطلب لسياسة المتجر والقوانين المعمول بها. لا ينفذ هذا الإجراء استردادًا ماليًا أو شحنًا تلقائيًا لبديل." : "Subject to the store policy and applicable law. This request does not issue a refund or automatically dispatch a replacement."}</p>
            </section>}
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
