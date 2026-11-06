"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import WorkspaceHeader from "../../../components/workspace-header";

type SupplierOrder = {
  id: string; order_number: string; status: string; currency: string;
  subtotal: string; shipping_total: string; grand_total: string; created_at: string;
  item_name: string; description: string | null; quantity: number; unit: string;
  destination_city: string; destination_country_code: string;
  supplier_account_id: string; supplier_name: string;
};

const words = {
  ar: {
    title: "طلبات المورد", subtitle: "تابع الطلبات التي اختار فيها المشترون عروض حساباتك.",
    loading: "جارٍ تحميل الطلبات...", empty: "لا توجد طلبات توريد مرتبطة بحساباتك حالياً.",
    refresh: "تحديث", order: "طلب", item: "المنتج", quantity: "الكمية",
    destination: "التسليم", buyerTotal: "قيمة الطلب", supplier: "حساب المورد",
    awaiting_payment: "بانتظار الدفع", payment_pending: "الدفع قيد المعالجة",
    paid: "مدفوع", fulfilment_pending: "بانتظار التجهيز", shipped: "تم الشحن",
    completed: "مكتمل", cancelled: "ملغي", prepare: "تأكيد بدء التجهيز",
    markShipped: "تأكيد الشحن", tracking: "رقم التتبع", carrier: "شركة الشحن (اختياري)",
    save: "حفظ التحديث", saving: "جارٍ الحفظ...", noTracking: "أدخل رقم التتبع قبل تأكيد الشحن.",
    error: "تعذر تحميل أو تحديث الطلبات.", done: "تم تحديث حالة الطلب.",
    paymentNote: "لا يمكن بدء التجهيز قبل تأكيد الدفع من نظام الدفع."
  },
  en: {
    title: "Supplier orders", subtitle: "Track orders where buyers selected offers from your supplier accounts.",
    loading: "Loading orders...", empty: "No sourcing orders are linked to your accounts yet.",
    refresh: "Refresh", order: "Order", item: "Product", quantity: "Quantity",
    destination: "Delivery", buyerTotal: "Order value", supplier: "Supplier account",
    awaiting_payment: "Awaiting payment", payment_pending: "Payment pending",
    paid: "Paid", fulfilment_pending: "Preparing", shipped: "Shipped",
    completed: "Completed", cancelled: "Cancelled", prepare: "Confirm preparation started",
    markShipped: "Confirm shipment", tracking: "Tracking reference", carrier: "Carrier (optional)",
    save: "Save update", saving: "Saving...", noTracking: "Enter a tracking reference before shipping.",
    error: "Could not load or update orders.", done: "Order status updated.",
    paymentNote: "Preparation cannot start until payment is confirmed by the payment system."
  }
};

export default function SupplierOrdersPage() {
  const { locale } = useLocale();
  const t = words[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tracking, setTracking] = useState<Record<string,string>>({});
  const [carriers, setCarriers] = useState<Record<string,string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/supplier/sourcing-orders", { credentials:"include", cache:"no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      setOrders(data.orders as SupplierOrder[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
    finally { setLoading(false); }
  }, [t.error]);

  useEffect(() => { void load(); }, [load]);

  async function update(order: SupplierOrder, status: "fulfilment_pending" | "shipped") {
    if (status === "shipped" && (tracking[order.id] ?? "").trim().length < 3) {
      setError(t.noTracking); return;
    }
    setSaving(order.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/supplier/sourcing-orders/${encodeURIComponent(order.id)}/status`, {
        method:"PATCH", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          status,
          ...(status === "shipped" ? { trackingReference: tracking[order.id].trim(), carrier: (carriers[order.id] ?? "").trim() || undefined } : {})
        })
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      setMessage(t.done);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
    finally { setSaving(null); }
  }

  const date = (value:string) => new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
  const statusLabel = (status:string) => t[status as keyof typeof t] ?? status;

  return <main className="shops-page" lang={locale} dir={dir}>
    <WorkspaceHeader section="business"/>
    <section className="shops-main">
      <div className="shops-heading"><div><span className="shops-eyebrow">WASLA / SUPPLIER WORKSPACE</span><h1>{t.title}</h1><p>{t.subtitle}</p></div><div className="shops-heading-icon">W</div></div>
      {error && <div className="shops-alert" role="alert">{error}</div>}
      {message && <div className="shops-alert" role="status">{message}</div>}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
        <button type="button" className="shops-order-details-toggle" onClick={()=>void load()} disabled={loading}>{t.refresh}</button>
      </div>
      {loading ? <div className="shops-empty">{t.loading}</div> : orders.length === 0 ? <div className="shops-empty">{t.empty}</div> :
        <div className="shops-grid">{orders.map(order=><article className="shops-create-card" key={order.id}>
          <div className="shops-card-top"><span className="shops-eyebrow">{t.order} · {order.order_number}</span><span className="shops-status">{statusLabel(order.status)}</span></div>
          <h3>{order.item_name}</h3>
          {order.description && <p>{order.description}</p>}
          <div className="shops-info-row"><small>{t.supplier}</small><strong>{order.supplier_name}</strong></div>
          <div className="shops-info-row"><small>{t.quantity}</small><strong>{order.quantity} {order.unit}</strong></div>
          <div className="shops-info-row"><small>{t.destination}</small><strong>{order.destination_city}, {order.destination_country_code}</strong></div>
          <div className="shops-info-row"><small>{t.buyerTotal}</small><strong>{order.grand_total} {order.currency}</strong></div>
          <div className="shops-info-row"><small>{t.order}</small><strong>{date(order.created_at)}</strong></div>
          {order.status === "awaiting_payment" || order.status === "payment_pending" ? <p>{t.paymentNote}</p> : null}
          {order.status === "paid" && <button type="button" className="shops-primary-button" disabled={saving!==null} onClick={()=>void update(order,"fulfilment_pending")}>{saving===order.id?t.saving:t.prepare}</button>}
          {order.status === "fulfilment_pending" && <div style={{display:"grid",gap:10}}>
            <label style={{display:"grid",gap:6}}>{t.tracking}<input required minLength={3} maxLength={120} value={tracking[order.id]??""} onChange={e=>setTracking(v=>({...v,[order.id]:e.target.value}))} style={{padding:12,borderRadius:10}}/></label>
            <label style={{display:"grid",gap:6}}>{t.carrier}<input maxLength={80} value={carriers[order.id]??""} onChange={e=>setCarriers(v=>({...v,[order.id]:e.target.value}))} style={{padding:12,borderRadius:10}}/></label>
            <button type="button" className="shops-primary-button" disabled={saving!==null} onClick={()=>void update(order,"shipped")}>{saving===order.id?t.saving:t.markShipped}</button>
          </div>}
        </article>)}</div>}
    </section>
  </main>;
}
