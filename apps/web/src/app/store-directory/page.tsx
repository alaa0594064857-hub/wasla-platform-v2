"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type PublicStore = {
  id: string;
  name: string;
  slug: string;
  businessName?: string | null;
  countryCode?: string | null;
  businessDescription?: string | null;
  website?: string | null;
  logoReference?: string | null;
  activeProductCount: number;
};

const text = {
  ar: {
    eyebrow: "اكتشف علامات ومتاجر مستقلة", title: "متاجر من أسواق مختلفة، في مكان واحد.",
    intro: "تعرّف على المتاجر النشطة واكتشف منتجاتها. كل متجر يحتفظ بهويته وعلاقته المباشرة بعملائه.",
    search: "ابحث باسم المتجر أو الشركة", country: "رمز الدولة (مثل TR أو GB)",
    find: "بحث", clear: "مسح", products: "منتج متاح", visit: "زيارة المتجر",
    emptyTitle: "لم نعثر على متاجر مطابقة", empty: "جرّب اسماً آخر أو أزل فلتر الدولة.",
    loading: "نبحث عن المتاجر...", error: "تعذر تحميل المتاجر حالياً.",
    retry: "إعادة المحاولة", all: "دليل المتاجر", noDescription: "متجر مستقل على WASLA.",
    market: "سوق", count: "متجراً", verified: "متجر نشط", back: "الرئيسية",
  },
  en: {
    eyebrow: "Discover independent brands and stores", title: "Stores from different markets. One destination.",
    intro: "Explore active stores and discover their products. Every store keeps its own identity and direct customer relationship.",
    search: "Search by store or business name", country: "Country code (e.g. TR or GB)",
    find: "Search", clear: "Clear", products: "available products", visit: "Visit store",
    emptyTitle: "No matching stores found", empty: "Try another name or remove the country filter.",
    loading: "Finding stores...", error: "Stores could not be loaded right now.",
    retry: "Try again", all: "Store directory", noDescription: "An independent store on WASLA.",
    market: "Market", count: "stores", verified: "Active store", back: "Home",
  },
};

