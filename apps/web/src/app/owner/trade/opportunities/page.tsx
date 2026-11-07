"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import WorkspaceHeader from "../../../components/workspace-header";

type Opportunity = {
  id: string;
  account_id: string;
  account_name: string;
  opportunity_type: "buyer_request" | "supplier_offer";
  title: string;
  description: string;
  product_category: string | null;
  quantity: string | null;
  quantity_unit: string | null;
  target_country: string | null;
  destination_country: string | null;
  currency: string | null;
  target_unit_price: string | null;
  minimum_order_quantity: string | null;
  delivery_terms: string | null;
  evidence_url: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export default function TradeOpportunityReviewPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const ar = locale === "ar";
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/trade/opportunities/review", { credentials: "include", cache: "no-store" });
      if (response.status === 401) { router.replace("/login"); return; }
      if (response.status === 403) throw new Error(ar ? "هذه الصفحة مخصصة لإدارة WASLA." : "This page is restricted to WASLA platform administrators.");
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "load");
      setItems(data.opportunities ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? "تعذر تحميل الطلبات." : "Could not load opportunities."));
    } finally { setLoading(false); }
  }, [ar, router]);

  useEffect(() => { void load(); }, [load]);

  const review = async (item: Opportunity, reviewStatus: "approved" | "rejected" | "closed") => {
    setBusyId(item.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/trade/opportunities/${item.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus, note: note[item.id] ?? "" }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "review");
      setNotice(ar ? "تم تحديث قرار المراجعة." : "Review decision saved.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? "تعذرت المراجعة." : "Could not save review."));
    } finally { setBusyId(""); }
  };

  const input = { width: "100%", boxSizing: "border-box" as const, padding: 11, borderRadius: 9, border: "1px solid rgba(115,128,146,.35)", background: "transparent", color: "inherit" };
  const button = { border: "1px solid #c6a15b", borderRadius: 9, padding: "9px 13px", background: "#14243a", color: "#f7f4ed", fontWeight: 700, cursor: "pointer" as const };

  return <main dir={ar ? "rtl" : "ltr"} lang={locale} style={{ minHeight: "100vh", background: "#f7f4ed", color: "#263448" }}>
    <WorkspaceHeader section="account" />
    <div style={{ width: "min(1080px, calc(100% - 32px))", margin: "0 auto", padding: "28px 0 56px" }}>
      <span style={{ color: "#9b783d", fontSize: 12, fontWeight: 800, letterSpacing: ".12em" }}>WASLA TRADE · OWNER REVIEW</span>
      <h1 style={{ color: "#14243a", fontSize: "clamp(26px, 4vw, 38px)", margin: "8px 0" }}>{ar ? "مراجعة طلبات الشراء وفرص الموردين" : "Buyer and supplier opportunity review"}</h1>
      <p style={{ lineHeight: 1.8, maxWidth: 780 }}>{ar ? "كل طلب هنا خاص وغير متاح للمطابقة قبل مراجعة الإدارة. الاعتماد يعني السماح بالانتقال إلى مرحلة التحقق والمطابقة، وليس إعلان الطرف موثوقاً أو ضمان الصفقة." : "Submissions remain private until reviewed. Approval permits progression to verification and matching; it does not certify a party or guarantee a transaction."}</p>
      {error && <p role="alert" style={{ padding: 12, borderRadius: 10, background: "#f8e7e5", color: "#8f302d" }}>{error}</p>}
      {notice && <p role="status" style={{ padding: 12, borderRadius: 10, background: "#e8f0e9", color: "#245b3b" }}>{notice}</p>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, margin: "18px 0" }}>
        <strong>{ar ? `طلبات بانتظار المراجعة: ${items.length}` : `Pending review: ${items.length}`}</strong>
        <button type="button" onClick={() => void load()} disabled={loading} style={{ ...button, background: "transparent", color: "#14243a" }}>{ar ? "تحديث" : "Refresh"}</button>
      </div>
      {loading ? <p>{ar ? "جارٍ التحميل..." : "Loading..."}</p> : items.length === 0 ?
        <div style={{ padding: 24, background: "#fff", borderRadius: 14 }}>{ar ? "لا توجد طلبات جديدة للمراجعة." : "No new opportunities to review."}</div> :
        <div style={{ display: "grid", gap: 14 }}>
          {items.map(item => <article key={item.id} style={{ background: "#fff", border: "1px solid rgba(115,128,146,.2)", borderRadius: 14, padding: 18, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong style={{ color: "#14243a", fontSize: 18 }}>{item.title}</strong>
                <p style={{ margin: "5px 0", opacity: .7 }}>{item.account_name} · {item.opportunity_type === "buyer_request" ? (ar ? "طلب شراء" : "Buyer request") : (ar ? "عرض مورد" : "Supplier offer")}</p>
              </div>
              <small style={{ opacity: .65 }}>{new Date(item.created_at).toLocaleString(ar ? "ar" : "en")}</small>
            </div>
            <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.8, margin: 0 }}>{item.description}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 8, fontSize: 13 }}>
              {item.product_category && <span>{ar ? "الفئة" : "Category"}: {item.product_category}</span>}
              {item.quantity && <span>{ar ? "الكمية" : "Quantity"}: {item.quantity} {item.quantity_unit ?? ""}</span>}
              {item.target_country && <span>{ar ? "بلد المنشأ" : "Origin"}: {item.target_country}</span>}
              {item.destination_country && <span>{ar ? "بلد التسليم" : "Destination"}: {item.destination_country}</span>}
              {item.target_unit_price !== null && <span>{ar ? "السعر المستهدف" : "Target price"}: {item.target_unit_price} {item.currency}</span>}
              {item.minimum_order_quantity && <span>{ar ? "MOQ" : "MOQ"}: {item.minimum_order_quantity}</span>}
              {item.delivery_terms && <span>{ar ? "شروط التسليم" : "Delivery terms"}: {item.delivery_terms}</span>}
            </div>
            {item.evidence_url && <a href={item.evidence_url} target="_blank" rel="noreferrer" style={{ color: "#765a2f" }}>{ar ? "فتح رابط الإثبات" : "Open evidence link"}</a>}
            <label style={{ display: "grid", gap: 6 }}>{ar ? "ملاحظة المراجعة (اختياري)" : "Review note (optional)"}
              <textarea rows={2} value={note[item.id] ?? ""} onChange={e => setNote(current => ({ ...current, [item.id]: e.target.value }))} maxLength={1000} style={input} />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" disabled={busyId === item.id} onClick={() => void review(item, "approved")} style={button}>{ar ? "اعتماد للمرحلة التالية" : "Approve for next stage"}</button>
              <button type="button" disabled={busyId === item.id} onClick={() => void review(item, "rejected")} style={{ ...button, background: "#fff", color: "#a33d3d", borderColor: "#a33d3d" }}>{ar ? "رفض" : "Reject"}</button>
              <button type="button" disabled={busyId === item.id} onClick={() => void review(item, "closed")} style={{ ...button, background: "transparent", color: "#14243a" }}>{ar ? "إغلاق" : "Close"}</button>
            </div>
          </article>)}
        </div>}
    </div>
  </main>;
}
