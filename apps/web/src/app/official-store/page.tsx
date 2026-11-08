"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import WorkspaceHeader from "@/components/workspace-header";

type OfficialProduct = {
  id: string;
  title_ar: string;
  title_en: string;
  description_ar: string | null;
  description_en: string | null;
  price: string;
  currency: string;
  availability_status: "available" | "limited" | "unavailable" | "needs_confirmation";
  image_url: string | null;
  created_at: string;
  deliveryCountries: string[];
  estimatedDeliveryDaysMin: number;
  estimatedDeliveryDaysMax: number;
};

export default function OfficialStorePage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [products, setProducts] = useState<OfficialProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<OfficialProduct | null>(null);
  const [destinationCountry, setDestinationCountry] = useState("");
  const [catalogueCountry, setCatalogueCountry] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState(false);

  const copy = ar ? {
    eyebrow: "المتجر الرسمي للمنصة",
    title: "WASLA Store",
    intro: "اكتشف منتجات المتجر الرسمي لوصلة. هذا المتجر مستقل عن متاجر الأعضاء، وتدار عملياته تحت إشراف مالك المنصة.",
    back: "العودة إلى الرئيسية",
    loading: "جارٍ تحميل المنتجات...",
    emptyTitle: "المتجر الرسمي قيد التجهيز",
    empty: "نعمل على تجهيز المنتجات والتحقق من الموردين قبل فتح المتجر للعملاء. لن نعرض منتجات غير مؤكدة.",
    unavailable: "تعذر تحميل الكتالوج حالياً. حاول مرة أخرى لاحقاً.",
    products: "منتجات المتجر الرسمي",
    catalogueCountry: "اختر دولة التوصيل لعرض المنتجات والأسعار المعتمدة", countryRequired: "أدخل رمز الدولة من حرفين، مثل TR لتركيا أو US لأمريكا.",
    details: "التفاصيل",
    close: "إغلاق",
    requestConfirmation: "اطلب تأكيد التوفر والتوصيل",
    chooseDestination: "اختر دولة التوصيل",
    customerNote: "ملاحظة (اختياري)",
    requestPending: "جارٍ إرسال الطلب...",
    requestSuccess: "تم تسجيل طلبك للمراجعة والتحقق من المورد. لم يتم خصم أي مبلغ ولم يتم شراء المنتج بعد.",
    myRequests: "متابعة طلباتي",
    requestLogin: "سجّل الدخول أولاً حتى نتمكن من حفظ طلبك.",
    requestFailure: "تعذر تسجيل الطلب. تحقق من الدولة أو حاول لاحقاً.",
    requestDisclaimer: "هذا طلب للتحقق من المورد والتوفر فقط، وليس عملية شراء أو دفع.",
    price: "السعر المعروض",
    availability: "التوفر",
    delivery: "الدول التي يشملها التوصيل",
    deliveryTime: "المدة التقديرية للتوصيل",
    days: "يوم",
    available: "متوفر",
    limited: "توفر محدود",
    unavailableStatus: "غير متوفر حالياً",
    note: "ستظهر تفاصيل التوفر والتوصيل بوضوح قبل تأكيد الطلب.",
    storePromise: "تجربة تسوق موحّدة وآمنة من WASLA.",
    footer: "المتجر الرسمي منفصل عن متاجر الأعضاء ومعاملاتهم."
  } : {
    eyebrow: "THE PLATFORM'S OFFICIAL STORE",
    title: "WASLA Store",
    intro: "Discover products from WASLA's official store. It is separate from member-owned shops and operates under the platform owner's oversight.",
    back: "Back to home",
    loading: "Loading products...",
    emptyTitle: "The official store is being prepared",
    empty: "We are preparing the catalogue and confirming suppliers before opening the store to customers. Unverified products will not be listed.",
    unavailable: "The catalogue could not be loaded. Please try again later.",
    products: "Official store products",
    catalogueCountry: "Choose a delivery country to view products and approved prices", countryRequired: "Enter a two-letter country code, such as TR or US.",
    details: "Details",
    close: "Close",
    requestConfirmation: "Request availability and delivery confirmation",
    chooseDestination: "Choose delivery destination",
    customerNote: "Note (optional)",
    requestPending: "Sending request...",
    requestSuccess: "Your request was recorded for review and supplier confirmation. No payment was taken and the product has not been purchased.",
    myRequests: "Track my requests",
    requestLogin: "Please sign in first so we can save your request.",
    requestFailure: "The request could not be recorded. Check the destination or try again later.",
    requestDisclaimer: "This only requests supplier and availability confirmation. It is not a purchase or payment.",
    price: "Listed price",
    supplier: "Supplier",
    availability: "Availability",
    delivery: "Delivery destinations",
    deliveryTime: "Estimated delivery",
    days: "days",
    available: "Available",
    limited: "Limited availability",
    unavailableStatus: "Currently unavailable",
    note: "Availability and delivery details will be clearly shown before an order is confirmed.",
    storePromise: "A seamless and secure shopping experience from WASLA.",
    footer: "The official store is separate from member stores and their transactions."
  };

  async function submitSupplierConfirmationRequest() {
    if (!selected || !destinationCountry || requesting) return;
    setRequesting(true);
    setRequestMessage("");
    setRequestError(false);
    try {
      const response = await fetch("/api/official-store/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productId: selected.id,
          destinationCountry,
          customerNote,
          confirmed: true,
        }),
      });
      const data = await response.json();
      if (response.status === 401) {
        setRequestError(true);
        setRequestMessage(copy.requestLogin);
      } else if (!response.ok || !data.success) {
        setRequestError(true);
        setRequestMessage(typeof data.error === "string" ? data.error : copy.requestFailure);
      } else {
        setRequestMessage(copy.requestSuccess);
        setCustomerNote("");
      }
    } catch {
      setRequestError(true);
      setRequestMessage(copy.requestFailure);
    } finally {
      setRequesting(false);
    }
  }

  function availabilityLabel(value: OfficialProduct["availability_status"]) {
    if (value === "available") return copy.available;
    if (value === "limited") return copy.limited;
    if (value === "unavailable") return copy.unavailableStatus;
    return copy.unavailableStatus;
  }

  useEffect(() => {
    let active = true;
    if (!/^[A-Z]{2}$/.test(catalogueCountry)) {
      setProducts([]); setLoading(false); setFailed(false);
      return () => { active = false; };
    }
    setLoading(true); setFailed(false);
    fetch(`/api/official-store/products?country=${encodeURIComponent(catalogueCountry)}`, { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error("catalogue");
        return Array.isArray(data.products) ? data.products as OfficialProduct[] : [];
      })
      .then(items => { if (active) setProducts(items); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [catalogueCountry]);

  return <main className="min-h-screen bg-[#f5f1e8] text-[#17253a]" dir={ar ? "rtl" : "ltr"} lang={locale}>
    <WorkspaceHeader section="account" />
    <section className="relative overflow-hidden border-b border-[#d9cfbb] bg-[#17253a] px-5 py-16 text-white md:px-12 md:py-24">
      <div className="pointer-events-none absolute -end-20 -top-28 h-80 w-80 rounded-full border border-[#b89545]/30" />
      <div className="pointer-events-none absolute -end-8 -top-16 h-56 w-56 rounded-full border border-[#b89545]/30" />
      <div className="relative mx-auto max-w-6xl">
        <span className="text-xs font-bold tracking-[.22em] text-[#d8bd7c]">{copy.eyebrow}</span>
        <h1 className="mt-4 text-4xl font-bold md:text-6xl">{copy.title}</h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-[#e4e8ef]">{copy.intro}</p>
        <Link href="/" className="mt-8 inline-flex rounded-xl border border-[#d8bd7c]/70 px-5 py-3 text-sm font-semibold text-[#f4e5bf] hover:bg-white/10">{copy.back} ↗</Link>
      </div>
    </section>
    <section className="mx-auto max-w-6xl px-5 py-12 md:px-8">
      <div className="mb-6 max-w-sm">
        <label className="block text-sm font-semibold">{copy.catalogueCountry}
          <input value={catalogueCountry} onChange={event => setCatalogueCountry(event.target.value.toUpperCase().slice(0,2))} maxLength={2} pattern="[A-Za-z]{2}" placeholder="TR" className="mt-2 w-full rounded-xl border border-[#d9cfbb] bg-white px-4 py-3 text-base text-[#17253a]" />
        </label>
        <p className="mt-2 text-xs text-slate-500">{copy.countryRequired}</p>
      </div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div><span className="text-xs font-bold tracking-widest text-[#9a742d]">WASLA OFFICIAL</span><h2 className="mt-2 text-2xl font-bold">{copy.products}</h2></div>
        <span className="rounded-full border border-[#d7c79f] bg-[#fffaf0] px-4 py-2 text-xs font-semibold text-[#755b29]">{copy.storePromise}</span>
      </div>
      {loading ? <p className="rounded-2xl bg-white p-8 text-center">{copy.loading}</p>
        : failed ? <p role="alert" className="rounded-2xl bg-white p-8 text-center text-[#963f35]">{copy.unavailable}</p>
        : products.length === 0 ? <div className="rounded-3xl border border-[#e0d7c6] bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#17253a] text-3xl font-black text-[#d8bd7c]">W</div>
            <h3 className="mt-6 text-2xl font-bold">{catalogueCountry ? copy.emptyTitle : copy.catalogueCountry}</h3>
            <p className="mx-auto mt-3 max-w-xl leading-8 text-slate-600">{catalogueCountry ? copy.empty : copy.countryRequired}</p>
          </div>
        : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map(product => <article key={product.id} className="overflow-hidden rounded-2xl border border-[#e4ddcf] bg-white shadow-sm">
            {product.image_url ? <img src={product.image_url} alt={ar ? product.title_ar : product.title_en} className="aspect-[4/3] w-full object-cover" /> : <div className="grid aspect-[4/3] place-items-center bg-[#ece6d9] text-6xl font-black text-[#b89545]">W</div>}
            <div className="p-5">
              <span className="text-xs font-semibold text-[#96732e]">{availabilityLabel(product.availability_status)}</span>
              <h3 className="mt-2 text-xl font-bold">{ar ? product.title_ar : product.title_en}</h3>
              <p className="mt-2 line-clamp-3 min-h-16 text-sm leading-7 text-slate-600">{(ar ? product.description_ar : product.description_en) || ""}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <strong className="text-lg text-[#8b6828]">{product.price} {product.currency}</strong>
                <button type="button" onClick={() => { setSelected(product); setDestinationCountry(catalogueCountry); setCustomerNote(""); setRequestMessage(""); setRequestError(false); }} className="rounded-lg bg-[#17253a] px-4 py-2.5 text-sm font-semibold text-white">{copy.details}</button>
              </div>
            </div>
          </article>)}
        </div>}
      <p className="mt-8 rounded-xl bg-[#eee7d8] p-4 text-sm leading-7 text-[#5c5548]">{copy.note}</p>
    </section>
    <footer className="border-t border-[#ddd4c3] px-5 py-7 text-center text-sm text-slate-600">{copy.footer}</footer>
    {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#101a2a]/70 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section role="dialog" aria-modal="true" aria-label={ar ? selected.title_ar : selected.title_en} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><h2 className="text-2xl font-bold">{ar ? selected.title_ar : selected.title_en}</h2><button type="button" onClick={() => setSelected(null)} className="rounded-lg border px-3 py-1.5 text-sm">{copy.close} ×</button></div>
        <p className="mt-4 whitespace-pre-wrap leading-8 text-slate-700">{(ar ? selected.description_ar : selected.description_en) || ""}</p>
        <p className="mt-5 text-xl font-bold text-[#8b6828]">{selected.price} {selected.currency}</p>
        <p className="mt-3 text-sm">{copy.availability}: {availabilityLabel(selected.availability_status)}</p>
        <div className="mt-4 rounded-xl bg-[#f5f1e8] p-4 text-sm leading-7">
          <p><strong>{copy.delivery}:</strong> {selected.deliveryCountries.join(", ")}</p>
          <p><strong>{copy.deliveryTime}:</strong> {selected.estimatedDeliveryDaysMin}–{selected.estimatedDeliveryDaysMax} {copy.days}</p>
        </div>
        <div className="mt-5 space-y-3">
          <label className="block text-sm font-semibold">{copy.chooseDestination}
            <select value={destinationCountry} onChange={event => setDestinationCountry(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9cfbb] bg-white px-3 py-3 text-base text-[#17253a]">
              {selected.deliveryCountries.map(country => <option key={country} value={country}>{country}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">{copy.customerNote}
            <textarea value={customerNote} onChange={event => setCustomerNote(event.target.value)} maxLength={1000} rows={2} className="mt-2 w-full rounded-xl border border-[#d9cfbb] bg-white px-3 py-3 text-base text-[#17253a]" />
          </label>
          <p className="text-xs leading-6 text-slate-500">{copy.requestDisclaimer}</p>
          {requestMessage && <p role={requestError ? "alert" : "status"} className={`rounded-xl p-3 text-sm leading-7 ${requestError ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{requestMessage}</p>}
          {requestMessage && !requestError && <Link href="/account/orders" className="inline-flex font-semibold text-[#8b6828] underline">{copy.myRequests}</Link>}
          <button type="button" disabled={requesting || !destinationCountry} onClick={submitSupplierConfirmationRequest} className="w-full rounded-xl bg-[#17253a] px-5 py-3 font-semibold text-white disabled:opacity-50">{requesting ? copy.requestPending : copy.requestConfirmation}</button>
        </div>
      </section>
    </div>}
  </main>;
}
