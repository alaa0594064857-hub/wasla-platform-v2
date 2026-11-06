"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import WorkspaceHeader from "../../../components/workspace-header";

type Product = {
  id: string; title: string; description: string | null; sku: string | null;
  price: string; currency: string; imageUrl: string | null; videoUrl: string | null;
};
type Store = {
  id: string; name: string; slug: string; businessName: string;
  countryCode: string | null; businessDescription: string | null; website: string | null;
};

const copy = {
  ar: {
    eyebrow: "WASLA STOREFRONT", loading: "جارٍ تحميل المتجر...",
    unavailable: "تعذر العثور على المتجر أو تحميل منتجاته.", retry: "إعادة المحاولة",
    products: "منتجات المتجر", empty: "لا توجد منتجات منشورة في هذا المتجر حالياً.",
    requestQuote: "اطلب تأكيد التوفر وعرض سعر",
    requestHint: "المنتجات المعروضة تخص المورد. يرسل طلبك للمورد ليؤكد التوفر والسعر والشحن قبل اعتماد أي طلب.",
    noPrice: "يحدد المورد السعر عند تقديم العرض", business: "من",
    sourcing: "الانتقال إلى طلبات التوريد", catalogNote: "كتالوج المورد — لا يعني أن الكمية أو السعر مؤكدان لطلبك.",
  },
  en: {
    eyebrow: "WASLA STOREFRONT", loading: "Loading shop...",
    unavailable: "This shop could not be found or its products could not be loaded.",
    retry: "Try again", products: "Shop products",
    empty: "This shop has no published products yet.",
    requestQuote: "Request availability and a quote",
    requestHint: "Listings belong to the supplier. The supplier confirms availability, price and shipping for your request before an order is accepted.",
    noPrice: "Supplier quote required", business: "By",
    sourcing: "Open sourcing requests",
    catalogNote: "Supplier catalog — listed quantity or price is not a request-specific confirmation.",
  },
};

export default function PublicStorefrontPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { locale } = useLocale();
  const t = copy[locale];
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const dir = locale === "ar" ? "rtl" : "ltr";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/public/stores/${encodeURIComponent(slug)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.unavailable);
      setStore(data.store as Store);
      setProducts(data.products as Product[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.unavailable);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [slug]);

  function requestQuote(product: Product) {
    const params = new URLSearchParams({
      item: product.title,
      description: product.description ?? "",
      currency: product.currency,
    });
    router.push(`/sourcing?${params.toString()}`);
  }

  return (
    <main className="shops-page wasla-storefront" lang={locale} dir={dir}>
      <WorkspaceHeader section="shops" />
      <section className="shops-main">
        {loading ? <div className="shops-empty">{t.loading}</div> : error && !store ? (
          <div className="shops-alert" role="alert">{error}<button type="button" onClick={() => void load()}>{t.retry}</button></div>
        ) : store && (
          <>
            <div className="shops-heading">
              <div>
                <span className="shops-eyebrow">{t.eyebrow}</span>
                <h1>{store.name}</h1>
                <p>{t.business} {store.businessName}{store.countryCode ? ` · ${store.countryCode}` : ""}</p>
              </div>
              <div className="shops-heading-icon" aria-hidden="true">W</div>
            </div>
            {store.businessDescription && <p className="wasla-store-description">{store.businessDescription}</p>}
            <p className="wasla-store-security-note">{t.catalogNote}</p>
            <div className="shops-section-title">
              <h2>{t.products}</h2><span>{products.length}</span>
            </div>
            {products.length === 0 ? <div className="shops-empty">{t.empty}</div> : (
              <div className="wasla-store-product-grid">
                {products.map(product => (
                  <article className="wasla-store-product" key={product.id}>
                    {product.imageUrl
                      ? <img src={product.imageUrl} alt={product.title} loading="lazy" />
                      : <div className="wasla-store-product-placeholder">W</div>}
                    <div className="wasla-store-product-content">
                      <h3>{product.title}</h3>
                      {product.description && <p>{product.description}</p>}
                      <strong>{product.price ? `${product.price} ${product.currency}` : t.noPrice}</strong>
                      <button type="button" onClick={() => requestQuote(product)}>{t.requestQuote}</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <section className="shops-create-card" style={{ marginTop: 24 }}>
              <p>{t.requestHint}</p>
              <button type="button" onClick={() => router.push("/sourcing")}>{t.sourcing} ↗</button>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
