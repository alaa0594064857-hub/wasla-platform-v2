"use client";

import { useEffect, useState } from "react";
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

export default function PrivateStorePreviewPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      fetch(`/api/stores/${encodeURIComponent(slug)}`, { credentials: "include", cache: "no-store", signal: controller.signal }),
      fetch(`/api/stores/${encodeURIComponent(slug)}/products`, { credentials: "include", cache: "no-store", signal: controller.signal }),
    ])
      .then(async ([storeResponse, productResponse]) => {
        const storeData = await storeResponse.json();
        const productData = await productResponse.json();
        if (!storeResponse.ok || storeData.success !== true || !storeData.store) {
          throw new Error(storeData.error || "Store access denied");
        }
        if (!productResponse.ok || productData.success !== true || !Array.isArray(productData.products)) {
          throw new Error(productData.error || "Products access denied");
        }
        setStore(storeData.store);
        setProducts(productData.products);
      })
      .catch(error => {
        if (error instanceof Error && error.name !== "AbortError") {
          setError(ar
            ? "تعذر فتح المعاينة. يجب تسجيل الدخول بحساب لديه صلاحية قراءة المتجر والمنتجات."
            : "Preview unavailable. Sign in with an account that has permission to read this store and its products.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, ar]);

  const statusLabel = (status: string) => {
    if (!ar) return status;
    const labels: Record<string, string> = { draft: "مسودة", active: "نشط", archived: "مؤرشف" };
    return labels[status] || status;
  };

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
          <p>{ar ? "لن يؤدي فتح هذه الصفحة إلى توثيق النشاط أو نشر المتجر. النشر العام يظل خاضعاً لمراجعة التوثيق والمنتجات." : "Opening this page does not verify the business or publish the store. Public access remains subject to business verification and product review."}</p>
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
            <div className="business-section-heading" style={{ marginTop: 32 }}>
              <div><span className="business-section-label">PRIVATE CATALOGUE</span><h2>{ar ? "منتجات المتجر" : "Store products"}</h2></div>
              <span className="business-count">{products.length}</span>
            </div>
            {products.length === 0 ? (
              <div className="business-empty"><h2>{ar ? "لا توجد منتجات مضافة بعد" : "No products have been added yet"}</h2><p>{ar ? "أضف المنتجات كمسودات أولاً، ثم أرسلها للمراجعة قبل النشر." : "Add products as drafts first, then submit them for review before publishing."}</p></div>
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
