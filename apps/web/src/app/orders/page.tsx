"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type OrderStatus = "placed" | "accepted" | "processing" | "shipped" | "completed" | "cancelled";
type OrderItem = { id: string; productId: string | null; productTitle: string; sku: string | null; unitPrice: string; quantity: number; lineSubtotal: string };
type Order = {
  id: string; orderNumber: string; storeId: string; status: OrderStatus; currency: string;
  subtotal: string; grandTotal: string; createdAt: string;
  shippingAddress?: { fullName?: string; addressLine1?: string; addressLine2?: string; city?: string; region?: string; postalCode?: string; countryCode?: string; phone?: string };
  items?: OrderItem[];
};
type SourcingOrder = {
  id: string; orderNumber: string; status: string; currency: string;
  subtotal: string; shippingTotal: string; grandTotal: string; createdAt: string;
  itemName: string; quantity: number; unit: string; destinationCity: string;
  destinationCountryCode: string; supplierName: string; trackingReference?: string | null; carrier?: string | null;
};

const words = {
  ar: {
    title: "طلباتي", subtitle: "تابع طلبات المتاجر وطلبات التوريد وعروض الموردين.",
    loading: "جارٍ تحميل طلباتك...", empty: "لم تنفذ أي طلب بعد. ابدأ استكشاف المتاجر والمنتجات.",
    explore: "استكشاف المنتجات", error: "تعذر تحميل الطلبات.", retry: "إعادة المحاولة",
    order: "طلب", date: "التاريخ", total: "الإجمالي", status: "الحالة", details: "تفاصيل الطلب",
    hide: "إخفاء التفاصيل", items: "المنتجات", address: "عنوان التوصيل", phone: "الهاتف",
    placed: "جديد", accepted: "مقبول", processing: "قيد التجهيز", shipped: "تم الشحن",
    completed: "مكتمل", cancelled: "ملغي", quantity: "الكمية", sourcingTitle: "طلبات التوريد المعتمدة", supplier: "المورد", destination: "التسليم", shipping: "الشحن", awaiting_payment: "بانتظار الدفع", payment_pending: "الدفع قيد المعالجة", paid: "مدفوع", fulfilment_pending: "بانتظار تجهيز المورد", shipped: "تم الشحن", completed: "مكتمل", cancelled: "ملغي", tracking: "رقم التتبع", carrier: "شركة الشحن",
  },
  en: {
    title: "My orders", subtitle: "Track shop purchases and supplier-sourced orders in one place.",
    loading: "Loading your orders...", empty: "You have not placed an order yet. Explore shops and products to get started.",
    explore: "Explore products", error: "Could not load your orders.", retry: "Try again",
    order: "Order", date: "Date", total: "Total", status: "Status", details: "Order details",
    hide: "Hide details", items: "Items", address: "Delivery address", phone: "Phone",
    placed: "New", accepted: "Accepted", processing: "Processing", shipped: "Shipped",
    completed: "Completed", cancelled: "Cancelled", quantity: "Quantity", sourcingTitle: "Accepted sourcing orders", supplier: "Supplier", destination: "Delivery", shipping: "Shipping", awaiting_payment: "Awaiting payment", payment_pending: "Payment pending", paid: "Paid", fulfilment_pending: "Awaiting supplier fulfilment", shipped: "Shipped", completed: "Completed", cancelled: "Cancelled", tracking: "Tracking reference", carrier: "Carrier",
  },
};

