"use client";

import Link from "next/link";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

export default function SettingsPage() {
  const { locale, setLocale } = useLocale();
  const ar = locale === "ar";
  const rows = [
    { href: "/profile", icon: "◎", title: ar ? "الملف الشخصي والهوية" : "Profile & identity", desc: ar ? "الاسم والصورة والنبذة والروابط" : "Name, photo, bio and links" },
    { href: "/brands", icon: "✧", title: ar ? "هوية العلامة والشعار" : "Brand identity & logo", desc: ar ? "إدارة شعارات علاماتك التجارية" : "Manage your brand logos" },
    { href: "/account", icon: "◉", title: ar ? "الحساب والعضويات" : "Account & memberships", desc: ar ? "إدارة مساحاتك التجارية" : "Manage your business spaces" },
  ];
  return <main className="wasla-settings-page" dir={ar ? "rtl" : "ltr"} lang={locale}>
    <WorkspaceHeader section="account" />
    <div className="wasla-settings-shell">
      <span className="wasla-settings-eyebrow">WASLA ID · CONTROL CENTER</span>
      <h1>{ar ? "الإعدادات والخصوصية" : "Settings & privacy"}</h1>
      <p>{ar ? "تحكم في هويتك وتجربة استخدامك من مكان واحد." : "Manage your identity and experience from one place."}</p>
      <section className="wasla-settings-list">
        <div className="wasla-settings-row"><span>🌐</span><div><strong>{ar ? "لغة المنصة" : "Platform language"}</strong><small>{ar ? "اختر لغة وصلة" : "Choose your WASLA language"}</small></div><button onClick={() => setLocale(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button></div>
        {rows.map(row => <Link href={row.href} className="wasla-settings-row" key={row.href}><span>{row.icon}</span><div><strong>{row.title}</strong><small>{row.desc}</small></div><b>↗</b></Link>)}
      </section>
      <div className="wasla-settings-note">{ar ? "إعدادات الأمان والخصوصية المتقدمة ستضاف مع إطلاق أنظمة الصلاحيات والإشعارات." : "Advanced security and privacy controls will be added with the permissions and notifications systems."}</div>
    </div>
  </main>;
}
