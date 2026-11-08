"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "@/components/locale-provider";

type Product = { id: string; title: string; description?: string; price: string; currency: string; imageUrl?: string; videoUrl?: string; sellerCheckoutUrl?: string | null; storeName: string; storeSlug: string };

export default function PublicProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { data: session } = authClient.useSession();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [quantity, setQuantity] = useState("1");
  useEffect(() => {
    let active = true;
    fetch(`/api/public/products/${encodeURIComponent(params.id)}`, { cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error("product"); return data.product; })
      .then(data => { if (active) setProduct(data); })
      .catch(() => { if (active) setError(ar ? "المنتج غير متاح." : "Product is unavailable."); });
    return () => { active = false; };
  }, [params.id, ar]);

  async function requireLogin() {
    if (!session?.user) { router.push("/login"); return false; }
    return true;
  }
  async function requestOrder() {
    if (!product || busy || !(await requireLogin())) return;
    const count = Number(quantity);
    if (!Number.isSafeInteger(count) || count < 1 || count > 10000) {
      setMessage(ar ? "أدخل كمية صحيحة بين 1 و10000." : "Enter a valid quantity from 1 to 10,000.");
      return;
    }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(product.storeSlug)}/orders`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ items: [{ productId: product.id, quantity: count }] })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(typeof data.error === "string" ? data.error : "order");
      setMessage(ar
        ? "تم إرسال طلبك إلى المتجر. الطلب بانتظار مراجعة البائع؛ لم يتم تحصيل أي مبلغ ولم يتم حجز المخزون."
        : "Your request was sent to the store. It is awaiting merchant review; no payment was collected and no stock was reserved.");
      router.push(`/store/${encodeURIComponent(product.storeSlug)}/orders`);
    } catch {
      setMessage(ar ? "تعذر إرسال الطلب. تحقق من تسجيل الدخول وحاول مرة أخرى." : "Could not submit the request. Check your sign-in and try again.");
    } finally { setBusy(false); }
  }
  async function contactSeller() {
    if (!product || busy || !(await requireLogin())) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/messages", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("message");
      router.push("/messages");
    } catch { setMessage(ar ? "تعذر بدء المحادثة. حاول لاحقاً." : "Could not start the conversation. Please try again."); }
    finally { setBusy(false); }
  }
  async function inquire() {
    if (!product || busy || !(await requireLogin())) return;
    const question = window.prompt(ar ? "اكتب استفسارك عن المنتج:" : "Write your product inquiry:");
    if (!question || question.trim().length < 5) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/product-inquiries", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id, message: question.trim() }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("inquiry");
      setMessage(ar ? "تم إرسال استفسارك إلى مسؤول المتجر." : "Your inquiry was sent to the store owner.");
    } catch { setMessage(ar ? "تعذر إرسال الاستفسار." : "Could not send the inquiry."); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-[#f7f4ec] text-[#14233b]" dir={ar ? "rtl" : "ltr"}>
    <header className="border-b border-[#e5dfd1] bg-white px-5 py-4"><Link href="/" className="font-bold tracking-wide">WASLA <span className="text-[#b89545]">وصلة</span></Link></header>
    <div className="mx-auto max-w-5xl px-4 py-10">
      {error ? <p role="alert">{error}</p> : !product ? <p>{ar ? "جارٍ تحميل المنتج..." : "Loading product..."}</p> : <div className="grid gap-8 rounded-3xl border border-[#e5dfd1] bg-white p-5 md:grid-cols-2 md:p-8">
        <div>{product.imageUrl ? <img src={product.imageUrl} alt={product.title} className="w-full rounded-2xl object-cover"/> : <div className="flex aspect-square items-center justify-center rounded-2xl bg-[#f2eee4] text-6xl font-bold text-[#b89545]">W</div>}</div>
        <div className="flex flex-col"><Link href={`/store/${product.storeSlug}`} className="text-sm text-[#9b792f] underline">{product.storeName}</Link><h1 className="mt-3 text-3xl font-bold">{product.title}</h1><p className="mt-4 whitespace-pre-wrap text-sm leading-8 text-slate-600">{product.description}</p><p className="mt-6 text-2xl font-bold text-[#9b792f]">{product.price} {product.currency}</p>
          <div className="mt-8 space-y-3"><label className="block text-sm font-semibold">{ar ? "الكمية المطلوبة" : "Quantity"}<input type="number" min="1" max="10000" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} className="mt-2 block w-28 rounded-lg border border-[#e5dfd1] px-3 py-2" /></label><button disabled={busy} onClick={() => void requestOrder()} className="rounded-xl bg-[#b89545] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{ar ? "إرسال طلب للمتجر" : "Request from store"}</button></div><div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} onClick={() => void contactSeller()} className="rounded-xl bg-[#14233b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{ar ? "مراسلة البائع" : "Message seller"}</button><button disabled={busy} onClick={() => void inquire()} className="rounded-xl border border-[#b89545] px-5 py-3 text-sm font-semibold text-[#14233b] disabled:opacity-50">{ar ? "استفسار عن المنتج" : "Ask about product"}</button></div>
          {product.sellerCheckoutUrl && <div className="mt-4 rounded-xl border border-[#e5dfd1] bg-[#f7f4ec] p-4 text-sm leading-7 text-slate-600">
            {ar ? "سيتم إكمال الشراء لدى المتجر البائع. البائع مسؤول عن تحصيل الدفع وتجهيز الطلب والتوصيل والإرجاع وخدمة ما بعد البيع." : "Checkout takes place with the member seller. The seller is responsible for payment collection, order fulfilment, delivery, returns and after-sales service."}
          </div>}
          {product.sellerCheckoutUrl && <a href={product.sellerCheckoutUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex w-fit rounded-xl bg-[#b89545] px-5 py-3 text-sm font-semibold text-white">{ar ? "الشراء من البائع" : "Buy from seller"} ↗</a>}
          {message && <p role="status" className="mt-4 rounded-xl bg-[#f7f4ec] p-3 text-sm">{message}</p>}
        </div>
      </div>}
    </div>
  </main>;
}