export default function StoreDirectoryPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const t = text[ar ? "ar" : "en"];
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [stores, setStores] = useState<PublicStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [submittedCountry, setSubmittedCountry] = useState("");\n  const requestId = useRef(0);

  const load = useCallback(async (q: string, market: string, signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (market.trim()) params.set("country", market.trim().toUpperCase());
      const response = await fetch(`/api/public/stores?${params.toString()}`, {
        cache: "no-store", signal,
      });
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.stores)) {
        throw new Error("directory");
      }
      if (requestId.current === currentRequest) setStores(data.stores);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setError(t.error);
      setStores([]);
    } finally {
      if (!signal?.aborted && requestId.current === currentRequest) setLoading(false);
    }
  }, [t.error]);

  useEffect(() => {
    const controller = new AbortController();
    void load("", "", controller.signal);
    return () => { controller.abort(); requestId.current += 1; };
  }, [load]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const market = country.trim().toUpperCase();
    if (market && !/^[A-Z]{2}$/.test(market)) {
      setError(ar ? "اكتب رمز دولة من حرفين فقط." : "Enter a two-letter country code.");
      return;
    }
    setSubmittedQuery(query.trim());
    setSubmittedCountry(market);
    void load(query.trim(), market);
  }

  function clear() {
    setQuery("");
    setCountry("");
    setSubmittedQuery("");
    setSubmittedCountry("");
    void load("", "");
  }

  return (
    <main className="min-h-screen bg-[#f7f6f2] text-[#17263d]" dir={ar ? "rtl" : "ltr"} lang={locale}>
      <WorkspaceHeader section="shops" />
      <section className="relative isolate overflow-hidden bg-[#17263d] text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_85%_15%,rgba(213,181,113,.28),transparent_38%),radial-gradient(ellipse_at_10%_90%,rgba(91,121,151,.28),transparent_40%)]" />
        <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-[11px] font-extrabold uppercase tracking-[.22em] text-[#e0c17e]">{t.eyebrow}</p>
          <h1 className="mt-5 max-w-4xl text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">{t.title}</h1>
          <p className="mt-5 max-w-2xl text-sm leading-8 text-slate-200 sm:text-base">{t.intro}</p>
          <form onSubmit={submit} className="mt-9 grid gap-3 rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur sm:grid-cols-[1fr_220px_auto]">
            <label className="min-w-0">
              <span className="sr-only">{t.search}</span>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t.search} className="h-12 w-full rounded-xl border border-white/10 bg-white px-4 text-sm text-[#17263d] outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-[#c6a15b]/20" />
            </label>
            <label className="min-w-0">
              <span className="sr-only">{t.country}</span>
              <input value={country} onChange={e => setCountry(e.target.value.toUpperCase().slice(0, 2))} placeholder={t.country} maxLength={2} className="h-12 w-full rounded-xl border border-white/10 bg-white px-4 text-sm uppercase text-[#17263d] outline-none placeholder:normal-case placeholder:text-slate-400 focus:ring-4 focus:ring-[#c6a15b]/20" />
            </label>
            <button type="submit" className="h-12 rounded-xl bg-[#c6a15b] px-7 text-sm font-extrabold text-[#17263d] transition hover:bg-[#dfc58f]">{t.find}</button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8 sm:py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[.2em] text-[#a47e37]">{t.all}</p>
            <h2 className="mt-2 text-3xl font-extrabold">{t.all}</h2>
            <p className="mt-2 text-sm text-slate-500">{stores.length} {t.count}</p>
          </div>
          {(submittedQuery || submittedCountry) && <button type="button" onClick={clear} className="rounded-xl border border-[#ded8ca] bg-white px-4 py-2.5 text-sm font-bold text-[#92713a]">{t.clear}</button>}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3].map(item => <div key={item} className="h-64 animate-pulse rounded-2xl bg-[#e9e6de]" />)}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[#e8dfd0] bg-white p-10 text-center">
            <p role="alert" className="text-sm text-red-700">{error}</p>
            <button type="button" onClick={() => void load(submittedQuery, submittedCountry)} className="mt-5 rounded-xl bg-[#17263d] px-5 py-3 text-sm font-bold text-white">{t.retry}</button>
          </div>
        ) : stores.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#d9d4c8] bg-white px-5 py-16 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f3eee3] text-2xl text-[#a47e37]">⌕</span>
            <h3 className="mt-5 text-xl font-bold">{t.emptyTitle}</h3>
            <p className="mt-2 text-sm text-slate-500">{t.empty}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map(store => (
              <article key={store.id} className="group overflow-hidden rounded-2xl border border-[#e9e6df] bg-white transition duration-300 hover:-translate-y-1 hover:border-[#d6c49c] hover:shadow-[0_18px_50px_rgba(23,38,61,.10)]">
                <div className="flex min-h-[132px] items-center gap-4 border-b border-[#efede7] bg-[linear-gradient(135deg,#f7f4ec,#eeece5)] p-5">
                  <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#e5dfd1] bg-white shadow-sm">
                    <span className="font-serif text-4xl font-bold text-[#b89545]">{store.name.trim().charAt(0).toUpperCase() || "W"}</span>\n                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#a47e37]">{t.verified}</span>
                    <h3 className="mt-1 truncate text-lg font-extrabold">{store.name}</h3>
                    {store.businessName && <p className="mt-1 truncate text-xs text-slate-500">{store.businessName}</p>}
                  </div>
                </div>
                <div className="p-5">
                  <p className="min-h-[3.5rem] text-sm leading-7 text-slate-600">{store.businessDescription?.trim() || t.noDescription}</p>
                  <div className="mt-4 flex items-center justify-between border-t border-[#efede7] pt-4 text-xs text-slate-500">
                    <span>{store.countryCode ? `${t.market}: ${store.countryCode}` : t.market}</span>
                    <strong className="text-[#92713a]">{store.activeProductCount} {t.products}</strong>
                  </div>
                  <Link href={`/store/${encodeURIComponent(store.slug)}`} className="mt-5 flex min-h-11 items-center justify-center rounded-xl bg-[#17263d] px-4 text-sm font-bold text-white transition group-hover:bg-[#263e5e]">{t.visit} <span className="ms-2">↗</span></Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <footer className="bg-[#17263d] px-5 py-7 text-center text-xs text-slate-300">WASLA · {t.all} · <Link href="/" className="text-[#e0c17e] underline">{t.back}</Link></footer>
    </main>
  );
}
