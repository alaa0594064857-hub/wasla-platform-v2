"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../../components/locale-provider";

type Product = {
  id: string; title: string; description: string | null; price: string;
  currency: string; stockQuantity: number; imageUrl: string | null;
  createdAt: string; storeName: string; storeSlug: string; businessName: string;
};

export default function MemberProductReviewPage() {
  const { locale } = useLocale();
  const { data: session, isPending } = authClient.useSession();
  const ar = locale === "ar";
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/platform/member-products/review", { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not load review queue");
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذر تحميل القائمة" : "Could not load the queue"));
    } finally { setLoading(false); }
  }

  useEffect(() => { if (session?.user) void load(); }, [session?.user?.id]);

  async function decide(product: Product, decision: "approve" | "reject") {
    let note = "";
    if (decision === "reject") {
      note = window.prompt(ar ? "اكتب سبب الرفض (10 أحرف على الأقل)" : "Enter the rejection reason (at least 10 characters)") || "";
      if (note.trim().length < 10) return;
    }
    setBusy(product.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/platform/member-products/review/${product.id}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Decision failed");
      setProducts(current => current.filter(item => item.id !== product.id));
      setNotice(decision === "approve"
        ? (ar ? "تم اعتماد المنتج ونشره." : "Product approved and published.")
        : (ar ? "تم رفض المنتج وأرشفته." : "Product rejected and archived."));
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذر تنفيذ القرار" : "Could not save decision"));
    } finally { setBusy(null); }
  }

  if (isPending) return <main style={styles.shell}>{ar ? "جارٍ التحقق..." : "Checking session..."}</main>;
  if (!session?.user) return <main style={styles.shell}><Link href="/login">{ar ? "تسجيل الدخول" : "Sign in"}</Link></main>;

  return <main dir={ar ? "rtl" : "ltr"} lang={locale} style={styles.shell}>
    <header style={styles.header}>
      <div><span style={styles.eyebrow}>WASLA / OWNER OFFICE</span><h1>{ar ? "مراجعة منتجات متاجر الأعضاء" : "Member product review"}</h1>
      <p>{ar ? "راجع بيانات المنتج والمتجر قبل السماح بظهوره للعامة." : "Review each product and its store before allowing public publication."}</p></div>
      <Link href="/owner" style={styles.link}>{ar ? "العودة لمركز المالك" : "Back to owner center"}</Link>
    </header>
    <div style={styles.toolbar}><span>{ar ? `منتجات بانتظار المراجعة: ${products.length}` : `Awaiting review: ${products.length}`}</span><button onClick={() => void load()} style={styles.refresh}>{ar ? "تحديث القائمة" : "Refresh queue"}</button></div>
    {error ? <p role="alert" style={styles.error}>{error}</p> : null}
    {notice ? <p role="status" style={styles.notice}>{notice}</p> : null}
    {loading ? <p>{ar ? "جارٍ تحميل المنتجات..." : "Loading products..."}</p> :
      products.length === 0 ? <section style={styles.empty}>{ar ? "لا توجد منتجات بانتظار المراجعة." : "No products are waiting for review."}</section> :
      <section style={styles.grid}>{products.map(product => <article key={product.id} style={styles.card}>
        {product.imageUrl ? <img src={product.imageUrl} alt="" style={styles.image}/> : <div style={styles.imageFallback}>WASLA</div>}
        <div style={styles.body}><span style={styles.store}>{product.businessName} · {product.storeName}</span>
          <h2>{product.title}</h2><p>{product.description || (ar ? "لا يوجد وصف" : "No description")}</p>
          <strong style={styles.price}>{product.price} {product.currency}</strong>
          <small>{ar ? "المخزون" : "Stock"}: {product.stockQuantity} · {new Date(product.createdAt).toLocaleDateString(ar ? "ar" : "en")}</small>
          <div style={styles.actions}>
            <button disabled={busy === product.id} onClick={() => void decide(product, "approve")} style={styles.approve}>{busy === product.id ? "…" : (ar ? "اعتماد ونشر" : "Approve & publish")}</button>
            <button disabled={busy === product.id} onClick={() => void decide(product, "reject")} style={styles.reject}>{ar ? "رفض" : "Reject"}</button>
          </div>
        </div>
      </article>)}</section>}
  </main>;
}

const styles: Record<string, React.CSSProperties> = {
  shell: { minHeight: "100vh", padding: "32px clamp(16px,4vw,56px)", background: "#f5f3ee", color: "#15243a", fontFamily: "Arial,sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 28 },
  eyebrow: { color: "#9b7a35", fontSize: 11, letterSpacing: 2, fontWeight: 700 },
  link: { color: "#15243a", border: "1px solid #d8d1c2", borderRadius: 10, padding: "11px 15px", textDecoration: "none", fontWeight: 700 },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18, padding: 14, background: "#fff", borderRadius: 12 },
  refresh: { border: 0, borderRadius: 8, background: "#15243a", color: "#fff", padding: "9px 14px", cursor: "pointer" },
  error: { padding: 12, background: "#fff0ed", color: "#9b2c20", borderRadius: 8 },
  notice: { padding: 12, background: "#edf7ef", color: "#23623a", borderRadius: 8 },
  empty: { padding: 36, background: "#fff", borderRadius: 14, textAlign: "center" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: 18 },
  card: { background: "#fff", border: "1px solid #e6e1d7", borderRadius: 14, overflow: "hidden" },
  image: { width: "100%", height: 190, objectFit: "cover", background: "#eee" },
  imageFallback: { height: 190, display: "grid", placeItems: "center", background: "#e9e5dc", color: "#9b7a35", fontWeight: 800 },
  body: { padding: 18, display: "flex", flexDirection: "column", gap: 9 },
  store: { color: "#8a6b2d", fontSize: 12, fontWeight: 700 },
  price: { fontSize: 18, color: "#15243a" },
  actions: { display: "flex", gap: 10, marginTop: 10 },
  approve: { flex: 1, border: 0, borderRadius: 9, padding: 12, background: "#15243a", color: "#fff", fontWeight: 700, cursor: "pointer" },
  reject: { border: "1px solid #b83a32", borderRadius: 9, padding: "12px 18px", background: "#fff", color: "#a42d27", fontWeight: 700, cursor: "pointer" }
};