function dateLabel(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function BuyerOrdersPage() {
  const { locale } = useLocale();
  const t = words[locale];
  const [orders, setOrders] = useState<Order[]>([]);
  const [sourcingOrders, setSourcingOrders] = useState<SourcingOrder[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const dir = locale === "ar" ? "rtl" : "ltr";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/orders", { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      setOrders(data.orders as Order[]);
      setSourcingOrders((data.sourcingOrders ?? []) as SourcingOrder[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally {
      setLoading(false);
    }
  }, [t.error]);

  useEffect(() => { void load(); }, [load]);

  async function toggleDetails(order: Order) {
    if (expanded === order.id) { setExpanded(null); return; }
    setExpanded(order.id);
    if (order.items) return;
    setLoadingDetails(order.id);
    setError("");
    try {
      const response = await fetch(`/api/orders/${order.id}`, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      setOrders(current => current.map(item => item.id === order.id ? data.order as Order : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
      setExpanded(null);
    } finally {
      setLoadingDetails(null);
    }
  }

  return (
    <main className="shops-page" lang={locale} dir={dir}>
      <WorkspaceHeader section="account" />
      <section className="shops-main">
        <div className="shops-heading">
          <div><span className="shops-eyebrow">WASLA / BUYER SPACE</span><h1>{t.title}</h1><p>{t.subtitle}</p></div>
          <div className="shops-heading-icon" aria-hidden="true">W</div>
        </div>
        {error && <div className="shops-alert" role="alert">{error}<button type="button" onClick={() => void load()}>{t.retry}</button></div>}
        {!loading && sourcingOrders.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <div className="shops-heading"><div><h2>{t.sourcingTitle}</h2></div></div>
            <div className="shops-grid">
              {sourcingOrders.map(order => (
                <article className="shops-create-card" key={order.id}>
                  <div className="shops-card-top">
                    <span className="shops-eyebrow">{t.order} · {order.orderNumber}</span>
                    <span className="shops-status">{t[order.status as keyof typeof t] ?? order.status}</span>
                  </div>
                  <h3>{order.itemName}</h3>
                  <div className="shops-info-row"><small>{t.supplier}</small><strong>{order.supplierName}</strong></div>
                  <div className="shops-info-row"><small>{t.quantity}</small><strong>{order.quantity} {order.unit}</strong></div>
                  <div className="shops-info-row"><small>{t.destination}</small><strong>{order.destinationCity}, {order.destinationCountryCode}</strong></div>
                  <div className="shops-info-row"><small>{t.shipping}</small><strong>{order.shippingTotal} {order.currency}</strong></div>
                  <div className="shops-info-row"><small>{t.total}</small><strong>{order.grandTotal} {order.currency}</strong></div>
                  <div className="shops-info-row"><small>{t.date}</small><strong>{dateLabel(order.createdAt, locale)}</strong></div>
                  {order.trackingReference && <div className="shops-info-row"><small>{t.tracking}</small><strong dir="ltr">{order.trackingReference}</strong></div>}
                  {order.carrier && <div className="shops-info-row"><small>{t.carrier}</small><strong>{order.carrier}</strong></div>}
                </article>
              ))}
            </div>
          </section>
        )}
        {loading ? <div className="shops-empty">{t.loading}</div> : orders.length === 0 && sourcingOrders.length === 0 ? (
          <div className="shops-empty"><p>{t.empty}</p><Link href="/search">{t.explore} ↗</Link></div>
        ) : (
          <div className="shops-grid">
            {orders.map(order => (
              <article className="shops-create-card" key={order.id}>
                <div className="shops-card-top">
                  <span className="shops-eyebrow">{t.order} · {order.orderNumber}</span>
                  <span className={`shops-status ${order.status === "completed" ? "is-active" : ""}`}>{t[order.status]}</span>
                </div>
                <div className="shops-info-row"><small>{t.date}</small><strong>{dateLabel(order.createdAt, locale)}</strong></div>
                <div className="shops-info-row"><small>{t.total}</small><strong>{order.grandTotal} {order.currency}</strong></div>
                <button type="button" className="shops-order-details-toggle" disabled={loadingDetails !== null} onClick={() => void toggleDetails(order)}>
                  {loadingDetails === order.id ? t.loading : expanded === order.id ? t.hide : t.details}
                </button>
                {expanded === order.id && order.items && (
                  <div className="shops-order-detail-body">
                    <h3>{t.items}</h3>
                    {order.items.map(item => <div className="shops-info-row" key={item.id}><span>{item.productTitle} × {item.quantity}</span><strong>{item.lineSubtotal} {order.currency}</strong></div>)}
                    <h3>{t.address}</h3>
                    <p>{[order.shippingAddress?.fullName, order.shippingAddress?.addressLine1, order.shippingAddress?.addressLine2, order.shippingAddress?.city, order.shippingAddress?.region, order.shippingAddress?.postalCode, order.shippingAddress?.countryCode].filter(Boolean).join("، ")}</p>
                    <p dir="ltr">{order.shippingAddress?.phone}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
