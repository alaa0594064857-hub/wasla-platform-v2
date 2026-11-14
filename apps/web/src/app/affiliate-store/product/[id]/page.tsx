"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import WorkspaceHeader from "@/components/workspace-header";

type Item = {
  id: string; kind: "affiliate" | "editorial"; title_ar: string | null; title_en: string | null;
  description_ar: string | null; description_en: string | null; marketplace: string;
  disclosure_ar: string; disclosure_en: string; outbound_path: string; image_url: string | null;
};

export default function AffiliateProductPage() {
  const params = useParams<{ id: string }>();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState<"TR" | "US">("TR");
  const [marketReady, setMarketReady] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("country");
    if (requested === "TR" || requested === "US") setCountry(requested);
    setMarketReady(true);
  }, []);
  function updateMarket(nextCountry: "TR" | "US") {
    setCountry(nextCountry);
    const params = new URLSearchParams(window.location.search);
    params.set("country", nextCountry);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }
  useEffect(() => {
    let active = true;
    if (!marketReady) return;
    setLoading(true);
    setFailed(false);
    fetch(`/api/public/affiliate-items?country=${country}`, { cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error("Catalog request failed"); return r.json(); })
      .then(data => {
        if (!data.success || !Array.isArray(data.items)) throw new Error("Invalid catalog response");
        if (active) setItem(data.items.find((x: Item) => x.id === params.id) || null);
      })
      .catch(() => { if (active) { setItem(null); setFailed(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.id, country, marketReady, retryCount]);
  const title = item ? (ar ? item.title_ar || item.title_en : item.title_en || item.title_ar) || "" : "";
  const description = item ? (ar ? item.description_ar || item.description_en : item.description_en || item.description_ar) : "";
  return (
    <main dir={ar ? "rtl" : "ltr"} lang={locale} className="min-h-screen bg-[#f6f3ec] text-[#17253a]">
      <WorkspaceHeader section="account" />
      <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Link href={`/affiliate-store?country=${country}`} className="text-sm font-semibold text-[#96732e]">← {ar ? "العودة إلى المتجر" : "Back to store"}</Link>
          <label className="text-sm font-medium">{ar ? "سوق التسوق" : "Shopping market"}
            <select value={country} onChange={event => updateMarket(event.target.value as "TR" | "US")} className="ms-2 rounded-xl border border-[#ded6c7] bg-white px-3 py-2.5">
              <option value="TR">Türkiye</option><option value="US">United States</option>
            </select>
          </label>
        </div>
        {loading ? <p className="mt-8 rounded-2xl bg-white p-10 text-center">{ar ? "جارٍ تحميل المنتج..." : "Loading product..."}</p>
          : failed ? <div role="alert" className="mt-8 rounded-2xl bg-white p-10 text-center text-red-700">{ar ? "تعذر تحميل المنتج. تحقق من اتصالك وحاول مرة أخرى." : "Could not load this product. Check your connection and try again."}<div><button type="button" onClick={() => setRetryCount(value => value + 1)} className="mt-4 rounded-full bg-[#17253a] px-5 py-2.5 text-sm font-semibold text-white">{ar ? "إعادة المحاولة" : "Try again"}</button></div></div>
          : !item ? <p className="mt-8 rounded-2xl bg-white p-10 text-center">{ar ? "المنتج غير متاح حالياً." : "This product is currently unavailable."}</p>
          : <div className="mt-7 grid gap-8 rounded-3xl border border-[#e7e0d3] bg-white p-5 shadow-sm md:grid-cols-2 md:p-9">
            <div className="flex min-h-[320px] items-center justify-center rounded-2xl bg-[#f8f7f3] p-6 md:min-h-[480px]">
              {item.image_url ? <img src={item.image_url} alt={title} className="max-h-[440px] w-full object-contain" /> : <span className="text-6xl text-[#b59a5b]">W</span>}
            </div>
            <div className="flex flex-col justify-center py-3">
              <p className="text-sm font-semibold text-[#96732e]">{item.marketplace}</p>
              <h1 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">{title}</h1>
              <p className="mt-5 whitespace-pre-line text-base leading-8 text-slate-600">{description}</p>
              <p className="mt-6 rounded-xl bg-[#f6f3ec] p-4 text-sm leading-7 text-slate-600">
                {item.kind === "affiliate" ? (ar ? "السعر والتوفر والشحن يحددها البائع. قد تحصل WASLA على عمولة من عملية شراء مؤهلة دون تكلفة إضافية عليك." : "The retailer controls current pricing, availability and shipping. WASLA may earn a commission from a qualifying purchase at no extra cost to you.") : (ar ? "هذا عرض استكشافي من مصدر رسمي، وليس رابط تسويق بالعمولة. لا تسجل WASLA عمولة من هذا الرابط. تحقق من السعر والتوفر والشحن لدى المصدر." : "This is an editorial discovery listing from an official source, not an affiliate link. WASLA does not earn a commission from this link. Check price, availability and shipping with the source.")}
              </p>
              <a href={item.outbound_path} target="_blank" rel={item.kind === "affiliate" ? "sponsored nofollow noreferrer" : "noopener noreferrer"} className="mt-6 inline-flex justify-center rounded-xl bg-[#17253a] px-6 py-4 font-bold text-white hover:bg-[#263c5b]">
                {item.kind === "affiliate" ? (ar ? "الانتقال إلى موقع الشريك" : "Continue to partner") : (ar ? "زيارة المصدر الرسمي" : "Visit official source")} ↗
              </a>
              {item.kind === "affiliate" && <p className="mt-3 text-xs leading-6 text-slate-500">{ar ? item.disclosure_ar : item.disclosure_en}</p>}
            </div>
          </div>}
      </div>
    </main>
  );
}
