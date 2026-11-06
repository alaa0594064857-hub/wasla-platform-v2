"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../components/locale-provider";

type Access = { roles: string[]; permissions: string[] };

export default function PlatformOwnerPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const ar = locale === "ar";

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) { router.replace("/login"); return; }
    let active = true;
    fetch("/api/platform/security", { credentials: "include", cache: "no-store" })
      .then(async response => {
        if (response.status === 401) { router.replace("/login"); return null; }
        if (response.status === 403) { if (active) setDenied(true); return null; }
        if (!response.ok) throw new Error("security-check-failed");
        return response.json();
      })
      .then(data => {
        if (!active || !data) return;
        if (data.success && Array.isArray(data.platformAccess?.roles) && data.platformAccess.roles.includes("platform_owner")) {
          setAccess({ roles: data.platformAccess.roles, permissions: data.platformAccess.permissions || [] });
        } else setDenied(true);
      })
      .catch(() => { if (active) setDenied(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isPending, session?.user?.id, router]);

  const title = ar ? "لوحة مالك المنصة" : "Platform Owner Console";
  if (isPending || loading) return <main dir={ar ? "rtl" : "ltr"} style={styles.page}><p>{ar ? "جارٍ التحقق من هوية المالك وصلاحياته..." : "Verifying owner identity and permissions..."}</p></main>;
  if (!access || denied) return <main dir={ar ? "rtl" : "ltr"} style={styles.page}><section style={styles.card}><h1>{ar ? "هذه المساحة مخصصة لمالك المنصة" : "This area is restricted to the platform owner"}</h1><p>{ar ? "لم يتم منح هذا الحساب صلاحية الدخول. لم يتم عرض أي بيانات إدارية." : "This account has not been granted access. No administrative data was disclosed."}</p><Link href="/account">{ar ? "العودة إلى حسابي" : "Back to my account"}</Link></section></main>;

  const sections = ar
    ? [["إدارة المنصة", "التحكم العام في تشغيل WASLA وسياساتها."], ["المستخدمون والحسابات", "إدارة المستخدمين وحالات الحسابات."], ["الأدوار والصلاحيات", "تعيين صلاحيات المدراء والموظفين ضمن حدود آمنة."], ["الأمان وسجل التدقيق", "متابعة أحداث الأمان والعمليات الإدارية."], ["الإعدادات والتقارير", "إعدادات المنصة والتقارير الشاملة."]]
    : [["Platform operations", "Global WASLA operations and policies."], ["Users & accounts", "Manage users and account states."], ["Roles & permissions", "Assign limited staff permissions safely."], ["Security & audit log", "Review security events and administrative actions."], ["Settings & reports", "Global platform settings and reporting."]];
  return <main dir={ar ? "rtl" : "ltr"} lang={locale} style={styles.page}>
    <header style={styles.header}><div><span style={styles.eyebrow}>WASLA / PRIVATE CONTROL</span><h1>{title}</h1><p>{ar ? "مساحة إدارية عليا مستقلة لا تظهر إلا بعد تحقق الخادم من ملكية المنصة." : "A separate top-level control space, available only after server-side owner verification."}</p></div><Link href="/account" style={styles.link}>{ar ? "مساحة الحساب ↗" : "Account space ↗"}</Link></header>
    <section style={styles.owner}><span style={styles.mark}>W</span><div><strong>{ar ? "مالك المنصة المعتمد" : "Verified platform owner"}</strong><p>{session?.user?.email}</p><small>{ar ? "تم التحقق من الدور والصلاحيات من قاعدة البيانات" : "Role and permissions verified against the database"}</small></div><span style={styles.status}>{ar ? "وصول موثّق" : "VERIFIED ACCESS"}</span></section>
    <section style={styles.grid}>{sections.map(([name, description], index) => <article key={name} style={styles.tile}><span style={styles.number}>0{index + 1}</span><h2>{name}</h2><p>{description}</p><small>{ar ? "سيتم تفعيل أدوات هذا القسم بعد ربط كل عملية بصلاحيتها واختبارها." : "Tools will be enabled after each action is permission-gated and tested."}</small></article>)}</section>
    <section style={styles.permissions}><h2>{ar ? "صلاحيات المالك الفعلية" : "Effective owner permissions"}</h2><p>{access.permissions.length} {ar ? "صلاحيات محملة من الخادم" : "permissions loaded from the server"}</p><ul>{access.permissions.map(permission => <li key={permission}>{permission}</li>)}</ul></section>
  </main>;
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: "clamp(22px,5vw,64px)", color: "#f6f0df", background: "radial-gradient(ellipse at 85% 0%, #25364d 0%, #111b2a 48%, #0b111b 100%)", fontFamily: "Arial, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap", maxWidth: 1180, margin: "0 auto 30px" },
  eyebrow: { color: "#d6b76b", letterSpacing: 2, fontSize: 11 },
  link: { color: "#e5c77d", textDecoration: "none", border: "1px solid #8e7543", padding: "12px 18px", borderRadius: 12 },
  card: { maxWidth: 650, margin: "10vh auto", padding: 32, background: "#172437", border: "1px solid #34445a", borderRadius: 20 },
  owner: { maxWidth: 1180, margin: "0 auto 28px", display: "flex", alignItems: "center", gap: 18, padding: 22, border: "1px solid #806b42", background: "#172437", borderRadius: 18, flexWrap: "wrap" },
  mark: { display: "grid", placeItems: "center", width: 54, height: 54, borderRadius: 16, color: "#111b2a", background: "linear-gradient(135deg,#f0d994,#b28b42)", fontSize: 25, fontWeight: 800 },
  status: { marginInlineStart: "auto", color: "#d8c080", fontSize: 11, letterSpacing: 1, border: "1px solid #806b42", borderRadius: 30, padding: "8px 12px" },
  grid: { maxWidth: 1180, margin: "0 auto 28px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 },
  tile: { padding: 22, borderRadius: 16, background: "#172437", border: "1px solid #34445a", minHeight: 190 },
  number: { color: "#d6b76b", fontSize: 12, letterSpacing: 2 },
  permissions: { maxWidth: 1180, margin: "0 auto", padding: 22, borderRadius: 16, background: "#121e2e", border: "1px solid #34445a" }
};
