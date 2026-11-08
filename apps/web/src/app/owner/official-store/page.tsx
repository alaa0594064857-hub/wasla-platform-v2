"use client";

import { useEffect, useState, type FormEvent, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../../components/locale-provider";

type Product = {
  id: string; title_ar: string; title_en: string; description_ar: string | null;
  description_en: string | null; price: string; currency: string; supplier_name: string | null;
  availability_status: "available" | "limited" | "unavailable" | "needs_confirmation";
  fulfillment_notes: string | null; image_url: string | null; status: "draft" | "published" | "archived";
};

const emptyForm = {
  titleAr: "", titleEn: "", descriptionAr: "", descriptionEn: "", price: "0",
  currency: "USD", supplierName: "", availabilityStatus: "needs_confirmation",
  fulfillmentNotes: "", imageUrl: "", status: "draft",
};

export default function OwnerOfficialStorePage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const t = ar ? {
    title: "إدارة متجر WASLA الرسمي", subtitle: "إدارة منتجات المتجر المملوك للمنصة بصورة مستقلة عن متاجر الأعضاء.",
    back: "العودة لمركز المالك", denied: "هذه الصفحة مخصصة لمالك المنصة.",
    add: "إضافة منتج رسمي", edit: "تعديل المنتج", save: "حفظ المنتج", saving: "جارٍ الحفظ...",
    titleAr: "اسم المنتج بالعربية", titleEn: "اسم المنتج بالإنجليزية",
    descAr: "الوصف بالعربية", descEn: "الوصف بالإنجليزية", price: "السعر", currency: "العملة",
    supplier: "اسم المورد", availability: "حالة التوفر", fulfillment: "ملاحظات التوريد والتسليم",
    image: "رابط صورة المنتج (HTTPS)", status: "حالة النشر", draft: "مسودة", published: "منشور", archived: "مؤرشف",
    available: "متوفر", limited: "توفر محدود", unavailable: "غير متوفر", needs_confirmation: "يتطلب تأكيد المورد",
    list: "منتجات المتجر", empty: "لا توجد منتجات بعد.", editAction: "تعديل", cancel: "إلغاء التعديل",
    loading: "جارٍ تحميل المنتجات...", loadError: "تعذر تحميل المنتجات.", saveError: "تعذر حفظ المنتج. راجع الحقول.",
    inventory: "لا تدير WASLA مخزوناً مركزياً. حالة التوفر يحدّثها المورد أو فريق المتجر بعد التأكد.",
    payments: "لا يوجد تحصيل مدفوعات مفعّل هنا. إعدادات الدفع والطلبات ستنفذ في مرحلة مستقلة.",
    productStatus: "النشر", supplierNote: "المورد يحتفظ بالمنتج ويتولى تنفيذه؛ لا نضيف كمية مخزون للمنصة.", priceGate: "يجب اعتماد سعر بيع موثق لكل دولة من شاشة عروض الموردين قبل نشر المنتج. السعر المعتمد وحده يظهر لعملاء تلك الدولة."
  } : {
    title: "Official WASLA Store administration", subtitle: "Manage platform-owned products separately from member stores.",
    back: "Back to owner center", denied: "This page is restricted to the platform owner.",
    add: "Add official product", edit: "Edit product", save: "Save product", saving: "Saving...",
    titleAr: "Arabic product title", titleEn: "English product title",
    descAr: "Arabic description", descEn: "English description", price: "Price", currency: "Currency",
    supplier: "Supplier name", availability: "Availability", fulfillment: "Fulfillment notes",
    image: "Product image URL (HTTPS)", status: "Publication status", draft: "Draft", published: "Published", archived: "Archived",
    available: "Available", limited: "Limited availability", unavailable: "Unavailable", needs_confirmation: "Supplier confirmation required",
    list: "Store products", empty: "No products yet.", editAction: "Edit", cancel: "Cancel editing",
    loading: "Loading products...", loadError: "Could not load products.", saveError: "Could not save product. Check the fields.",
    inventory: "WASLA does not manage central inventory. Availability must be confirmed with the supplier.",
    payments: "Payment collection is not enabled here. Orders and checkout will be implemented separately.",
    productStatus: "Publication", supplierNote: "The supplier retains and fulfills the product; no platform stock quantity is recorded.", priceGate: "Approve a verified customer price for at least one destination in Supplier Offers before publishing. Customers only see the approved price for their own destination."
  };

  async function loadProducts() {
    setLoading(true);
    try {
      const response = await fetch("/api/platform/official-store/products", { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("load");
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch { setError(t.loadError); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) { router.replace("/login"); return; }
    let active = true;
    fetch("/api/platform/security", { credentials: "include", cache: "no-store" })
      .then(async response => {
        if (response.status === 401) { router.replace("/login"); return null; }
        if (!response.ok) throw new Error("access");
        return response.json();
      })
      .then(data => {
        if (!active) return;
        const ok = Boolean(data?.success && data.platformAccess?.roles?.includes("platform_owner") && data.platformAccess?.permissions?.includes("platform.manage"));
        setAuthorized(ok);
        if (ok) void loadProducts();
      })
      .catch(() => { if (active) setAuthorized(false); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [isPending, session?.user?.id]);

  function update<K extends keyof typeof emptyForm>(key: K, value: typeof emptyForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function beginEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      titleAr: product.title_ar, titleEn: product.title_en,
      descriptionAr: product.description_ar || "", descriptionEn: product.description_en || "",
      price: product.price, currency: product.currency, supplierName: product.supplier_name || "",
      availabilityStatus: product.availability_status, fulfillmentNotes: product.fulfillment_notes || "",
      imageUrl: product.image_url || "", status: product.status,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const body = {
        titleAr: form.titleAr.trim(), titleEn: form.titleEn.trim(),
        descriptionAr: form.descriptionAr.trim() || null, descriptionEn: form.descriptionEn.trim() || null,
        price: Number(form.price), currency: form.currency.trim().toUpperCase(),
        supplierName: form.supplierName.trim() || null,
        availabilityStatus: form.availabilityStatus,
        fulfillmentNotes: form.fulfillmentNotes.trim() || null,
        imageUrl: form.imageUrl.trim() || null, status: form.status,
      };
      const response = await fetch(editingId ? `/api/platform/official-store/products/${editingId}` : "/api/platform/official-store/products", {
        method: editingId ? "PATCH" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || !data.success) { setError(typeof data.error === "string" ? data.error : t.saveError); return; }
      setForm({ ...emptyForm }); setEditingId(null);
      await loadProducts();
    } catch { setError(t.saveError); }
    finally { setSaving(false); }
  }

  if (isPending || checking) return <main style={styles.shell} dir={ar ? "rtl" : "ltr"}>{t.loading}</main>;
  if (!authorized) return <main style={styles.shell} dir={ar ? "rtl" : "ltr"}><h1>{t.denied}</h1><Link href="/owner">{t.back}</Link></main>;

  const statusLabel = (value: Product["status"]) => value === "published" ? t.published : value === "archived" ? t.archived : t.draft;
  const availabilityLabel = (value: Product["availability_status"]) => value === "available" ? t.available : value === "limited" ? t.limited : value === "unavailable" ? t.unavailable : t.needs_confirmation;

  return <main style={styles.shell} dir={ar ? "rtl" : "ltr"} lang={locale}>
    <header style={styles.header}>
      <div><Link href="/owner" style={styles.back}>← {t.back}</Link><h1>{t.title}</h1><p>{t.subtitle}</p>
        <Link href="/owner/official-store/source-offers" style={{ ...styles.back, display: "inline-block", marginTop: 10 }}>
          {ar ? "إدارة عروض الموردين ومصادر المنتجات →" : "Manage supplier offers and product sources →"}
        </Link>
        <Link href="/owner/official-store/orders" style={{ ...styles.back, display: "inline-block", marginTop: 10, marginInlineStart: 12 }}>
          {ar ? "إدارة الطلبات وسجلها →" : "Order desk and event history →"}
        </Link></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}><Link href="/owner/official-store/sourcing" style={styles.back}>{ar ? "مراجعة الموردين ←" : "Supplier sourcing review →"}</Link><span style={styles.tag}>PLATFORM-OWNED</span></div>
    </header>
    <section style={styles.notice}><strong>{t.inventory}</strong><p>{t.supplierNote}</p><p>{t.priceGate}</p><p>{t.payments}</p></section>
    <section style={styles.panel}>
      <h2>{editingId ? t.edit : t.add}</h2>
      <form onSubmit={save} style={styles.form}>
        <label>{t.titleAr}<input required maxLength={180} style={styles.input} value={form.titleAr} onChange={e => update("titleAr", e.target.value)} /></label>
        <label>{t.titleEn}<input required maxLength={180} style={styles.input} value={form.titleEn} onChange={e => update("titleEn", e.target.value)} /></label>
        <label>{t.price}<input required type="number" min="0" max="1000000000" step="0.01" style={styles.input} value={form.price} onChange={e => update("price", e.target.value)} /></label>
        <label>{t.currency}<input required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" style={styles.input} value={form.currency} onChange={e => update("currency", e.target.value)} /></label>
        <label>{t.supplier}<input maxLength={180} style={styles.input} value={form.supplierName} onChange={e => update("supplierName", e.target.value)} /></label>
        <label>{t.availability}<select style={styles.input} value={form.availabilityStatus} onChange={e => update("availabilityStatus", e.target.value as typeof form.availabilityStatus)}>
          <option value="needs_confirmation">{t.needs_confirmation}</option><option value="available">{t.available}</option><option value="limited">{t.limited}</option><option value="unavailable">{t.unavailable}</option>
        </select></label>
        <label>{t.status}<select style={styles.input} value={form.status} onChange={e => update("status", e.target.value as typeof form.status)}>
          <option value="draft">{t.draft}</option><option value="published">{t.published}</option><option value="archived">{t.archived}</option>
        </select></label>
        <label>{t.image}<input type="url" placeholder="https://..." style={styles.input} value={form.imageUrl} onChange={e => update("imageUrl", e.target.value)} /></label>
        <label>{t.descAr}<textarea rows={4} maxLength={10000} style={styles.input} value={form.descriptionAr} onChange={e => update("descriptionAr", e.target.value)} /></label>
        <label>{t.descEn}<textarea rows={4} maxLength={10000} style={styles.input} value={form.descriptionEn} onChange={e => update("descriptionEn", e.target.value)} /></label>
        <label style={styles.full}>{t.fulfillment}<textarea rows={3} maxLength={10000} style={styles.input} value={form.fulfillmentNotes} onChange={e => update("fulfillmentNotes", e.target.value)} /></label>
        <div style={styles.actions}><button type="submit" style={styles.button} disabled={saving}>{saving ? t.saving : t.save}</button>{editingId && <button type="button" style={styles.secondary} onClick={() => { setEditingId(null); setForm({ ...emptyForm }); }}>{t.cancel}</button>}</div>
      </form>
      {error && <p role="status" style={styles.error}>{error}</p>}
    </section>
    <section style={styles.panel}>
      <h2>{t.list}</h2>
      {loading ? <p>{t.loading}</p> : products.length === 0 ? <p>{t.empty}</p> : <div style={styles.list}>
        {products.map(product => <article key={product.id} style={styles.product}>
          {product.image_url ? <img src={product.image_url} alt="" style={styles.image} /> : <div style={styles.imagePlaceholder}>W</div>}
          <div style={styles.productBody}>
            <strong>{ar ? product.title_ar : product.title_en}</strong>
            <small>{product.price} {product.currency} · {t.productStatus}: {statusLabel(product.status)} · {availabilityLabel(product.availability_status)}</small>
            {product.supplier_name && <small>{t.supplier}: {product.supplier_name}</small>}
          </div>
          <button type="button" style={styles.secondary} onClick={() => beginEdit(product)}>{t.editAction}</button>
        </article>)}
      </div>}
    </section>
  </main>;
}

const styles: Record<string, CSSProperties> = {
  shell: { minHeight: "100vh", padding: "30px clamp(16px,5vw,64px)", background: "#f5f1e8", color: "#17253a", fontFamily: "Arial,sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 22 },
  back: { color: "#9a742d", textDecoration: "none", fontWeight: 700 },
  tag: { padding: "9px 13px", borderRadius: 20, background: "#e9e1d2", fontSize: 11, fontWeight: 800 },
  notice: { background: "#fffaf0", border: "1px solid #d8c9a8", borderRadius: 12, padding: 17, marginBottom: 20, lineHeight: 1.6 },
  panel: { background: "#fff", border: "1px solid #e4dfd4", borderRadius: 16, padding: 22, marginBottom: 20, boxShadow: "0 8px 24px rgba(23,37,58,.04)" },
  form: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 },
  label: { display: "grid", gap: 7, fontSize: 13, fontWeight: 700 },
  input: { boxSizing: "border-box", width: "100%", border: "1px solid #dce1e8", borderRadius: 8, padding: "11px 12px", background: "#fbfcfd", color: "#17253a", font: "inherit", minWidth: 0 },
  full: { gridColumn: "1 / -1", display: "grid", gap: 7, fontSize: 13, fontWeight: 700 },
  actions: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  button: { border: 0, borderRadius: 8, padding: "11px 16px", background: "#17253a", color: "#fff", fontWeight: 700, cursor: "pointer" },
  secondary: { border: "1px solid #c9b98f", borderRadius: 8, padding: "9px 13px", background: "#fffaf0", color: "#72551f", fontWeight: 700, cursor: "pointer" },
  error: { color: "#9b3d32", fontWeight: 700 },
  list: { display: "grid", gap: 12 },
  product: { display: "flex", alignItems: "center", gap: 14, border: "1px solid #e7e2d8", borderRadius: 12, padding: 13, flexWrap: "wrap" },
  image: { width: 64, height: 64, borderRadius: 9, objectFit: "cover" },
  imagePlaceholder: { width: 64, height: 64, borderRadius: 9, display: "grid", placeItems: "center", background: "#17253a", color: "#e7d49b", fontWeight: 900, fontSize: 24 },
  productBody: { flex: 1, minWidth: 180, display: "grid", gap: 5 },
};
