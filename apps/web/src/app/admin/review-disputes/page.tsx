"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import WorkspaceHeader from "@/components/workspace-header";

type Dispute = {
  id: string; reviewId: string; reason: string; status: string; createdAt: string;
  details?: string | null; rating: number; title: string | null; body: string; productTitle: string;
};
export default function AdminReviewDisputesPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [reports, setReports] = useState<Dispute[]>([]);
  const [appeals, setAppeals] = useState<Dispute[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const t = {
    title: ar ? "بلاغات التقييمات والاعتراضات" : "Review reports & appeals",
    intro: ar ? "تعامل مع البلاغات والاعتراضات بصلاحيات إدارة المنصة. كل قرار يسجل في سجل التدقيق." : "Resolve review reports and appeals with platform permissions. Every decision is audit logged.",
    reports: ar ? "البلاغات المفتوحة" : "Open reports",
    appeals: ar ? "الاعتراضات المفتوحة" : "Open appeals",
    empty: ar ? "لا توجد عناصر مفتوحة." : "No open items.",
    load: ar ? "جارٍ التحميل..." : "Loading...",
    note: ar ? "ملاحظة القرار (اختيارية)" : "Decision note (optional)",
    dismiss: ar ? "إغلاق البلاغ دون إجراء" : "Dismiss report",
    action: ar ? "إخفاء التقييم واتخاذ إجراء" : "Action & hide review",
    reviewed: ar ? "مراجعة فقط" : "Mark reviewed",
    uphold: ar ? "تأييد الرفض/الإخفاء" : "Uphold decision",
    overturn: ar ? "قبول الاعتراض وإعادة التقييم للمراجعة" : "Overturn & return to moderation",
    back: ar ? "العودة لإدارة التقييمات" : "Back to review moderation",
    error: ar ? "تعذر إكمال العملية. تحقق من صلاحياتك." : "Could not complete the action. Check your permissions.",
    success: ar ? "تم حفظ القرار وتسجيله." : "Decision saved and audit logged.",
    working: ar ? "جارٍ الحفظ..." : "Saving...",
    reason: ar ? "السبب" : "Reason",
    product: ar ? "المنتج" : "Product",
    date: ar ? "التاريخ" : "Submitted",
  };
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/platform/review-disputes", { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true || !Array.isArray(data.reports) || !Array.isArray(data.appeals)) throw new Error(data.error || t.error);
      setReports(data.reports); setAppeals(data.appeals);
    } catch (e) { setError(e instanceof Error ? e.message : t.error); }
    finally { setLoading(false); }
  }, [ar]);
  useEffect(() => { void load(); }, [load]);
  async function decide(kind: "report" | "appeal", item: Dispute, status: string) {
    if (busy) return;
    setBusy(item.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/platform/review-disputes/" + kind + "/" + item.id, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: notes[item.id] || "" }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      setMessage(t.success); await load();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); }
    finally { setBusy(""); }
  }
  function card(item: Dispute, kind: "report" | "appeal") {
    return <article key={item.id} style={{ background: "#fff", border: "1px solid #e5dfd4", borderRadius: 14, padding: 18 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>{item.title || item.productTitle}</h3>
      <p style={{ color: "#596779", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{item.body}</p>
      <p style={{ fontSize: 13, color: "#697587" }}>{t.product}: {item.productTitle} · {t.reason}: {item.reason} · {t.date}: {new Date(item.createdAt).toLocaleDateString(locale === "ar" ? "ar" : "en")}</p>
      {item.details && <p style={{ padding: 12, background: "#f7f4ed", borderRadius: 8 }}>{item.details}</p>}
      <label style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{t.note}
        <textarea maxLength={1000} rows={2} value={notes[item.id] || ""} onChange={e => setNotes(v => ({ ...v, [item.id]: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 6, padding: 10, border: "1px solid #d8d3c9", borderRadius: 8, font: "inherit" }} />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {(kind === "report" ? [
          ["dismissed", t.dismiss], ["reviewed", t.reviewed], ["actioned", t.action],
        ] : [["upheld", t.uphold], ["overturned", t.overturn]]).map(([status, label]) =>
          <button key={status} disabled={busy === item.id} onClick={() => void decide(kind, item, status)} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #cfc8ba", background: status === "actioned" || status === "overturned" ? "#14243a" : "#fff", color: status === "actioned" || status === "overturned" ? "#fff" : "#14243a", fontWeight: 700, opacity: busy === item.id ? .6 : 1 }}>{busy === item.id ? t.working : label}</button>
        )}
      </div>
    </article>;
  }
  return <main lang={locale} dir={ar ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: "#f7f4ed", color: "#14243a" }}>
    <WorkspaceHeader section="account" />
    <div style={{ width: "min(1100px, calc(100% - 32px))", margin: "32px auto 64px" }}>
      <Link href="/admin/reviews" style={{ color: "#806638", fontSize: 13 }}>{t.back}</Link>
      <h1 style={{ fontSize: "clamp(26px, 4vw, 38px)", margin: "20px 0 8px" }}>{t.title}</h1>
      <p style={{ color: "#647184", lineHeight: 1.8 }}>{t.intro}</p>
      {error && <p role="alert" style={{ padding: 12, background: "#fff0eb", borderRadius: 8 }}>{error} <button onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Retry"}</button></p>}
      {message && <p role="status" style={{ padding: 12, background: "#edf6ef", borderRadius: 8 }}>{message}</p>}
      {loading ? <p>{t.load}</p> : <>
        <section style={{ marginTop: 24 }}><h2>{t.reports} ({reports.length})</h2>
          {reports.length ? <div style={{ display: "grid", gap: 12 }}>{reports.map(x => card(x, "report"))}</div> : <p>{t.empty}</p>}
        </section>
        <section style={{ marginTop: 32 }}><h2>{t.appeals} ({appeals.length})</h2>
          {appeals.length ? <div style={{ display: "grid", gap: 12 }}>{appeals.map(x => card(x, "appeal"))}</div> : <p>{t.empty}</p>}
        </section>
      </>}
    </div>
  </main>;
}
