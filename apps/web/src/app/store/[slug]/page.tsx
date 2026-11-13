"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../components/locale-provider";

type Product = { id: string; title: string; description?: string; price: string; currency: string; imageUrl?: string };
type Store = { id: string; name: string; slug: string; businessName?: string; businessDescription?: string; website?: string; logoReference?: string | null };
type ReturnPolicy = {
  acceptsReturns: boolean; acceptsExchanges: boolean; requestWindowDays: number;
  itemConditionsAr: string; itemConditionsEn: string; exclusionsAr: string; exclusionsEn: string;
  buyerInstructionsAr: string; buyerInstructionsEn: string; contactInstructionsAr: string; contactInstructionsEn: string;
};

const copy = {
  ar: {
    eyebrow: "متجر مستقل على WASLA", home: "الرئيسية", products: "اكتشف المنتجات", search: "ابحث عن منتج...",
    sort: "ترتيب حسب", newest: "الأحدث", priceLow: "السعر: الأقل أولاً", priceHigh: "السعر: الأعلى أولاً",
    count: "منتج", emptyTitle: "لا توجد منتجات مطابقة", empty: "جرّب تغيير كلمات البحث أو العودة لاحقاً.",
    all: "كل المنتجات", visit: "زيارة الموقع", track: "طلباتي مع هذا المتجر", about: "عن المتجر",
    returns: "الإرجاع والاستبدال", loading: "نجهّز متجرك...", notFound: "تعذر العثور على هذا المتجر.",
    retry: "إعادة المحاولة", noDescription: "اكتشف مجموعة المنتجات المتاحة لدى هذا المتجر.",
    viewProduct: "عرض التفاصيل", seller: "البائع", secure: "تجربة تسوق واضحة ومباشرة",
    rights: "تظل حقوق المستهلك الإلزامية بموجب القانون المعمول به محفوظة.",
    noPolicy: "لم ينشر المتجر سياسة إرجاع بعد. يرجى التواصل مع البائع للاستفسار. عدم وجود سياسة منشورة لا يعني تلقائياً رفض الإرجاع أو إسقاط الحقوق القانونية.",
    returnsYes: "يقبل الإرجاع", returnsNo: "الإرجاع غير مفعّل", exchangeYes: "يقبل الاستبدال", exchangeNo: "الاستبدال غير مفعّل",
    window: "مهلة الطلب:", days: "يوماً", conditions: "شروط المنتج:", exclusions: "الاستثناءات:",
    buyer: "تعليمات المشتري", contact: "التواصل", legal: "تقديم طلب لا يعني استرداداً مالياً تلقائياً ولا يضمن الموافقة.",
    powered: "مدعوم من WASLA", clear: "مسح البحث", result: "نتيجة البحث",
  },
  en: {
    eyebrow: "Independent store on WASLA", home: "Home", products: "Explore products", search: "Search products...",
    sort: "Sort by", newest: "Newest", priceLow: "Price: low to high", priceHigh: "Price: high to low",
    count: "products", emptyTitle: "No matching products", empty: "Try another search or check back later.",
    all: "All products", visit: "Visit website", track: "My orders with this store", about: "About this store",
    returns: "Returns & exchanges", loading: "Preparing your store...", notFound: "This store could not be found.",
    retry: "Try again", noDescription: "Explore the products currently available from this store.",
    viewProduct: "View details", seller: "Seller", secure: "A clear and straightforward shopping experience",
    rights: "Mandatory consumer rights under applicable law remain unaffected.",
    noPolicy: "The store has not published a return policy yet. Please contact the seller. No published policy does not automatically mean returns are refused or legal rights are waived.",
    returnsYes: "Returns accepted", returnsNo: "Returns not enabled", exchangeYes: "Exchanges accepted", exchangeNo: "Exchanges not enabled",
    window: "Request window:", days: "days", conditions: "Item conditions:", exclusions: "Exclusions:",
    buyer: "Buyer instructions", contact: "Contact", legal: "Submitting a request is not an automatic refund and does not guarantee approval.",
    powered: "Powered by WASLA", clear: "Clear search", result: "Search result",
  },
};

