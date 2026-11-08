"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import WorkspaceHeader from "@/components/workspace-header";

type CustomerRequest = {
  id: string;
  orderNumber: string;
  productTitle: string;
  quantity: number;
  unitPrice: string;
  currency: string;
  orderStatus: string;
  supplierConfirmationStatus: string;
  paymentStatus: string;
  shippingStatus: string;
  destinationCountry: string | null;
  createdAt: string;
  updatedAt: string;
  finalQuoteAmount: string | null;
  finalQuoteCurrency: string | null;
  finalQuoteShippingDaysMin: number | null;
  finalQuoteShippingDaysMax: number | null;
  finalQuoteExpiresAt: string | null;
  finalQuoteStatus: string;
};

export default function OfficialStoreRequestsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busyQuote, setBusyQuote] = useState("");
  const [quoteMessage, setQuoteMessage] = useState("");

  const copy = ar ? {
    title: "طلباتي من متجر WASLA الرسمي",
    intro: "تابع طلبات التحقق من توفر المنتجات وتأكيد المورد والتوصيل.",
    back: "العودة إلى المتجر",
    loading: "جارٍ تحميل طلباتك...",
    signIn: "سجّل الدخول لعرض طلباتك.",
    empty: "لا توجد طلبات حتى الآن.",
    error: "تعذر تحميل الطلبات حالياً.",
    request: "رقم الطلب",
    product: "المنتج",
    destination: "دولة التوصيل",
    price: "السعر المعروض وقت الطلب",
    supplier: "تأكيد المورد",
    pending: "بانتظار التأكيد",
    accepted: "أكد المورد التوفر - بانتظار عرض السعر النهائي",
    rejected: "تعذر تأكيد التوفر",
    expired: "انتهت صلاحية العرض",
    payment: "الدفع",
    notEnabled: "الدفع غير مفعّل",
    created: "تاريخ الطلب",
    disclaimer: "هذه طلبات تحقق ومراجعة وليست مشتريات مؤكدة. لم يتم تحصيل أي مبلغ، ولا يتم شراء المنتج قبل تأكيد المورد ومراجعة WASLA.",
    store: "تصفح المتجر الرسمي"
  } : {
    title: "My WASLA official store requests",
    intro: "Track product availability, supplier confirmation and delivery checks.",
    back: "Back to store",
    loading: "Loading your requests...",
    signIn: "Sign in to view your requests.",
    empty: "You have no requests yet.",
    error: "Your requests could not be loaded.",
    request: "Request number",
    product: "Product",
    destination: "Delivery destination",
    price: "Listed price at request time",
    supplier: "Supplier confirmation",
    pending: "Awaiting confirmation",
    accepted: "Supplier confirmed availability — final quote pending",
    rejected: "Availability could not be confirmed",
    expired: "Offer expired",
    payment: "Payment",
    notEnabled: "Payment is not enabled",
    created: "Requested",
    disclaimer: "These are review and confirmation requests, not confirmed purchases. No payment was collected and no supplier purchase is placed before supplier confirmation and WASLA review.",
    store: "Browse official store"
  };

  useEffect(() => {
    let active = true;
    fetch("/api/official-store/orders", { credentials: "include", cache: "no-store" })
      .then(async response => {
        if (response.status === 401) { if (active) setSignedOut(true); return []; }
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error("requests");
        return Array.isArray(data.requests) ? data.requests as CustomerRequest[] : [];
      })
      .then(items => { if (active) setRequests(items); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function decideQuote(orderId: string, decision: "accepted" | "rejected") {
    if (busyQuote) return;
    setBusyQuote(orderId); setQuoteMessage("");
    try {
      const response = await fetch("/api/official-store/orders/" + orderId + "/quote-decision", {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(typeof data.error === "string" ? data.error : "quote");
      setQuoteMessage(ar
        ? (decision === "accepted" ? "وافقت على عرض السعر. لم يتم تحصيل أي مبلغ ولم يتم شراء المنتج." : "رفضت عرض السعر. لم يتم تحصيل أي مبلغ.")
        : (decision === "accepted" ? "You accepted the quote. No payment was taken and no purchase was placed." : "You declined the quote. No payment was taken."));
      const refreshed = await fetch("/api/official-store/orders", { credentials: "include", cache: "no-store" });
      const next = await refreshed.json();
      if (refreshed.ok && next.success && Array.isArray(next.requests)) setRequests(next.requests);
    } catch (error) {
      setQuoteMessage(error instanceof Error ? error.message : (ar ? "تعذر حفظ ردك." : "Could not save your response."));
    } finally { setBusyQuote(""); }
  }

  function supplierStatus(status: string) {
    if (status === "accepted") return copy.accepted;
    if (status === "rejected") return copy.rejected;
    if (status === "expired") return copy.expired;
    return copy.pending;
  }

  return <main className="min-h-screen bg-[#f5f1e8] text-[#17253a]" dir={ar ? "rtl" : "ltr"} lang={locale}>
    <WorkspaceHeader section="account" />
    <section className="border-b border-[#d9cfbb] bg-[#17253a] px-5 py-12 text-white md:px-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold md:text-4xl">{copy.title}</h1>
        <p className="mt-3 leading-8 text-[#e4e8ef]">{copy.intro}</p>
        <Link href="/official-store" className="mt-6 inline-flex rounded-xl border border-[#d8bd7c]/70 px-5 py-3 text-sm font-semibold text-[#f4e5bf]">{copy.back}</Link>
      </div>
    </section>
    <section className="mx-auto max-w-5xl space-y-5 px-5 py-10 md:px-8">
      {quoteMessage && <p role="status" className="rounded-xl bg-white p-4 text-sm">{quoteMessage}</p>}
      {loading ? <p className="rounded-2xl bg-white p-8 text-center">{copy.loading}</p>
        : signedOut ? <p className="rounded-2xl bg-white p-8 text-center">{copy.signIn} <Link className="font-bold underline" href="/login">Login</Link></p>
        : failed ? <p role="alert" className="rounded-2xl bg-white p-8 text-center text-red-800">{copy.error}</p>
        : requests.length === 0 ? <div className="rounded-2xl bg-white p-10 text-center"><p>{copy.empty}</p><Link href="/official-store" className="mt-4 inline-flex font-bold underline">{copy.store}</Link></div>
        : requests.map(item => <article key={item.id} className="rounded-2xl border border-[#e4ddcf] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-semibold text-[#96732e]">{copy.request}: {item.orderNumber}</p><h2 className="mt-2 text-xl font-bold">{item.productTitle}</h2></div>
            <span className="rounded-full bg-[#f5f1e8] px-3 py-2 text-xs font-semibold">{supplierStatus(item.supplierConfirmationStatus)}</span>
          </div>
          {item.finalQuoteStatus === "pending_customer" && item.finalQuoteExpiresAt && new Date(item.finalQuoteExpiresAt).getTime() > Date.now() && <div className="mt-5 rounded-xl border border-[#d6c08c] bg-[#fff9eb] p-4">
            <h3 className="font-bold">{ar ? "عرض السعر النهائي من WASLA" : "WASLA final quote"}</h3>
            <p className="mt-2">{ar ? "السعر النهائي" : "Final price"}: <strong>{item.finalQuoteAmount} {item.finalQuoteCurrency}</strong></p>
            <p>{ar ? "مدة التوصيل المتوقعة" : "Estimated delivery"}: {item.finalQuoteShippingDaysMin}–{item.finalQuoteShippingDaysMax} {ar ? "يوماً" : "days"}</p>
            <p className="text-sm">{ar ? "ينتهي العرض" : "Expires"}: {new Date(item.finalQuoteExpiresAt).toLocaleString(locale)}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button disabled={busyQuote === item.id} onClick={() => void decideQuote(item.id, "accepted")} className="rounded-lg bg-[#17253a] px-4 py-2 font-semibold text-white disabled:opacity-50">{ar ? "أوافق على السعر" : "Accept quote"}</button>
              <button disabled={busyQuote === item.id} onClick={() => void decideQuote(item.id, "rejected")} className="rounded-lg border border-[#a33d3d] px-4 py-2 font-semibold text-[#a33d3d] disabled:opacity-50">{ar ? "أرفض العرض" : "Decline quote"}</button>
            </div>
          </div>}
          {item.finalQuoteStatus === "accepted" && <p className="mt-4 rounded-xl bg-[#e8f2e9] p-4 text-sm">{ar ? "وافقت على عرض السعر. الدفع والشراء غير مفعّلين بعد." : "You accepted the quote. Payment and purchasing are not enabled yet."}</p>}
          {item.finalQuoteStatus === "expired" && <p className="mt-4 rounded-xl bg-[#f5f1e8] p-4 text-sm">{ar ? "انتهت صلاحية عرض السعر. تواصل مع WASLA لطلب تحديثه." : "This quote expired. Contact WASLA for an updated quote."}</p>}

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <p><strong>{copy.destination}:</strong> {item.destinationCountry || "—"}</p>
            <p><strong>{copy.price}:</strong> {item.unitPrice} {item.currency}</p>
            <p><strong>{copy.supplier}:</strong> {supplierStatus(item.supplierConfirmationStatus)}</p>
            <p><strong>{copy.payment}:</strong> {copy.notEnabled}</p>
            <p><strong>{copy.created}:</strong> {new Date(item.createdAt).toLocaleString(locale === "ar" ? "ar" : "en")}</p>
          </div>
        </article>)}
      <p className="rounded-xl bg-[#eee7d8] p-4 text-sm leading-7 text-[#5c5548]">{copy.disclaimer}</p>
    </section>
  </main>;
}
