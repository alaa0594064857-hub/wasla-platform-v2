"use client";

import Link from "next/link";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

export default function NotificationsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  return <main className="wasla-notifications-page" dir={ar ? "rtl" : "ltr"} lang={locale}>
    <WorkspaceHeader section="account" />
    <div className="wasla-notifications-shell">
      <span className="wasla-notifications-eyebrow">WASLA ID · NOTIFICATION CENTER</span>
      <h1>{ar ? "مركز الإشعارات" : "Notification center"}</h1>
      <p className="wasla-notifications-intro">{ar ? "كل ما يخص حسابك ومتاجرك وشركاتك وطلباتك سيظهر هنا في مكان واحد." : "Updates about your account, shops, businesses and requests will appear here in one place."}</p>
      <section className="wasla-notifications-empty">
        <div className="wasla-notifications-symbol">♢</div>
        <h2>{ar ? "لا توجد إشعارات حتى الآن" : "You’re all caught up"}</h2>
        <p>{ar ? "مركز الإشعارات أصبح له مكان مستقل. سنربط تنبيهات الصداقة والرسائل والمتاجر والأنشطة به عند تفعيل كل نظام." : "Your notification center has its own space. Friend, message, shop and activity alerts will be connected as each system launches."}</p>
        <Link href="/account">{ar ? "العودة إلى حسابي" : "Back to my account"} ↗</Link>
      </section>
    </div>
  </main>;
}