function formatPrice(value: string, currency: string, locale: "ar" | "en") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar" : "en", {
      style: "currency", currency, maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${value} ${currency}`;
  }
}

export default function PublicStorePage() {
  const params = useParams<{ slug: string }>();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const t = copy[ar ? "ar" : "en"];
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [returnPolicy, setReturnPolicy] = useState<ReturnPolicy | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");

  const loadStore = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/public/stores/${encodeURIComponent(params.slug)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success || !data.store || !Array.isArray(data.products)) throw new Error("store");
      setStore(data.store);
      setProducts(data.products);
    } catch {
      setError(t.notFound);
    } finally {
      setLoading(false);
    }
  }, [params.slug, t.notFound]);

  useEffect(() => { void loadStore(); }, [loadStore]);

  useEffect(() => {
    let active = true;
    fetch(`/api/stores/${encodeURIComponent(params.slug)}/return-policy`, { cache: "no-store" })
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (active) setReturnPolicy(data?.status === "published" ? data.policy : null); })
      .catch(() => { if (active) setReturnPolicy(null); });
    return () => { active = false; };
  }, [params.slug]);

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(ar ? "ar" : "en");
    const filtered = products.filter(product =>
      !term || product.title.toLocaleLowerCase(ar ? "ar" : "en").includes(term) ||
      (product.description ?? "").toLocaleLowerCase(ar ? "ar" : "en").includes(term)
    );
    return [...filtered].sort((a, b) => {
      if (sort === "price-low") return Number(a.price) - Number(b.price);
      if (sort === "price-high") return Number(b.price) - Number(a.price);
      return 0;
    });
  }, [products, search, sort, ar]);

  const initial = store?.name?.trim().charAt(0).toLocaleUpperCase() || "W";

  return (
    <main className="min-h-screen bg-[#f7f6f2] text-[#17263d]" dir={ar ? "rtl" : "ltr"} lang={locale}>
      <header className="sticky top-0 z-30 border-b border-[#e8e5dd] bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-[72px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="WASLA home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#17263d] font-serif text-xl font-bold text-[#e0c17e]">W</span>
            <span className="text-sm font-extrabold tracking-[.16em]">WASLA</span>
          </Link>
          <nav className="flex items-center gap-3 text-xs font-semibold text-slate-600 sm:gap-6 sm:text-sm">
            <Link href="/" className="transition hover:text-[#a47e37]">{t.home}</Link>
            <Link href="/store-directory" className="transition hover:text-[#a47e37]">{ar ? "اكتشف المتاجر" : "Discover stores"}</Link>
            {store && <a href="#catalog" className="transition hover:text-[#a47e37]">{t.products}</a>}
            {store && <Link href={`/store/${encodeURIComponent(params.slug)}/orders`} className="hidden transition hover:text-[#a47e37] sm:inline">{t.track}</Link>}
          </nav>
          <span className="hidden rounded-full border border-[#e9e2d2] px-3 py-1.5 text-[11px] font-semibold text-[#92713a] sm:inline-flex">{t.eyebrow}</span>
        </div>
      </header>

      {loading ? (
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8" aria-live="polite">
          <div className="h-64 animate-pulse rounded-[28px] bg-[#e9e6de]" />
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">{[1,2,3,4].map(item => <div key={item} className="aspect-[4/5] animate-pulse rounded-2xl bg-[#e9e6de]" />)}</div>
          <p className="mt-5 text-center text-sm text-slate-500">{t.loading}</p>
        </div>
      ) : error ? (
        <section className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-5 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#eee8da] text-2xl font-bold text-[#a47e37]">W</span>
          <h1 className="mt-5 text-2xl font-bold">{error}</h1>
          <button type="button" onClick={() => void loadStore()} className="mt-6 rounded-xl bg-[#17263d] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#263e5e]">{t.retry}</button>
        </section>
      ) : store ? (
        <>
          <section className="relative isolate overflow-hidden bg-[#17263d] text-white">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_15%,rgba(213,181,113,.28),transparent_38%),radial-gradient(ellipse_at_10%_90%,rgba(91,121,151,.28),transparent_40%)]" />
            <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-16 lg:py-20">
              <div className="max-w-3xl">
                <div className="mb-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.22em] text-[#e0c17e]">
                  <span className="h-px w-8 bg-[#c6a15b]" /> {t.eyebrow}
                </div>
                <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl lg:text-6xl">{store.name}</h1>
                {store.businessName && <p className="mt-4 text-sm font-semibold text-[#e9d9b5] sm:text-base">{store.businessName}</p>}
                <p className="mt-5 max-w-2xl text-sm leading-8 text-slate-200 sm:text-base">
                  {store.businessDescription?.trim() || t.noDescription}
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <a href="#catalog" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#c6a15b] px-6 text-sm font-extrabold text-[#17263d] transition hover:bg-[#dfc58f]">{t.products} <span className="ms-3">↓</span></a>
                  {store.website && <a href={store.website} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/25 px-5 text-sm font-bold text-white transition hover:bg-white/10">{t.visit} ↗</a>}
                </div>
              </div>
              <div className="mx-auto grid h-36 w-36 place-items-center rounded-[36px] border border-[#d6b66f]/50 bg-white/5 shadow-[0_25px_90px_rgba(0,0,0,.2)] sm:h-48 sm:w-48 lg:me-8">
                <span className="font-serif text-7xl font-bold text-[#e0c17e] sm:text-8xl">{initial}</span>
              </div>
            </div>
            <div className="border-t border-white/10 bg-black/10">
              <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs text-slate-300 sm:px-8">
                <span>{products.length} {t.count}</span>
                <span>{t.secure}</span>
                <span className="text-[#e0c17e]">{t.powered}</span>
              </div>
            </div>
          </section>

          <section id="catalog" className="mx-auto max-w-[1440px] scroll-mt-24 px-4 py-12 sm:px-8 sm:py-16">
            <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[.2em] text-[#a47e37]">{t.all}</p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{t.products}</h2>
                <p className="mt-2 text-sm text-slate-500">{visibleProducts.length} {t.count}</p>
              </div>
              <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
                <label className="relative min-w-0 flex-1 md:min-w-[280px]">
                  <span className="sr-only">{t.search}</span>
                  <input value={search} onChange={event => setSearch(event.target.value)} placeholder={t.search} className="h-12 w-full rounded-xl border border-[#e3e0d8] bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#b89545] focus:ring-4 focus:ring-[#c6a15b]/10" />
                </label>
                <label className="flex h-12 items-center gap-2 rounded-xl border border-[#e3e0d8] bg-white px-3 text-xs font-semibold text-slate-500">
                  <span>{t.sort}</span>
                  <select value={sort} onChange={event => setSort(event.target.value)} className="max-w-[155px] bg-transparent text-sm font-bold text-[#17263d] outline-none">
                    <option value="newest">{t.newest}</option>
                    <option value="price-low">{t.priceLow}</option>
                    <option value="price-high">{t.priceHigh}</option>
                  </select>
                </label>
              </div>
            </div>

            {visibleProducts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#d9d4c8] bg-white px-5 py-16 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f3eee3] text-2xl text-[#a47e37]">⌕</span>
                <h3 className="mt-5 text-xl font-bold">{t.emptyTitle}</h3>
                <p className="mt-2 text-sm text-slate-500">{t.empty}</p>
                {search && <button type="button" onClick={() => setSearch("")} className="mt-5 text-sm font-bold text-[#92713a] underline">{t.clear}</button>}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                {visibleProducts.map((product, index) => (
                  <Link key={product.id} href={`/product/${product.id}`} className="group overflow-hidden rounded-2xl border border-[#e9e6df] bg-white transition duration-300 hover:-translate-y-1 hover:border-[#d6c49c] hover:shadow-[0_18px_50px_rgba(23,38,61,.10)]">
                    <div className="relative aspect-[4/4.5] overflow-hidden bg-[#f0eee8]">
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.imageUrl} alt={product.title} loading={index < 4 ? "eager" : "lazy"} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#fff,#e9e4d8)]"><span className="font-serif text-5xl font-bold text-[#c6a15b]">{initial}</span></div>
                      )}
                      <span className="absolute bottom-3 end-3 rounded-full bg-white/95 px-3 py-1.5 text-[10px] font-bold text-[#17263d] shadow-sm opacity-0 transition group-hover:opacity-100">{t.viewProduct} ↗</span>
                    </div>
                    <div className="p-3.5 sm:p-5">
                      <h3 className="line-clamp-2 min-h-[2.8em] text-sm font-bold leading-6 text-[#17263d] sm:text-base">{product.title}</h3>
                      {product.description && <p className="mt-2 line-clamp-2 min-h-[2.7em] text-xs leading-5 text-slate-500">{product.description}</p>}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#f0eee8] pt-3">
                        <span className="text-sm font-extrabold text-[#9a7638] sm:text-base">{formatPrice(product.price, product.currency, ar ? "ar" : "en")}</span>
                        <span className="text-[10px] font-bold text-slate-400 transition group-hover:text-[#9a7638]">↗</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="border-y border-[#e9e5db] bg-white">
            <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:py-16">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[.2em] text-[#a47e37]">{t.about}</p>
                <h2 className="mt-3 text-2xl font-extrabold">{store.name}</h2>
                <p className="mt-4 text-sm leading-8 text-slate-600">{store.businessDescription?.trim() || t.noDescription}</p>
                {store.website && <a href={store.website} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex text-sm font-bold text-[#92713a] underline">{t.visit} ↗</a>}
              </div>
              <div className="rounded-2xl border border-[#e9e5db] bg-[#faf9f6] p-5 sm:p-7">
                <h2 className="text-lg font-extrabold">{t.returns}</h2>
                {returnPolicy ? (
                  <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
                    <p>{returnPolicy.acceptsReturns ? t.returnsYes : t.returnsNo} · {returnPolicy.acceptsExchanges ? t.exchangeYes : t.exchangeNo} · {t.window} {returnPolicy.requestWindowDays} {t.days}</p>
                    {(ar ? returnPolicy.itemConditionsAr : returnPolicy.itemConditionsEn) && <p><strong>{t.conditions}</strong> {ar ? returnPolicy.itemConditionsAr : returnPolicy.itemConditionsEn}</p>}
                    {(ar ? returnPolicy.exclusionsAr : returnPolicy.exclusionsEn) && <p><strong>{t.exclusions}</strong> {ar ? returnPolicy.exclusionsAr : returnPolicy.exclusionsEn}</p>}
                    {(ar ? returnPolicy.buyerInstructionsAr : returnPolicy.buyerInstructionsEn) && <p>{ar ? returnPolicy.buyerInstructionsAr : returnPolicy.buyerInstructionsEn}</p>}
                    {(ar ? returnPolicy.contactInstructionsAr : returnPolicy.contactInstructionsEn) && <p><strong>{t.contact}:</strong> {ar ? returnPolicy.contactInstructionsAr : returnPolicy.contactInstructionsEn}</p>}
                  </div>
                ) : <p className="mt-3 text-sm leading-7 text-slate-600">{t.noPolicy}</p>}
                <div className="mt-5 border-t border-[#e8e3d8] pt-4 text-xs leading-6 text-slate-500">{t.rights} {t.legal}</div>
              </div>
            </div>
          </section>

          <footer className="bg-[#17263d] text-white">
            <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-5 px-5 py-8 sm:flex-row sm:items-center sm:px-8">
              <div><p className="font-extrabold tracking-[.16em]">WASLA</p><p className="mt-1 text-xs text-slate-400">{t.powered}</p></div>
              <div className="flex flex-wrap gap-5 text-xs font-semibold text-slate-300">
                <Link href="/" className="hover:text-[#e0c17e]">{t.home}</Link>
                <Link href={`/store/${encodeURIComponent(params.slug)}/orders`} className="hover:text-[#e0c17e]">{t.track}</Link>
                {store.website && <a href={store.website} target="_blank" rel="noopener noreferrer" className="hover:text-[#e0c17e]">{t.visit} ↗</a>}
              </div>
            </div>
          </footer>
        </>
      ) : null}
    </main>
  );
}
