"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import WorkspaceHeader from "@/components/workspace-header";

type Review = {
  id: string;
  productId: string;
  productTitle: string;
  storeId: string;
  storeName: string;
  orderId: string;
  buyerUserId: string;
  rating: number;
  title: string | null;
  body: string;
  status: "pending_moderation" | "published" | "rejected" | "hidden";
  moderationNote: string | null;
  moderatedAt: string | null;
  createdAt: string;
};

type Filter = "pending_moderation" | "published" | "rejected" | "hidden" | "all";

export default function AdminReviewModerationPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filter, setFilter] = useState<Filter>("pending_moderation");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const copy = ar ? {
    back: "العودة إلى مركز المالك",
    eyebrow: "إدارة الثقة والجودة",
    title: "مراجعة تقييمات المنتجات",
    intro: "راجع تقييمات المشترين الذين أكملوا شراء المنتج فقط. قرارات النشر والإخفاء تسجل في سجل التدقيق.",
    pending_moderation: "بانتظار المراجعة",
    published: "منشور",
    rejected: "مرفوض",
    hidden: "مخفي",
    all: "الكل",
    loading: "جارٍ تحميل التقييمات...",
    empty: "لا توجد تقييمات ضمن هذا التصنيف.",
    retry: "إعادة المحاولة",
    product: "المنتج",
    store: "المتجر",
    order: "رقم الطلب الداخلي",
    buyer: "معرّف المشتري الداخلي",
    date: "تاريخ الإرسال",
    note: "ملاحظة إدارية (اختيارية)",
    notePlaceholder: "سبب القرار أو ملاحظة المراجعة",
    publish: "نشر التقييم",
    reject: "رفض",
    hide: "إخفاء",
    working: "جارٍ الحفظ...",
    success: "تم حفظ قرار المراجعة وتسجيله في سجل التدقيق.",
    error: "تعذر إكمال العملية. تحقق من صلاحية إدارة البلاغات.",
    signIn: "سجّل الدخول بحساب إدارة المنصة لعرض قائمة المراجعة.",
    verified: "شراء مكتمل موثّق",
    moderation: "حالة المراجعة",
  } : {
    back: "Back to owner center",
    eyebrow: "TRUST & QUALITY OPERATIONS",
    title: "Product review moderation",
    intro: "Moderate reviews only from buyers with a completed purchase. Publish and hide decisions are recorded in the audit log.",
    pending_moderation: "Pending review",
    published: "Published",
    rejected: "Rejected",
    hidden: "Hidden",
    all: "All",
    loading: "Loading reviews...",
    empty: "No reviews in this category.",
    retry: "Try again",
    product: "Product",
    store: "Store",
    order: "Internal order ID",
    buyer: "Internal buyer ID",
    date: "Submitted",
    note: "Moderator note (optional)",
    notePlaceholder: "Decision reason or moderation note",
    publish: "Publish review",
    reject: "Reject",
    hide: "Hide",
    working: "Saving...",
    success: "Moderation decision saved and recorded in the audit log.",
    error: "Could not complete the action. Check platform moderation permission.",
    signIn: "Sign in with a platform staff account to access the moderation queue.",
    verified: "Verified completed purchase",
    moderation: "Moderation status",
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/platform/reviews?status=${filter}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) {
        throw new Error(ar ? copy.signIn : copy.signIn);
      }
      if (!response.ok || data.success !== true || !Array.isArray(data.reviews)) {
        throw new Error(typeof data.error === "string" ? data.error : copy.error);
      }
      setReviews(data.reviews as Review[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.error);
    } finally {
      setLoading(false);
    }
  }, [filter, ar]);

  useEffect(() => { void load(); }, [load]);

  async function decide(reviewId: string, status: "published" | "rejected" | "hidden") {
    if (busyId) return;
    setBusyId(reviewId);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/platform/reviews/${reviewId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: notes[reviewId] ?? "" }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) {
        throw new Error(typeof data.error === "string" ? data.error : copy.error);
      }
      setMessage(copy.success);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.error);
    } finally {
      setBusyId("");
    }
  }

  const filters: Filter[] = ["pending_moderation", "published", "rejected", "hidden", "all"];
  const labels: Record<Filter, string> = {
    pending_moderation: copy.pending_moderation,
    published: copy.published,
    rejected: copy.rejected,
    hidden: copy.hidden,
    all: copy.all,
  };

  return (
    <main lang={locale} dir={ar ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: "#f7f4ed", color: "#14243a" }}>
      <WorkspaceHeader section="account" />
      <div style={{ width: "min(1100px, calc(100% - 32px))", margin: "32px auto 64px" }}>
        <Link href="/owner" style={{ color: "#806638", fontSize: 13 }}>{copy.back}</Link>
        <header style={{ margin: "22px 0 26px" }}>
          <p style={{ color: "#9a7940", fontSize: 12, fontWeight: 800, letterSpacing: 2 }}>{copy.eyebrow}</p>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 40px)", margin: "8px 0" }}>{copy.title}</h1>
          <p style={{ color: "#647184", maxWidth: 760, lineHeight: 1.9 }}>{copy.intro}</p>
          <Link href="/admin/review-disputes" style={{ display: "inline-block", marginTop: 12, color: "#806638", fontWeight: 800, textDecoration: "underline" }}>{ar ? "فتح البلاغات والاعتراضات" : "Open reports & appeals"}</Link>
        </header>

        {error && <div role="alert" style={{ padding: 14, border: "1px solid #e4b8a8", background: "#fff3ed", borderRadius: 12, marginBottom: 16 }}>{error}<button type="button" onClick={() => void load()} style={{ marginInlineStart: 12, textDecoration: "underline" }}>{copy.retry}</button></div>}
        {message && <div role="status" style={{ padding: 14, border: "1px solid #b7d5c0", background: "#f0f8f1", borderRadius: 12, marginBottom: 16 }}>{message}</div>}

        <nav aria-label={ar ? "تصفية التقييمات" : "Filter reviews"} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
          {filters.map(item => (
            <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item}
              style={{ border: filter === item ? "1px solid #14243a" : "1px solid #d9d6ce", background: filter === item ? "#14243a" : "#fff", color: filter === item ? "#fff" : "#14243a", borderRadius: 999, padding: "9px 15px", fontSize: 13, fontWeight: 700 }}>
              {labels[item]}
            </button>
          ))}
        </nav>

        {loading ? <p style={{ padding: 24, color: "#647184" }}>{copy.loading}</p> : reviews.length === 0 ? (
          <section style={{ padding: 30, textAlign: "center", background: "#fff", border: "1px solid #e6e1d7", borderRadius: 16 }}>{copy.empty}</section>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {reviews.map(review => (
              <article key={review.id} style={{ background: "#fff", border: "1px solid #e6e1d7", borderRadius: 16, padding: 20, boxShadow: "0 8px 28px rgba(20,36,58,.04)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ fontSize: 12, color: "#8b7041", fontWeight: 800 }}>{copy.verified}</p>
                    <h2 style={{ fontSize: 20, margin: "6px 0" }}>{review.title || review.productTitle}</h2>
                    <p style={{ color: "#647184", fontSize: 13 }}>{copy.product}: {review.productTitle} · {copy.store}: {review.storeName}</p>
                  </div>
                  <div aria-label={`${review.rating} / 5`} style={{ color: "#9a742f", fontWeight: 800, whiteSpace: "nowrap" }}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)} <span style={{ color: "#647184" }}>{review.rating}/5</span></div>
                </div>
                <p style={{ lineHeight: 1.9, whiteSpace: "pre-wrap", margin: "16px 0" }}>{review.body}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", color: "#748092", fontSize: 12 }}>
                  <span>{copy.order}: <b dir="ltr">{review.orderId}</b></span>
                  <span>{copy.date}: {new Date(review.createdAt).toLocaleDateString(locale === "ar" ? "ar" : "en")}</span>
                  <span>{copy.moderation}: {labels[review.status]}</span>
                </div>
                <label style={{ display: "block", marginTop: 16, fontSize: 13, fontWeight: 700 }}>
                  {copy.note}
                  <textarea value={notes[review.id] ?? ""} onChange={event => setNotes(current => ({ ...current, [review.id]: event.target.value }))} maxLength={1000} rows={2} placeholder={copy.notePlaceholder} style={{ display: "block", width: "100%", marginTop: 7, padding: 11, border: "1px solid #d9d6ce", borderRadius: 9, resize: "vertical", font: "inherit" }} />
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginTop: 13 }}>
                  <button type="button" disabled={busyId === review.id || review.status === "published"} onClick={() => void decide(review.id, "published")} style={{ padding: "10px 15px", border: 0, borderRadius: 8, background: "#14243a", color: "#fff", fontWeight: 700, opacity: busyId === review.id || review.status === "published" ? .55 : 1 }}>{busyId === review.id ? copy.working : copy.publish}</button>
                  <button type="button" disabled={busyId === review.id || review.status === "rejected"} onClick={() => void decide(review.id, "rejected")} style={{ padding: "10px 15px", border: "1px solid #c9a6a0", borderRadius: 8, background: "#fff", color: "#8a3730", fontWeight: 700 }}>{copy.reject}</button>
                  <button type="button" disabled={busyId === review.id || review.status === "hidden"} onClick={() => void decide(review.id, "hidden")} style={{ padding: "10px 15px", border: "1px solid #d9d6ce", borderRadius: 8, background: "#fff", color: "#536174", fontWeight: 700 }}>{copy.hide}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
