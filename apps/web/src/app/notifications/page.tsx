"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type Notification = {
  id: string;
  type: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string | null;
  bodyEn: string | null;
  actionUrl: string;
  readAt: string | null;
  createdAt: string;
};

export default function NotificationsPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const ar = locale === "ar";
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notifications", { credentials: "include", cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.notifications)) throw new Error("load");
      setItems(data.notifications);
      setUnreadCount(Number(data.unreadCount ?? 0));
    } catch {
      setError(ar ? "تعذر تحميل الإشعارات. حاول تحديث الصفحة." : "Could not load notifications. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [ar, router]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const markRead = async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        setError(ar ? "تعذر تحديث حالة الإشعار." : "Could not update notification status.");
        return false;
      }
      setItems(current => {
        const wasUnread = current.some(item => item.id === id && !item.readAt);
        if (wasUnread) setUnreadCount(count => Math.max(0, count - 1));
        return current.map(item => item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item);
      });
      window.dispatchEvent(new Event("wasla:notifications-updated"));
      return true;
    } catch {
      setError(ar ? "تعذر الاتصال لتحديث الإشعار." : "Could not reach the service to update this notification.");
      return false;
    }
  };

  const openNotification = async (item: Notification) => {
    if (!item.readAt) await markRead(item.id);
    router.push(item.actionUrl);
  };

  const markAllRead = async () => {
    const response = await fetch("/api/notifications/read-all", {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      setError(ar ? "تعذر تحديث حالة الإشعارات." : "Could not update notification status.");
      return;
    }
    setItems(current => current.map(item => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    window.dispatchEvent(new Event("wasla:notifications-updated"));
  };

  const title = ar ? "مركز الإشعارات" : "Notification center";
  const intro = ar
    ? "تنبيهات دعوات الحسابات والرسائل واستفسارات المنتجات وطلبات المتاجر الأعضاء والمتجر الرسمي في مكان واحد."
    : "Account invitations, messages, product inquiries, and member-store and official-store order updates in one place.";

  return <main className="wasla-notifications-page" dir={ar ? "rtl" : "ltr"} lang={locale}>
    <WorkspaceHeader section="account" />
    <div className="wasla-notifications-shell">
      <span className="wasla-notifications-eyebrow">WASLA ID · NOTIFICATION CENTER</span>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>{title}</h1>
          <p className="wasla-notifications-intro">{intro}</p>
        </div>
        <span style={{ borderRadius: 999, padding: "7px 12px", background: "#14243a", color: "#f7f4ed", fontWeight: 700 }}>
          {ar ? `${unreadCount} غير مقروء` : `${unreadCount} unread`}
        </span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "18px 0" }}>
        <button type="button" onClick={() => void loadNotifications()} disabled={loading}>
          {ar ? "تحديث" : "Refresh"}
        </button>
        <button type="button" onClick={() => void markAllRead()} disabled={unreadCount === 0}>
          {ar ? "تعليم الكل كمقروء" : "Mark all as read"}
        </button>
      </div>
      {error && <p role="alert" style={{ color: "#a33d3d", padding: 12 }}>{error}</p>}
      {loading ? <p>{ar ? "جارٍ تحميل الإشعارات..." : "Loading notifications..."}</p> :
        items.length === 0 ? <section className="wasla-notifications-empty">
          <div className="wasla-notifications-symbol">♢</div>
          <h2>{ar ? "لا توجد إشعارات حتى الآن" : "You’re all caught up"}</h2>
          <p>{ar ? "ستظهر هنا التنبيهات الجديدة عندما تصلك دعوة أو رسالة أو استفسار أو طلب متجر." : "New alerts will appear here when you receive an invitation, message, inquiry or store order."}</p>
          <Link href="/account">{ar ? "العودة إلى حسابي" : "Back to my account"} ↗</Link>
        </section> :
        <section aria-label={title} style={{ display: "grid", gap: 10 }}>
          {items.map(item => <article key={item.id} style={{
            display: "grid", gap: 8, padding: 16, borderRadius: 14,
            border: "1px solid rgba(115,128,146,.25)",
            background: item.readAt ? "transparent" : "rgba(198,161,91,.12)",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <strong>{ar ? item.titleAr : item.titleEn}</strong>
              {!item.readAt && <span style={{ width: 8, height: 8, borderRadius: 999, background: "#c6a15b", flex: "0 0 8px", marginTop: 7 }} aria-label={ar ? "غير مقروء" : "Unread"} />}
            </div>
            {(ar ? item.bodyAr : item.bodyEn) && <p style={{ margin: 0, lineHeight: 1.7 }}>{ar ? item.bodyAr : item.bodyEn}</p>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <time dateTime={item.createdAt} style={{ fontSize: 12, opacity: .7 }}>
                {new Date(item.createdAt).toLocaleString(ar ? "ar" : "en")}
              </time>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {!item.readAt && <button type="button" onClick={() => void markRead(item.id)}>
                  {ar ? "تعليم كمقروء" : "Mark as read"}
                </button>}
                <Link href={item.actionUrl} onClick={event => { event.preventDefault(); void openNotification(item); }}>
                  {ar ? "فتح" : "Open"} ↗
                </Link>
              </div>
            </div>
          </article>)}
        </section>}
    </div>
  </main>;
}
