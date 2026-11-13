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
  useEffect(() => {
    let active = true;
    fetch("/api/public/affiliate-items?country=TR", { cache: "no-store" })
      .then(r => r.json())
      .then(data => { if (active && data.success && Array.isArray(data.items)) setItem(data.items.find((x: Item) => x.id === params.id) || null); })
      .catch(() => { if (active) setItem(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.id]);
  const title = item ? (ar ? item.title_ar || item.title_en : item.title_en || item.title_ar) : "";
  const description = item ? (ar ? item.description_ar || item.description_en : item.description_en || item.description_ar) : "";
  return (
    <main dir={ar ? "rtl" : "ltr"} lang={locale} className="min-h-screen bg-[#f6f3ec] text-[#17253a]">
      <WorkspaceHeader section="account" />
      <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
        <Link href="/affiliate-store" className="text-sm font-semibold text-[#96732e]">← {ar ? "العودة إلى المتجر" : "Back to store"}</Link>
        {loading ? <p className="mt-8 rounded-2xl bg-white p-10 text-center">{ar ? "جارٍ تحميل المنتج..." : "Loading product..."}</p>
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
                {ar ? "السعر والتوفر والشحن يحددها البائع في صفحته. تنتقل إليه لإتمام الشراء والدفع مباشرة." : "The retailer controls current pricing, availability and shipping. Continue to its website to complete checkout and payment directly."}
              </p>
              <a href={item.outbound_path} target="_blank" rel={item.kind === "affiliate" ? "sponsored nofollow noreferrer" : "noopener noreferrer"} className="mt-6 inline-flex justify-center rounded-xl bg-[#17253a] px-6 py-4 font-bold text-white hover:bg-[#263c5b]">
                {ar ? "الانتقال إلى موقع البائع" : "Continue to retailer"} ↗
              </a>
              {item.kind === "affiliate" && <p className="mt-3 text-xs leading-6 text-slate-500">{ar ? item.disclosure_ar : item.disclosure_en}</p>}
            </div>
          </div>}
      </div>
    </main>
  );
}
