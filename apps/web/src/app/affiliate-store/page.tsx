"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import WorkspaceHeader from "@/components/workspace-header";

type AffiliateItem = {
  id: string; kind: "affiliate" | "editorial";
  title_ar: string | null; title_en: string | null;
  description_ar: string | null; description_en: string | null;
  marketplace: string; destination_country: string;
  disclosure_ar: string; disclosure_en: string;
  outbound_path: string; image_url: string | null;
};

const categories = [
  { slug: "electronics", icon: "⚡", ar: "الإلكترونيات والشواحن", en: "Electronics & chargers" },
  { slug: "drinkware", icon: "🥤", ar: "الأكواب والقوارير", en: "Drinkware & bottles" },
  { slug: "all", icon: "▦", ar: "كل المنتجات", en: "All products" }
];

function categoryFor(item: AffiliateItem) {
  const text = `${item.title_en || ""} ${item.title_ar || ""}`.toLowerCase();
  if (/owala|stanley|tumbler|bottle|قارورة|كوب/.test(text)) return "drinkware";
  return "electronics";
}

export default function AffiliateStorePage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [country, setCountry] = useState("TR");
  const [marketReady, setMarketReady] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [items, setItems] = useState<AffiliateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("featured");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedCountry = params.get("country");
    const selectedCategory = params.get("category");
    if (selectedCountry && /^[A-Z]{2}$/.test(selectedCountry.toUpperCase())) setCountry(selectedCountry.toUpperCase());
    if (selectedCategory && categories.some(value => value.slug === selectedCategory)) setCategory(selectedCategory);
    setMarketReady(true);
  }, []);

  function updateMarket(nextCountry: string) {
    setCountry(nextCountry);
    const params = new URLSearchParams(window.location.search);
    params.set("country", nextCountry);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/affiliate-store?${query}` : "/affiliate-store");
  }

  useEffect(() => {
    let active = true;
    if (!marketReady) return;
    setLoading(true); setFailed(false);
    fetch(`/api/public/affiliate-items?country=${encodeURIComponent(country)}`, { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.success || !Array.isArray(data.items)) throw new Error("catalog");
        return data.items as AffiliateItem[];
      })
      .then(result => { if (active) setItems(result); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [country, marketReady, retryCount]);

  const copy = ar ? {
    eyebrow: "WASLA MARKETPLACE", title: "اكتشف، ابحث، وتسوق بذكاء",
    intro: "كل ما تبحث عنه في مكان واحد. تصفّح الأقسام أو ابحث عن المنتج، ثم انتقل بأمان إلى موقع البائع لإتمام الشراء.",
    search: "ابحث عن منتج أو علامة تجارية...", country: "سوق التسوق",
    all: "كل المنتجات", results: "منتج", loading: "جارٍ تحميل المنتجات...",
    failed: "تعذر تحميل المنتجات الآن. حاول مرة أخرى.",
    empty: "لا توجد منتجات تطابق بحثك حالياً.", featured: "ترتيب العرض",
    featuredOption: "المميزة أولاً", az: "الاسم: أ إلى ي",
    view: "عرض التفاصيل", seller: "المصدر الرسمي", affiliate: "رابط شراكة",
    disclosure: "قد تحصل WASLA على عمولة من بعض عمليات الشراء المؤهلة دون تكلفة إضافية عليك.",
    trust: "تفاصيل المنتج والشراء والتوفر تُراجع على الموقع الرسمي للعلامة أو البائع.",
    shop: "تصفّح المنتجات", back: "الرئيسية"
  } : {
    eyebrow: "WASLA MARKETPLACE", title: "Discover, search and shop smarter",
    intro: "Everything you are looking for in one place. Browse categories or search for a product, then continue securely to the retailer to complete your purchase.",
    search: "Search products or brands...", country: "Shopping market",
    all: "All products", results: "products", loading: "Loading products...",
    failed: "Products could not be loaded. Please try again.",
    empty: "No products currently match your search.", featured: "Sort products",
    featuredOption: "Featured first", az: "Name: A to Z",
    view: "View details", seller: "Official source", affiliate: "Partner link",
    disclosure: "WASLA may earn a commission on qualifying purchases at no extra cost to you.",
    trust: "Check product details, purchase terms and availability on the official brand or retailer website.",
    shop: "Browse products", back: "Home"
  };

  const visibleItems = useMemo(() => {
    let result = items.filter(item => {
      const matchesCategory = category === "all" || categoryFor(item) === category;
      const haystack = `${item.title_ar || ""} ${item.title_en || ""} ${item.description_ar || ""} ${item.description_en || ""} ${item.marketplace || ""}`.toLowerCase();
      return matchesCategory && haystack.includes(search.trim().toLowerCase());
    });
    if (sort === "az") result = [...result].sort((a,b) => (a.title_en || "").localeCompare(b.title_en || ""));
    return result;
  }, [items, category, search, sort]);

  return (
    <main dir={ar ? "rtl" : "ltr"} lang={locale} className="min-h-screen bg-[#f6f3ec] text-[#17253a]">
      <WorkspaceHeader section="account" />
      <section className="bg-[#17253a] px-5 pb-12 pt-12 text-white md:px-10 md:pb-16">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold tracking-[.22em] text-[#d8bd7c]">{copy.eyebrow}</p>
          <div className="mt-4 grid gap-7 md:grid-cols-[1fr_360px] md:items-end">
            <div><h1 className="max-w-3xl text-3xl font-bold leading-tight md:text-5xl">{copy.title}</h1>
              <p className="mt-4 max-w-2xl leading-8 text-[#e2e7ef]">{copy.intro}</p></div>
            <div className="rounded-2xl bg-white p-2 shadow-xl">
              <label className="flex items-center gap-3 rounded-xl px-3 text-[#17253a]">
                <span className="text-2xl">⌕</span>
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder={copy.search} aria-label={copy.search} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-slate-400" />
                {search && <button onClick={() => setSearch("")} className="px-2 text-slate-500" aria-label="Clear search">×</button>}
              </label>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {categories.map(value => <Link key={value.slug} href={value.slug === "all" ? `/affiliate-store?country=${country}` : `/affiliate-store/category/${value.slug}?country=${country}`}
              onClick={() => setCategory(value.slug)}
              className={`rounded-full border px-5 py-3 text-sm font-semibold transition ${category === value.slug ? "border-[#d8bd7c] bg-[#d8bd7c] text-[#17253a]" : "border-white/25 bg-white/5 text-white hover:bg-white/10"}`}>
              <span className="me-2">{value.icon}</span>{ar ? value.ar : value.en}
            </Link>)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="text-2xl font-bold">{category === "all" ? copy.all : (ar ? categories.find(c => c.slug === category)?.ar : categories.find(c => c.slug === category)?.en)}</h2>
            <p className="mt-1 text-sm text-slate-500">{visibleItems.length} {copy.results}</p></div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium">{copy.country}
              <select value={country} onChange={event => updateMarket(event.target.value)} className="ms-2 rounded-xl border border-[#ded6c7] bg-white px-3 py-2.5">
                <option value="TR">Türkiye</option><option value="US">United States</option>
              </select>
            </label>
            <select aria-label={copy.featured} value={sort} onChange={event => setSort(event.target.value)} className="rounded-xl border border-[#ded6c7] bg-white px-3 py-2.5 text-sm">
              <option value="featured">{copy.featuredOption}</option><option value="az">{copy.az}</option>
            </select>
          </div>
        </div>

        {loading ? <div className="rounded-2xl bg-white p-12 text-center">{copy.loading}</div>
          : failed ? <div role="alert" className="rounded-2xl bg-white p-12 text-center text-red-700">{copy.failed}<div><button type="button" onClick={() => setRetryCount(value => value + 1)} className="mt-4 rounded-full bg-[#17253a] px-5 py-2.5 text-sm font-semibold text-white">{ar ? "إعادة المحاولة" : "Try again"}</button></div></div>
          : visibleItems.length === 0 ? <div className="rounded-2xl border border-[#e5dece] bg-white p-14 text-center"><div className="text-5xl">⌕</div><p className="mt-4 text-lg font-semibold">{copy.empty}</p></div>
          : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleItems.map(item => <article key={item.id} className="group overflow-hidden rounded-2xl border border-[#e7e0d3] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
              <Link href={`/affiliate-store/product/${item.id}?country=${country}`} className="block">
                <div className="relative flex h-64 items-center justify-center bg-[#f8f7f3] p-5">
                  {item.image_url ? <img src={item.image_url} alt={ar ? item.title_ar || item.title_en || "صورة المنتج" : item.title_en || item.title_ar || "Product image"} loading="lazy" className="h-full w-full object-contain transition duration-300 group-hover:scale-105" /> : <div className="text-5xl text-[#b59a5b]">W</div>}
                  <span className="absolute start-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-bold text-[#8b6d2f] shadow-sm">{item.kind === "affiliate" ? copy.affiliate : copy.seller}</span>
                </div>
                <div className="p-5">
                  <p className="text-xs text-slate-500">{item.marketplace}</p>
                  <h3 className="mt-2 min-h-12 font-bold leading-6 group-hover:text-[#96732e]">{ar ? item.title_ar || item.title_en : item.title_en || item.title_ar}</h3>
                  <p className="mt-2 line-clamp-2 min-h-12 text-sm leading-6 text-slate-600">{ar ? item.description_ar : item.description_en}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#96732e]">{copy.view} <span>↗</span></span>
                </div>
              </Link>
            </article>)}
          </div>}
      </section>
      <footer className="border-t border-[#ded6c7] bg-white px-5 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm leading-7 text-slate-600 md:flex-row md:justify-between">
          {items.some(item => item.kind === "affiliate") && <p>{copy.disclosure}</p>}<p>{copy.trust}</p>
        </div>
      </footer>
    </main>
  );
}
