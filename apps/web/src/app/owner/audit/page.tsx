"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../../components/locale-provider";

type AuditEntry = {
  id: string;
  actorEmail: string | null;
  event: string;
  source: string;
  resourceType: string | null;
  resourceId: string | null;
  context: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
};

export default function PlatformAuditPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const ar = locale === "ar";
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) { router.replace("/login"); return; }
    let active = true;
    fetch("/api/platform/audit?limit=100", { credentials: "include", cache: "no-store" })
      .then(async response => {
        if (response.status === 401) { router.replace("/login"); return null; }
        if (response.status === 403) { if (active) setDenied(true); return null; }
        if (!response.ok) throw new Error("audit");
        return response.json();
      })
      .then(data => {
        if (!active || !data) return;
        if (data.success && Array.isArray(data.entries)) setEntries(data.entries);
        else throw new Error("audit");
      })
      .catch(() => { if (active) setError(ar ? "تعذر تحميل سجل التدقيق." : "Could not load the audit log."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isPending, session?.user?.id, router, ar]);

  const styles = {
    page: { minHeight: "100vh", background: "#f7f4ed", color: "#263448", padding: "28px 16px 56px" } as const,
    shell: { width: "min(1180px, 100%)", margin: "0 auto" } as const,
    panel: { background: "#fff", border: "1px solid rgba(115,128,146,.22)", borderRadius: 16, padding: 18, overflowX: "auto" } as const,
    table: { width: "100%", borderCollapse: "collapse" as const, minWidth: 680 } as const,
    cell: { padding: "12px 10px", borderBottom: "1px solid rgba(115,128,146,.16)", textAlign: ar ? "right" as const : "left" as const, verticalAlign: "top" as const } as const,
  };

  const sourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      platform: ar ? "إدارة المنصة" : "Platform",
      trade_opportunity: ar ? "فرص التجارة" : "Trade opportunities",
      trade_brokerage_agreement: ar ? "اتفاقيات الوساطة" : "Brokerage agreements",
      trade_commission: ar ? "سجل العمولات" : "Commission ledger",
      trade_commission_invoice: ar ? "فواتير العمولات" : "Commission invoices",
    };
    return labels[source] || source;
  };
  const eventLabel = (event: string) => {
    const labels: Record<string, string> = {
      submitted: ar ? "تم التقديم" : "Submitted",
      approved: ar ? "تمت الموافقة" : "Approved",
      rejected: ar ? "مرفوض" : "Rejected",
      closed: ar ? "مغلق" : "Closed",
      created: ar ? "تم الإنشاء" : "Created",
      buyer_accepted: ar ? "موافقة المشتري" : "Buyer accepted",
      supplier_accepted: ar ? "موافقة المورد" : "Supplier accepted",
      expired: ar ? "منتهي" : "Expired",
      recorded: ar ? "تم التسجيل" : "Recorded",
      status_changed: ar ? "تغيير الحالة" : "Status changed",
      invoice_created: ar ? "إنشاء فاتورة" : "Invoice created",
      invoice_status_changed: ar ? "تغيير حالة الفاتورة" : "Invoice status changed",
      platform: ar ? "حدث إداري" : "Administrative event",
    };
    return labels[event] || event.replaceAll("_", " ");
  };
  const statusLabel = (value: unknown) => {
    if (typeof value !== "string") return "—";
    const labels: Record<string, string> = {
      draft: ar ? "مسودة" : "Draft",
      issued: ar ? "صادرة" : "Issued",
      paid: ar ? "مدفوعة" : "Paid",
      cancelled: ar ? "ملغاة" : "Cancelled",
      recorded: ar ? "مسجلة" : "Recorded",
      invoiced: ar ? "مفوترَة" : "Invoiced",
      waived: ar ? "متنازل عنها" : "Waived",
      active: ar ? "نشطة" : "Active",
      pending_acceptance: ar ? "بانتظار الموافقة" : "Pending acceptance",
    };
    return labels[value] || value;
  };

  return <main dir={ar ? "rtl" : "ltr"} lang={locale} style={styles.page}>
    <div style={styles.shell}>
      <Link href="/owner" style={{ color: "#9b783d", fontWeight: 700, textDecoration: "none" }}>← {ar ? "العودة إلى مركز المالك" : "Back to owner center"}</Link>
      <span style={{ display: "block", marginTop: 26, color: "#9b783d", fontSize: 12, fontWeight: 800, letterSpacing: ".12em" }}>WASLA / SECURITY / AUDIT</span>
      <h1 style={{ color: "#14243a", margin: "8px 0" }}>{ar ? "سجل تدقيق المنصة" : "Platform audit log"}</h1>
      <p style={{ maxWidth: 780, lineHeight: 1.8 }}>{ar ? "سجل قراءة فقط لأحداث الإدارة والفرص والاتفاقيات والعمولات وفواتيرها. لا يعرض محتوى الرسائل الخاصة أو بيانات الموردين الخاصة." : "Read-only record of administrative changes, trade opportunities, agreements, commissions and invoices. Private message contents and private supplier data are not displayed here."}</p>
      {denied ? <section style={styles.panel}><h2>{ar ? "غير مصرح" : "Access restricted"}</h2><p>{ar ? "هذه الصفحة تتطلب صلاحية قراءة سجل التدقيق." : "This page requires platform audit-read permission."}</p></section> :
       loading ? <p>{ar ? "جارٍ تحميل السجل..." : "Loading audit entries..."}</p> :
       error ? <p role="alert" style={{ color: "#a33d3d" }}>{error}</p> :
       <section style={styles.panel}>
         <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
           <strong>{ar ? "آخر 100 حدث مسجل" : "Latest 100 recorded events"}</strong>
           <span style={{ color: "#738092", fontSize: 12 }}>{entries.length} {ar ? "حدث" : "events"}</span>
         </div>
         <table style={styles.table}>
           <thead><tr>
             {[ar ? "الوقت" : "Time", ar ? "الإجراء" : "Action", ar ? "النوع" : "Resource", ar ? "الحساب" : "Account", ar ? "المتجر" : "Store", ar ? "المنفذ" : "Actor"].map(label => <th key={label} style={styles.cell}>{label}</th>)}
           </tr></thead>
           <tbody>
             {entries.map(entry => <tr key={entry.id}>
               <td style={styles.cell}><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(ar ? "ar" : "en")}</time></td>
               <td style={styles.cell}>{sourceLabel(entry.source)}</td>
               <td style={styles.cell}><strong>{eventLabel(entry.event)}</strong><div style={{ color: "#738092", fontSize: 12 }}>{typeof entry.details?.fromStatus === "string" || typeof entry.details?.toStatus === "string" ? statusLabel(entry.details?.fromStatus) + " → " + statusLabel(entry.details?.toStatus) : ""}</div></td>
               <td style={styles.cell}>{entry.resourceType || "—"}<div style={{ color: "#738092", fontSize: 11 }}>{entry.resourceId || ""}</div></td>
               <td style={styles.cell}>{entry.context || "—"}{typeof entry.details?.note === "string" && entry.details.note ? <div style={{ color: "#738092", fontSize: 12 }}>{entry.details.note}</div> : null}</td>
               <td style={styles.cell}>{entry.actorEmail || (ar ? "النظام" : "System")}</td>
             </tr>)}
           </tbody>
         </table>
         {entries.length === 0 && <p>{ar ? "لا توجد أحداث مسجلة بعد." : "No audit events recorded yet."}</p>}
       </section>}
    </div>
  </main>;
}
