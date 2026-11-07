"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "../../../../components/locale-provider";
import WorkspaceHeader from "../../../../components/workspace-header";

type Match = {
  buyer: { id: string; accountId: string; accountName?: string; title: string };
  supplier: { id: string; accountId: string; accountName?: string; title: string };
  score: number;
  reasons: string[];
  warnings: string[];
  readiness: "review_ready" | "needs_information";
};

export default function TradeMatchesPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const ar = locale === "ar";
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/trade/opportunities/matches", { credentials: "include", cache: "no-store" });
      if (response.status === 401) { router.replace("/login"); return; }
      if (response.status === 403) throw new Error(ar ? "هذه الصفحة مخصصة لإدارة WASLA." : "This page is restricted to WASLA administrators.");
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "load");
      setMatches(data.matches ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? "تعذر تحميل المطابقات." : "Could not load matches."));
    } finally { setLoading(false); }
  }, [ar, router]);

  useEffect(() => { void load(); }, [load]);

  const localize = (value: string) => {
    if (!ar) return value;
    const labels: Record<string, string> = {
      "Exact product category": "فئة المنتج متطابقة",
      "Origin country matches": "بلد المنشأ متطابق",
      "Delivery destination matches": "بلد التسليم متطابق",
      "Quantity fits supplier minimum and stated capacity": "الكمية تناسب الحد الأدنى والقدرة المعلنة",
      "Currency matches": "العملة متطابقة",
      "Supplier indicative unit price is within buyer target": "السعر الاسترشادي ضمن ميزانية المشتري",
      "Origin country needs confirmation": "بلد المنشأ يحتاج إلى تأكيد",
      "Delivery destination needs confirmation": "بلد التسليم يحتاج إلى تأكيد",
      "Quantity or supplier minimum needs confirmation": "الكمية أو الحد الأدنى للطلب يحتاج إلى تأكيد",
      "Supplier capacity needs confirmation": "قدرة المورد على توفير الكمية تحتاج إلى تأكيد",
      "Comparable currency quote is missing": "لا توجد عملة عرض قابلة للمقارنة",
      "Comparable price evidence is missing": "لا يوجد إثبات سعر قابل للمقارنة",
    };
    return labels[value] ?? value;
  };

  return <main dir={ar ? "rtl" : "ltr"} lang={locale} style={{ minHeight: "100vh", background: "#f7f4ed", color: "#263448" }}>
    <WorkspaceHeader section="account" />
    <div style={{ width: "min(1080px, calc(100% - 32px))", margin: "0 auto", padding: "28px 0 56px" }}>
      <span style={{ color: "#9b783d", fontSize: 12, fontWeight: 800, letterSpacing: ".12em" }}>WASLA TRADE · MATCHING</span>
      <h1 style={{ color: "#14243a", fontSize: "clamp(26px, 4vw, 38px)", margin: "8px 0" }}>{ar ? "مطابقة طلبات المشترين مع الموردين" : "Buyer and supplier matching"}</h1>
      <p style={{ lineHeight: 1.8, maxWidth: 800 }}>{ar ? "هذه مطابقة استرشادية داخلية للفرص المعتمدة فقط. لا تعني التحقق من هوية الطرف أو صحة السعر أو توفر المخزون أو صلاحية الشحن، ولا تسمح بالتواصل أو تقديم الطرف على أنه موثوق قبل المراجعة." : "Indicative internal matches from approved opportunities only. A match does not verify identity, price, stock or shipping, and does not authorize outreach or a vetted-party claim."}</p>
      {error && <p role="alert" style={{ padding: 12, borderRadius: 10, background: "#f8e7e5", color: "#8f302d" }}>{error}</p>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, margin: "18px 0" }}>
        <strong>{ar ? `النتائج: ${matches.length}` : `Results: ${matches.length}`}</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="/owner/trade/agreements" style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #c6a15b", color: "#14243a", textDecoration: "none" }}>{ar ? "إعداد اتفاقية وساطة" : "Prepare brokerage agreement"}</a>
          <a href="/owner/trade/opportunities" style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #c6a15b", color: "#14243a", textDecoration: "none" }}>{ar ? "مراجعة الطلبات" : "Review submissions"}</a>
          <button type="button" onClick={() => void load()} disabled={loading} style={{ border: "1px solid #c6a15b", borderRadius: 9, padding: "9px 13px", background: "#14243a", color: "#f7f4ed", fontWeight: 700 }}>{ar ? "تحديث" : "Refresh"}</button>
        </div>
      </div>
      {loading ? <p>{ar ? "جارٍ التحميل..." : "Loading..."}</p> : matches.length === 0 ?
        <div style={{ padding: 24, background: "#fff", borderRadius: 14 }}>{ar ? "لا توجد مطابقات حالياً. يلزم اعتماد طلب شراء وعرض مورد متوافقين أولاً." : "No matches yet. Approve a compatible buyer request and supplier offer first."}</div> :
        <div style={{ display: "grid", gap: 14 }}>
          {matches.map((match, index) => <article key={`${match.buyer.id}-${match.supplier.id}`} style={{ background: "#fff", border: "1px solid rgba(115,128,146,.2)", borderRadius: 14, padding: 18, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <strong style={{ color: "#14243a" }}>{ar ? `مطابقة ${index + 1}` : `Match ${index + 1}`}</strong>
              <span style={{ borderRadius: 99, padding: "5px 10px", background: "#f1eadb", color: "#72552b", fontWeight: 800 }}>{match.score}/100</span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{match.readiness === "review_ready" ? (ar ? "معلومات المقارنة مكتملة مبدئياً" : "Comparison information complete") : (ar ? "تحتاج معلومات إضافية" : "Needs more information")}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
              <section style={{ background: "#f7f4ed", padding: 14, borderRadius: 10 }}>
                <small>{ar ? "المشتري" : "Buyer"}</small>
                <h3 style={{ margin: "5px 0", color: "#14243a" }}>{match.buyer.title}</h3>
                <p style={{ margin: 0 }}>{match.buyer.accountName ?? (ar ? "حساب مشتري" : "Buyer account")}</p>
              </section>
              <section style={{ background: "#f7f4ed", padding: 14, borderRadius: 10 }}>
                <small>{ar ? "المورد" : "Supplier"}</small>
                <h3 style={{ margin: "5px 0", color: "#14243a" }}>{match.supplier.title}</h3>
                <p style={{ margin: 0 }}>{match.supplier.accountName ?? (ar ? "حساب مورد" : "Supplier account")}</p>
              </section>
            </div>
            <div>
              <strong>{ar ? "أسباب المطابقة" : "Match reasons"}</strong>
              <ul>{match.reasons.map(reason => <li key={reason}>{localize(reason)}</li>)}</ul>
            </div>
            {match.warnings.length > 0 && <div style={{ borderInlineStart: "3px solid #c6a15b", paddingInlineStart: 12 }}>
              <strong>{ar ? "نواقص يجب التحقق منها" : "Information to verify"}</strong>
              <ul>{match.warnings.map(warning => <li key={warning}>{localize(warning)}</li>)}</ul>
            </div>}
          </article>)}
        </div>}
    </div>
  </main>;
}
