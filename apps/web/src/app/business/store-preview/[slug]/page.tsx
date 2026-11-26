"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale } from "../../../../components/locale-provider";
import WorkspaceHeader from "../../../../components/workspace-header";

type Store = {
  id: string; name: string; slug: string; status: string;
  account_name?: string; account_status?: string; country_code?: string;
  verification_status?: string; business_description?: string | null; website?: string | null;
};
type Product = {
  id: string; title: string; description?: string | null; sku?: string | null;
  price: string; currency: string; stockQuantity: number;
  imageUrl?: string | null; status: "draft" | "active" | "archived";
};
type ProductDraft = { title: string; description: string; sku: string; price: string; currency: string; stockQuantity: string; imageUrl: string };

const emptyDraft: ProductDraft = { title: "", description: "", sku: "", price: "", currency: "USD", stockQuantity: "0", imageUrl: "" };

export default function PrivateStorePreviewPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  async function loadPreview(signal?: AbortSignal) {
    const [storeResponse, productResponse] = await Promise.all([
      fetch(`/api/stores/${encodeURIComponent(slug)}`, { credentials: "include", cache: "no-store", signal }),
      fetch(`/api/stores/${encodeURIComponent(slug)}/products`, { credentials: "include", cache: "no-store", signal }),
    ]);
    const storeData = await storeResponse.json();
    const productData = await productResponse.json();
    if (!storeResponse.ok || storeData.success !== true || !storeData.store) throw new Error("STORE_ACCESS");
    if (!productResponse.ok || productData.success !== true || !Array.isArray(productData.products)) throw new Error("PRODUCT_ACCESS");
    setStore(storeData.store);
    setProducts(productData.products);
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    loadPreview(controller.signal).catch(error => {
      if (error instanceof Error && error.name !== "AbortError") {
        setError(ar
          ? "تعذر فتح المعاينة. سجّل الدخول بحساب لديه صلاحية قراءة المتجر والمنتجات."
          : "Preview unavailable. Sign in with an account that has permission to read this store and its products.");
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, ar]);

  function updateDraft(field: keyof ProductDraft, value: string) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  async function createDraftProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(slug)}/products`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          description: draft.description.trim(),
          sku: draft.sku.trim(),
          price: draft.price,
          currency: draft.currency,
          stockQuantity: Number(draft.stockQuantity),
          imageUrl: draft.imageUrl.trim() || null,
          status: "draft",
        }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) {
        throw new Error(data.code === "PRODUCT_REVIEW_REQUIRED"
          ? (ar ? "لا يمكن نشر المنتج مباشرة؛ احفظه كمسودة للمراجعة." : "Products must be saved as drafts for review.")
          : (ar ? "تعذر حفظ المنتج. تحقق من البيانات وصلاحيات الإضافة." : "Could not save product. Check the fields and your create permission."));
      }
      setDraft(emptyDraft);
      await loadPreview();
      setSaveMessage(ar ? "تم حفظ المنتج كمسودة خاصة. لم يُنشر للعامة." : "Product saved as a private draft. It has not been published.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : (ar ? "حدث خطأ غير متوقع." : "An unexpected error occurred."));
    } finally {
      setSaving(false);
    }
  }

  const statusLabel = (status: string) => {
    if (!ar) return status;
    const labels: Record<string, string> = { draft: "مسودة", active: "نشط", archived: "مؤرشف" };
    return labels[status] || status;
  };
  const fieldClass = "w-full rounded-xl border border-[#dedbd3] bg-white px-3 py-3 text-sm text-[#17263d] outline-none focus:border-[#b99552]";

  return (
    <main className="business-page" dir={ar ? "rtl" : "ltr"} lang={locale}>
      <WorkspaceHeader section="business" />
      <section className="business-container">
        <div className="business-heading">
          <div>
            <span className="business-eyebrow">WASLA · PRIVATE STORE PREVIEW</span>
            <h1>{ar ? "معاينة المتجر" : "Store preview"}</h1>
            <p>{ar ? "مساحة خاصة بصاحب الصلاحية، وليست صفحة منشورة للزوار." : "A private workspace for authorized members, not a public storefront."}</p>
          </div>
          <Link href="/business/store-preview" className="business-refresh">{ar ? "كل المتاجر" : "All stores"}</Link>
        </div>
        <div className="business-alert" role="note" style={{ marginBottom: 20 }}>
          <strong>{ar ? "معاينة خاصة فقط" : "PRIVATE PREVIEW ONLY"}</strong>
          <p>{ar ? "لن يؤدي فتح هذه الصفحة إلى توثيق النشاط أو نشر المتجر. المنتجات الجديدة تُحفظ كمسودات وتحتاج مراجعة قبل النشر." : "Opening this page does not verify the business or publish the store. New products are saved as drafts and require review before publication."}</p>
        </div>
        {loading ? <div className="business-loading">{ar ? "جارٍ تحميل المعاينة..." : "Loading preview..."}</div> : error ? (
          <div className="business-alert business-alert-error" role="alert">{error}</div>
        ) : store ? (
          <>
            <section className="business-account-card">
              <div className="business-account-symbol">W</div>
              <div className="business-account-info">
                <span>{ar ? "حالة المتجر" : "Store status"}: {store.status} · {ar ? "حالة حساب النشاط" : "Business account"}: {store.account_status || "—"} · {ar ? "التوثيق" : "Verification"}: {store.verification_status || "unverified"}</span>
                <h3>{store.name}</h3>
                <p>{store.account_name || ""}{store.country_code ? ` · ${store.country_code}` : ""}</p>
              </div>
            </section>
            {store.business_description && <p className="mt-5 max-w-3xl text-sm leading-8 text-slate-600">{store.business_description}</p>}
            {store.website && <a href={store.website} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex text-sm font-bold text-[#92713a] underline">{ar ? "موقع النشاط" : "Business website"} ↗</a>}

            <section className="mt-8 rounded-2xl border border-[#e9e6df] bg-white p-5 md:p-6">
              <div className="mb-5">
                <span className="business-section-label">DRAFT PRODUCT BUILDER</span>
                <h2 className="mt-1 text-xl font-bold text-[#17263d]">{ar ? "إضافة منتج جديد" : "Add a new product"}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{ar ? "يُحفظ المنتج كمسودة خاصة فقط. لا يتم تفعيله أو عرضه للمتسوقين تلقائياً." : "The product is saved as a private draft only. It is not activated or shown to shoppers automatically."}</p>
              </div>
              <form onSubmit={createDraftProduct} className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-[#34445a] md:col-span-2">
                  {ar ? "اسم المنتج *" : "Product name *"}
                  <input className={fieldClass} required minLength={2} maxLength={180} value={draft.title} onChange={e => updateDraft("title", e.target.value)} placeholder={ar ? "مثال: سماعات لاسلكية" : "Example: Wireless headphones"} />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[#34445a] md:col-span-2">
                  {ar ? "وصف المنتج" : "Description"}
                  <textarea className={fieldClass} rows={3} maxLength={5000} value={draft.description} onChange={e => updateDraft("description", e.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[#34445a]">
                  {ar ? "السعر *" : "Price *"}
                  <input className={fieldClass} required type="number" min="0" max="9999999999" step="0.01" value={draft.price} onChange={e => updateDraft("price", e.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[#34445a]">
                  {ar ? "العملة" : "Currency"}
                  <select className={fieldClass} value={draft.currency} onChange={e => updateDraft("currency", e.target.value)}>
                    <option value="USD">USD — US Dollar</option><option value="EUR">EUR — Euro</option><option value="TRY">TRY — Turkish Lira</option><option value="GBP">GBP — Pound Sterling</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[#34445a]">
                  {ar ? "الكمية المتاحة" : "Stock quantity"}
                  <input className={fieldClass} required type="number" min="0" max="9007199254740991" step="1" value={draft.stockQuantity} onChange={e => updateDraft("stockQuantity", e.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[#34445a]">
                  {ar ? "رمز المنتج (اختياري)" : "SKU (optional)"}
                  <input className={fieldClass} maxLength={80} value={draft.sku} onChange={e => updateDraft("sku", e.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[#34445a] md:col-span-2">
                  {ar ? "رابط صورة المنتج (HTTPS)" : "Product image URL (HTTPS)"}
                  <input className={fieldClass} type="url" value={draft.imageUrl} onChange={e => updateDraft("imageUrl", e.target.value)} placeholder="https://..." />
                </label>
                <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                  <button type="submit" disabled={saving} className="rounded-xl bg-[#17263d] px-6 py-3 text-sm font-bold text-white disabled:opacity-60">
                    {saving ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "حفظ كمسودة" : "Save as draft")}
                  </button>
                  {saveMessage && <p role="status" className="text-sm font-medium text-[#536477]">{saveMessage}</p>}
                </div>
              </form>
            </section>

            <div className="business-section-heading" style={{ marginTop: 32 }}>
              <div><span className="business-section-label">PRIVATE CATALOGUE</span><h2>{ar ? "منتجات المتجر" : "Store products"}</h2></div>
              <span className="business-count">{products.length}</span>
            </div>
            {products.length === 0 ? (
              <div className="business-empty"><h2>{ar ? "لا توجد منتجات مضافة بعد" : "No products have been added yet"}</h2><p>{ar ? "يمكنك إضافة أول منتج من النموذج أعلاه، وسيبقى مسودة حتى المراجعة." : "Add your first product using the form above. It will remain a draft until reviewed."}</p></div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {products.map(product => (
                  <article key={product.id} className="overflow-hidden rounded-2xl border border-[#e9e6df] bg-white">
                    <div className="aspect-[5/3] bg-[#f0eee8]">
                      {product.imageUrl ? <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center font-serif text-5xl font-bold text-[#c6a15b]">W</div>}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#92713a]">{statusLabel(product.status)}</span>
                        <span className="text-xs text-slate-500">{ar ? "المخزون" : "Stock"}: {product.stockQuantity}</span>
                      </div>
                      <h3 className="mt-2 font-bold text-[#17263d]">{product.title}</h3>
                      {product.description && <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{product.description}</p>}
                      <p className="mt-4 border-t border-[#f0eee8] pt-3 font-extrabold text-[#9a7638]">{product.price} {product.currency}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
