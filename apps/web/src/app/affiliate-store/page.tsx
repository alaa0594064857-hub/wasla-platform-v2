"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import WorkspaceHeader from "@/components/workspace-header";

type AffiliateItem = {
  id: string;
  title_ar: string | null;
  title_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  marketplace: string;
  destination_country: string;
  disclosure_ar: string;
  disclosure_en: string;
  outbound_path: string;
};

export default function AffiliateStorePage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [country, setCountry] = useState("TR");
  const [items, setItems] = useState<AffiliateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
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
  }, [country]);

  const copy = ar ? {
    eyebrow: "WASLA AFFILIATE SHOPPING",
    title: "اكتشف منتجات من أسواق موثوقة",
    intro: "مساحة لاكتشاف المنتجات عبر برامج شراكة معتمدة. عند اختيار منتج، تنتقل إلى موقع المتجر الشريك لإتمام الشراء والدفع والتوصيل معه مباشرة.",
    country: "السوق / دولة التسوق",
    emptyTitle: "نجهّز أول مجموعة منتجات",
    empty: "لا توجد حالياً منتجات عمولة معتمدة ومتاحة لهذا السوق. لن نعرض روابط أو أسعاراً غير مؤكدة. نضيف المنتجات بعد اعتماد برنامج الشراكة والتحقق من مصدر البيانات والرابط.",
    loading: "جارٍ التحقق من المنتجات المتاحة...",
    failed: "تعذر تحميل المنتجات الآن. حاول مرة أخرى لاحقاً.",
    disclosureTitle: "إفصاح مهم",
    disclosure: "قد تحصل WASLA على عمولة عند الشراء عبر بعض الروابط المؤهلة، دون تكلفة إضافية عليك. يظهر الإفصاح بجوار رابط المنتج عندما تتوفر منتجات معتمدة.",
    howTitle: "كيف يعمل هذا المتجر؟",
    step1: "تصفّح منتجات معتمدة ومناسبة للسوق المختار.",
    step2: "انتقل إلى موقع البائع الشريك عبر رابط واضح.",
    step3: "أكمل الدفع والشحن وخدمة ما بعد البيع لدى البائع نفسه.",
    back: "العودة إلى عوالم WASLA",
    noPayment: "لا تستلم WASLA دفعتك ولا تنفّذ الطلبات نيابة عن المتجر الشريك."
  } : {
    eyebrow: "WASLA AFFILIATE SHOPPING",
    title: "Discover products from trusted marketplaces",
    intro: "A product-discovery space for approved partner programs. When you choose an item, you continue to the partner retailer to complete checkout, payment and delivery directly with them.",
    country: "Marketplace / shopping country",
    emptyTitle: "We are preparing the first product collection",
    empty: "There are currently no approved affiliate products available for this marketplace. We will not show unverified links or prices. Products are added only after partner approval and source and link verification.",
    loading: "Checking available products...",
    failed: "Products could not be loaded right now. Please try again later.",
    disclosureTitle: "Important disclosure",
    disclosure: "WASLA may earn a commission from qualifying purchases through selected links, at no additional cost to you. A disclosure will appear beside each eligible product link.",
    howTitle: "How this store works",
    step1: "Browse approved products for your selected marketplace.",
    step2: "Continue to the partner retailer through a clearly identified link.",
    step3: "Complete payment, shipping and after-sales service with that retailer.",
    back: "Back to WASLA worlds",
    noPayment: "WASLA does not collect your payment or place orders on the partner retailer's behalf."
  };

  return (
    <main dir={ar ? "rtl" : "ltr"} lang={locale} className="min-h-screen bg-[#f5f1e8] text-[#17253a]">
      <WorkspaceHeader section="account" />
      <section className="border-b border-[#d9cfbb] bg-[#17253a] px-5 py-14 text-white md:px-10 md:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold tracking-[.2em] text-[#d8bd7c]">{copy.eyebrow}</p>
          <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-tight md:text-5xl">{copy.title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#e4e8ef]">{copy.intro}</p>
          <Link href="/" className="mt-7 inline-flex rounded-xl border border-[#d8bd7c]/70 px-5 py-3 text-sm font-semibold text-[#f4e5bf] hover:bg-white/10">{copy.back} ↗</Link>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-10 md:grid-cols-[minmax(0,1fr)_320px] md:px-8">
        <div className="space-y-6">
          <label className="block max-w-sm text-sm font-semibold">
            {copy.country}
            <select value={country} onChange={event => setCountry(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbb] bg-white px-4 py-3 text-base">
              <option value="TR">Türkiye (TR)</option>
              <option value="US">United States (US)</option>
            </select>
          </label>
          {loading ? <p className="rounded-2xl bg-white p-8 text-center">{copy.loading}</p>
            : failed ? <p role="alert" className="rounded-2xl bg-white p-8 text-center text-red-700">{copy.failed}</p>
            : items.length === 0 ? <div className="rounded-3xl border border-[#e0d7c6] bg-white px-6 py-14 text-center shadow-sm">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#17253a] text-3xl font-black text-[#d8bd7c]">W</div>
                <h2 className="mt-6 text-2xl font-bold">{copy.emptyTitle}</h2>
                <p className="mx-auto mt-3 max-w-xl leading-8 text-slate-600">{copy.empty}</p>
              </div>
            : <div className="grid gap-5 sm:grid-cols-2">
                {items.map(item => <article key={item.id} className="rounded-2xl border border-[#e4ddcf] bg-white p-5 shadow-sm">
                  <span className="text-xs font-semibold text-[#96732e]">{item.marketplace}</span>
                  <h2 className="mt-2 text-lg font-bold">{ar ? item.title_ar : item.title_en}</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{(ar ? item.description_ar : item.description_en) || ""}</p>
                  <p className="mt-4 text-xs leading-6 text-slate-500">{ar ? item.disclosure_ar : item.disclosure_en}</p>
                  <a href={item.outbound_path} target="_blank" rel="sponsored nofollow noreferrer" className="mt-4 inline-flex rounded-lg bg-[#17253a] px-4 py-3 text-sm font-semibold text-white">{ar ? "عرض لدى المتجر الشريك" : "View at partner retailer"} ↗</a>
                </article>)}
              </div>}
        </div>
        <aside className="h-fit space-y-5">
          <div className="rounded-2xl border border-[#d9cfbb] bg-white p-5">
            <h2 className="font-bold">{copy.disclosureTitle}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">{copy.disclosure}</p>
          </div>
          <div className="rounded-2xl bg-[#eee7d8] p-5">
            <h2 className="font-bold">{copy.howTitle}</h2>
            <ol className="mt-3 list-decimal space-y-3 ps-5 text-sm leading-7 text-slate-700">
              <li>{copy.step1}</li>
              <li>{copy.step2}</li>
              <li>{copy.step3}</li>
            </ol>
            <p className="mt-4 border-t border-[#d9cfbb] pt-4 text-xs leading-6 text-slate-600">{copy.noPayment}</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
