"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale } from "../../../../components/locale-provider";
import WorkspaceHeader from "../../../../components/workspace-header";

type OrderStatus = "placed" | "accepted" | "processing" | "shipped" | "completed" | "cancelled";
type OrderItem = { id: string; productId: string | null; productTitle: string; sku: string | null; unitPrice: string; quantity: number; lineSubtotal: string };
type Order = {
  id: string; orderNumber: string; status: OrderStatus; currency: string; subtotal: string; grandTotal: string;
  shippingAddress: { fullName?: string; phone?: string; addressLine1?: string; addressLine2?: string; city?: string; region?: string; postalCode?: string; countryCode?: string };
  buyerNote: string | null; createdAt: string; buyerUserId: string; buyerName: string; buyerEmail: string; items: OrderItem[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const copy = {
  ar: {
    title: "طلبات المتجر", subtitle: "تابع طلبات المشترين وحدّث حالة تجهيزها وشحنها.",
    back: "العودة إلى المتجر", loading: "جارٍ تحميل الطلبات...", empty: "لا توجد طلبات لهذا المتجر حتى الآن.",
    error: "تعذر تحميل الطلبات أو تنفيذ التحديث.", retry: "إعادة المحاولة", order: "الطلب", buyer: "المشتري",
    date: "تاريخ الطلب", total: "الإجمالي", status: "الحالة", items: "المنتجات", address: "عنوان التوصيل",
    note: "ملاحظة المشتري", accept: "قبول الطلب", process: "بدء التجهيز", ship: "تم الشحن",
    complete: "إكمال الطلب", cancel: "إلغاء الطلب", updating: "جارٍ التحديث...", success: "تم تحديث حالة الطلب.",
    placed: "جديد", accepted: "مقبول", processing: "قيد التجهيز", shipped: "تم الشحن", completed: "مكتمل", cancelled: "ملغي",
    phone: "الهاتف", qty: "الكمية", unitPrice: "سعر الوحدة", lineTotal: "الإجمالي", currency: "العملة",
    cancelReason: "إلغاء من المتجر", transitionReason: "تحديث حالة الطلب من المتجر",
  },
  en: {
    title: "Shop orders", subtitle: "Review buyer orders and update their fulfillment and shipping status.",
    back: "Back to shop", loading: "Loading orders...", empty: "This shop has no orders yet.",
    error: "Could not load orders or apply the update.", retry: "Try again", order: "Order", buyer: "Buyer",
    date: "Order date", total: "Total", status: "Status", items: "Items", address: "Delivery address",
    note: "Buyer note", accept: "Accept order", process: "Start processing", ship: "Mark as shipped",
    complete: "Complete order", cancel: "Cancel order", updating: "Updating...", success: "Order status updated.",
    placed: "New", accepted: "Accepted", processing: "Processing", shipped: "Shipped", completed: "Completed", cancelled: "Cancelled",
    phone: "Phone", qty: "Qty", unitPrice: "Unit price", lineTotal: "Line total", currency: "Currency",
    cancelReason: "Cancelled by store", transitionReason: "Order status updated by store",
  },
};

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ShopOrdersPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { locale } = useLocale();
  const t = copy[locale];
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dir = locale === "ar" ? "rtl" : "ltr";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/stores/${encodeURIComponent(slug)}/orders`, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      setOrders(data.orders as Order[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally {
      setLoading(false);
    }
  }, [slug, t.error]);

  useEffect(() => { void load(); }, [load]);

  async function changeStatus(order: Order, status: OrderStatus) {
    setUpdatingId(order.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/stores/${encodeURIComponent(slug)}/orders/${order.id}/status`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason: status === "cancelled" ? t.cancelReason : t.transitionReason }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      setOrders(current => current.map(item => item.id === order.id ? { ...item, status } : item));
      setMessage(t.success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally {
      setUpdatingId(null);
    }
  }

  function actions(order: Order) {
    const transitions: Partial<Record<OrderStatus, { status: OrderStatus; label: string }[]>> = {
      placed: [{ status: "accepted", label: t.accept }, { status: "cancelled", label: t.cancel }],
      accepted: [{ status: "processing", label: t.process }, { status: "cancelled", label: t.cancel }],
      processing: [{ status: "shipped", label: t.ship }, { status: "cancelled", label: t.cancel }],
      shipped: [{ status: "completed", label: t.complete }],
    };
    return transitions[order.status] ?? [];
  }

  return (
    <main className="shops-page" lang={locale} dir={dir}>
      <WorkspaceHeader section="shops" />
      <section className="shops-main">
        <div className="shops-heading">
          <div>
            <span className="shops-eyebrow">WASLA SHOPS / ORDERS</span>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
          <div className="shops-heading-icon" aria-hidden="true">W</div>
        </div>
        <div className="shops-section-title">
          <Link href={`/shops/${encodeURIComponent(slug)}`} className="shops-back-link">← {t.back}</Link>
          <span>{orders.length}</span>
        </div>
        {error && <div className="shops-alert" role="alert">{error}<button type="button" onClick={() => void load()}>{t.retry}</button></div>}
        {message && <div className="shops-success" role="status">{message}</div>}
        {loading ? <div className="shops-empty">{t.loading}</div> : orders.length === 0 ? (
          <div className="shops-empty">{t.empty}</div>
        ) : (
          <div className="shops-grid">
            {orders.map(order => (
              <article className="shops-create-card" key={order.id}>
                <div className="shops-card-top">
                  <span className="shops-eyebrow">{t.order} · {order.orderNumber}</span>
                  <span className={`shops-status ${order.status === "completed" ? "is-active" : ""}`}>{t[order.status]}</span>
                </div>
                <h2>{order.buyerName || t.buyer}</h2>
                <p dir="ltr">{order.buyerEmail}</p>
                <div className="shops-info-row"><small>{t.date}</small><strong>{formatDate(order.createdAt, locale)}</strong></div>
                <div className="shops-info-row"><small>{t.total}</small><strong>{order.grandTotal} {order.currency}</strong></div>
                <h3>{t.items}</h3>
                <div className="shops-order-items">
                  {order.items.map(item => (
                    <div className="shops-info-row" key={item.id}>
                      <span>{item.productTitle} × {item.quantity}</span>
                      <strong>{item.lineSubtotal} {order.currency}</strong>
                    </div>
                  ))}
                </div>
                <h3>{t.address}</h3>
                <p>{[order.shippingAddress?.fullName, order.shippingAddress?.addressLine1, order.shippingAddress?.addressLine2, order.shippingAddress?.city, order.shippingAddress?.region, order.shippingAddress?.postalCode, order.shippingAddress?.countryCode].filter(Boolean).join("، ")}</p>
                <p dir="ltr">{order.shippingAddress?.phone}</p>
                {order.buyerNote && <p><strong>{t.note}: </strong>{order.buyerNote}</p>}
                <div className="shops-order-actions">
                  {actions(order).map(action => (
                    <button key={action.status} type="button" disabled={updatingId !== null} onClick={() => void changeStatus(order, action.status)}>
                      {updatingId === order.id ? t.updating : action.label}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
