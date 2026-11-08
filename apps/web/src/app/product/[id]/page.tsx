"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "@/components/locale-provider";

type Product = { id: string; title: string; description?: string; price: string; currency: string; imageUrl?: string; videoUrl?: string; sellerCheckoutUrl?: string | null; storeName: string; storeSlug: string };
type ProductReview = { id: string; rating: number; title: string | null; body: string; createdAt: string; buyerLabel: string; storeResponse?: string | null; storeResponseCreatedAt?: string | null };

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
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewSummary, setReviewSummary] = useState<{ count: number; average: string } | null>(null);
  const [reviewRating, setReviewRating] = useState("5");
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [sellerResponseBody, setSellerResponseBody] = useState("");
  const [sellerResponseBusy, setSellerResponseBusy] = useState(false);
  const [sellerResponseMessage, setSellerResponseMessage] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/public/products/${encodeURIComponent(params.id)}`, { cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error("product"); return data.product; })
      .then(data => { if (active) setProduct(data); })
      .catch(() => { if (active) setError(ar ? "المنتج غير متاح." : "Product is unavailable."); });
    return () => { active = false; };
  }, [params.id, ar]);

  useEffect(() => {
    if (!product?.id) return;
    let active = true;
    fetch(`/api/products/${encodeURIComponent(product.id)}/reviews`, { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error("reviews");
        if (active) {
          setReviews(Array.isArray(data.reviews) ? data.reviews as ProductReview[] : []);
          setReviewSummary(data.summary ?? { count: 0, average: "0" });
        }
      })
      .catch(() => { if (active) { setReviews([]); setReviewSummary({ count: 0, average: "0" }); } });
    return () => { active = false; };
  }, [product?.id]);

  async function submitReview() {
    if (!product || reviewBusy || !(await requireLogin())) return;
    const rating = Number(reviewRating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || reviewBody.trim().length < 10 || reviewBody.trim().length > 2000) {
      setReviewMessage(ar ? "اختر تقييماً من 1 إلى 5 واكتب مراجعة من 10 إلى 2000 حرف." : "Choose a rating from 1 to 5 and write a review between 10 and 2,000 characters.");
      return;
    }
    setReviewBusy(true); setReviewMessage("");
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(product.id)}/reviews`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, title: reviewTitle.trim() || undefined, body: reviewBody.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(typeof data.error === "string" ? data.error : "review");
      setReviewTitle(""); setReviewBody(""); setReviewRating("5");
      setReviewMessage(ar ? "وصل تقييمك. سيظهر بعد مراجعته واعتماده من فريق WASLA." : "Your review was submitted. It will appear after WASLA moderation and approval.");
    } catch (cause) {
      setReviewMessage(cause instanceof Error && cause.message ? cause.message :
        (ar ? "تعذر إرسال التقييم. يجب أن تكون قد أكملت شراء هذا المنتج واستلامه." : "Could not submit the review. You must have completed and received this product."));
    } finally { setReviewBusy(false); }
  }

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
      {product && <section className="mt-8 rounded-3xl border border-[#e5dfd1] bg-white p-5 md:p-8" aria-labelledby="product-reviews-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="product-reviews-heading" className="text-2xl font-bold">{ar ? "تقييمات المشترين" : "Buyer reviews"}</h2><p className="mt-2 text-sm text-slate-600">{ar ? "التقييمات المنشورة من مشترين أكملوا شراء المنتج فقط." : "Published reviews are from buyers who completed a purchase of this product."}</p></div>
          <div className="rounded-xl bg-[#f7f4ec] px-4 py-3 text-center"><strong className="text-xl">{reviewSummary?.average ?? "0"}/5</strong><small className="block text-slate-500">{reviewSummary?.count ?? 0} {ar ? "تقييم" : "reviews"}</small></div>
        </div>
        <div className="mt-5 grid gap-4">
          {reviews.length ? reviews.map(review => <article key={review.id} className="border-t border-[#eee8dc] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{review.title || (ar ? "تقييم مشتري" : "Buyer review")}</strong><span className="text-[#9b792f]" aria-label={`${review.rating} / 5`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)} <small className="text-slate-500">{review.rating}/5</small></span></div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{review.body}</p>
            <small className="mt-2 block text-slate-500">{review.buyerLabel} · {new Date(review.createdAt).toLocaleDateString(ar ? "ar" : "en")}</small>
            {review.storeResponse && <div className="mt-4 rounded-xl border border-[#e5dfd1] bg-[#f7f4ec] p-4"><strong className="text-sm">{ar ? "رد المتجر" : "Store response"}</strong><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{review.storeResponse}</p></div>}
          </article>) : <p className="rounded-xl bg-[#f7f4ec] p-4 text-sm text-slate-600">{ar ? "لا توجد تقييمات منشورة بعد." : "No published reviews yet."}</p>}
        </div>
        <div className="mt-7 border-t border-[#eee8dc] pt-6">
          <h3 className="text-lg font-bold">{ar ? "أضف تقييمك" : "Write a review"}</h3>
          <p className="mt-1 text-sm text-slate-600">{ar ? "يمكن فقط للمشتري الذي أكمل الطلب تأكيداً واستلاماً تقييم المنتج." : "Only a buyer with a completed and received order can review this product."}</p>
          {session?.user ? <div className="mt-4 grid max-w-2xl gap-3">
            <label className="text-sm font-semibold">{ar ? "التقييم" : "Rating"}
              <select value={reviewRating} onChange={event => setReviewRating(event.target.value)} className="mt-1 block rounded-lg border border-[#e5dfd1] bg-white px-3 py-2">{[5,4,3,2,1].map(value => <option key={value} value={value}>{value} / 5</option>)}</select>
            </label>
            <label className="text-sm font-semibold">{ar ? "عنوان التقييم (اختياري)" : "Review title (optional)"}
              <input value={reviewTitle} onChange={event => setReviewTitle(event.target.value)} maxLength={120} className="mt-1 block w-full rounded-lg border border-[#e5dfd1] px-3 py-2" />
            </label>
            <label className="text-sm font-semibold">{ar ? "تفاصيل تجربتك" : "Your experience"}
              <textarea value={reviewBody} onChange={event => setReviewBody(event.target.value)} minLength={10} maxLength={2000} rows={4} required className="mt-1 block w-full rounded-lg border border-[#e5dfd1] px-3 py-2" placeholder={ar ? "اكتب مراجعة واضحة لا تقل عن 10 أحرف..." : "Write a helpful review (at least 10 characters)..."} />
            </label>
            <button type="button" disabled={reviewBusy} onClick={() => void submitReview()} className="w-fit rounded-xl bg-[#14233b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{reviewBusy ? (ar ? "جارٍ الإرسال..." : "Submitting...") : (ar ? "إرسال التقييم" : "Submit review")}</button>
          </div> : <button type="button" onClick={() => router.push("/login")} className="mt-3 rounded-xl border border-[#b89545] px-4 py-2 text-sm font-semibold">{ar ? "سجّل الدخول لإضافة تقييم" : "Sign in to write a review"}</button>}
          {reviewMessage && <p role="status" className="mt-3 rounded-xl bg-[#f7f4ec] p-3 text-sm">{reviewMessage}</p>}
        </div>
      </section>}
    </div>
  </main>;
}
