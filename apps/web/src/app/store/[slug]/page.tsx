"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale } from "../../../components/locale-provider";

type Product = { id: string; title: string; description?: string; price: string; currency: string; imageUrl?: string };
type Store = { id: string; name: string; slug: string; businessName?: string; businessDescription?: string; website?: string };
type ReturnPolicy = { acceptsReturns: boolean; acceptsExchanges: boolean; requestWindowDays: number; itemConditionsAr: string; itemConditionsEn: string; exclusionsAr: string; exclusionsEn: string; buyerInstructionsAr: string; buyerInstructionsEn: string; contactInstructionsAr: string; contactInstructionsEn: string };

export default function PublicStorePage() {
  const params = useParams<{ slug: string }>();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [returnPolicy, setReturnPolicy] = useState<ReturnPolicy | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/public/stores/${encodeURIComponent(params.slug)}`, { cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error("store"); return data; })
      .then(data => { if (active) { setStore(data.store); setProducts(data.products); } })
      .catch(() => { if (active) setError(ar ? "تعذر العثور على المتجر." : "Store could not be found."); });
    return () => { active = false; };
  }, [params.slug, ar]);
  useEffect(() => {
    let active = true;
    fetch(`/api/stores/${encodeURIComponent(params.slug)}/return-policy`, { cache: "no-store" })
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (active) setReturnPolicy(data?.status === "published" ? data.policy : null); })
      .catch(() => { if (active) setReturnPolicy(null); });
    return () => { active = false; };
  }, [params.slug]);
  return <main className="min-h-screen bg-[#f7f4ec] text-[#14233b]" dir={ar ? "rtl" : "ltr"}>
    <header className="border-b border-[#e5dfd1] bg-white px-5 py-4"><Link href="/" className="font-bold tracking-wide">WASLA <span className="text-[#b89545]">وصلة</span></Link></header>
    <div className="mx-auto max-w-6xl px-4 py-10">
      {error ? <p role="alert">{error}</p> : !store ? <p>{ar ? "جارٍ تحميل المتجر..." : "Loading store..."}</p> : <>
        <div className="mb-8 rounded-3xl bg-[#14233b] p-8 text-white"><p className="mb-2 text-xs uppercase tracking-[.2em] text-[#d8bd79]">{ar ? "متجر على وصلة" : "WASLA MEMBER STORE"}</p><h1 className="text-3xl font-bold">{store.name}</h1>{store.businessName && <p className="mt-2 text-sm text-slate-200">{store.businessName}</p>}{store.businessDescription && <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200">{store.businessDescription}</p>}</div>
        <section className="mb-8 rounded-2xl border border-[#e5dfd1] bg-white p-5">
          <h2 className="font-bold">{ar ? "سياسة الإرجاع والاستبدال" : "Returns & exchanges"}</h2>
          {returnPolicy ? <>
            <p className="mt-2 text-sm leading-7 text-slate-600">{returnPolicy.acceptsReturns ? (ar ? "يقبل المتجر طلبات الإرجاع" : "Returns are accepted") : (ar ? "الإرجاع غير مفعّل في سياسة المتجر" : "Returns are not enabled by this store policy")} · {returnPolicy.acceptsExchanges ? (ar ? "والاستبدال" : "Exchanges are accepted") : (ar ? "الاستبدال غير مفعّل" : "Exchanges are not enabled")} · {ar ? "المهلة:" : "Request window:"} {returnPolicy.requestWindowDays} {ar ? "يومًا" : "days"}</p>
            {(ar ? returnPolicy.itemConditionsAr : returnPolicy.itemConditionsEn) && <p className="mt-2 whitespace-pre-wrap text-sm">{ar ? "شروط المنتج: " : "Item conditions: "}{ar ? returnPolicy.itemConditionsAr : returnPolicy.itemConditionsEn}</p>}
            {(ar ? returnPolicy.exclusionsAr : returnPolicy.exclusionsEn) && <p className="mt-2 whitespace-pre-wrap text-sm">{ar ? "الاستثناءات: " : "Exclusions: "}{ar ? returnPolicy.exclusionsAr : returnPolicy.exclusionsEn}</p>}
            {(ar ? returnPolicy.buyerInstructionsAr : returnPolicy.buyerInstructionsEn) && <p className="mt-2 whitespace-pre-wrap text-sm">{ar ? returnPolicy.buyerInstructionsAr : returnPolicy.buyerInstructionsEn}</p>}
            {(ar ? returnPolicy.contactInstructionsAr : returnPolicy.contactInstructionsEn) && <p className="mt-2 whitespace-pre-wrap text-sm">{ar ? "التواصل: " : "Contact: "}{ar ? returnPolicy.contactInstructionsAr : returnPolicy.contactInstructionsEn}</p>}
          </> : <p className="mt-2 text-sm leading-7 text-slate-600">{ar ? "لم ينشر المتجر سياسة إرجاع بعد. يرجى التواصل مع البائع للاستفسار. عدم وجود سياسة منشورة لا يعني تلقائيًا رفض الإرجاع أو إسقاط الحقوق القانونية." : "The store has not published a return policy. Please contact the seller. No published policy does not automatically mean returns are refused or legal rights are waived."}</p>}
          <p className="mt-3 border-t border-[#eee8dc] pt-3 text-xs leading-6 text-slate-500">{ar ? "تظل الحقوق الإلزامية للمستهلك بموجب القانون المعمول به محفوظة. تقديم طلب لا يعني استردادًا ماليًا تلقائيًا ولا يضمن الموافقة." : "Mandatory consumer rights under applicable law remain unaffected. Submitting a request is not an automatic refund and does not guarantee approval."}</p>
        </section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{ar ? "المنتجات" : "Products"}</h2><div className="flex items-center gap-4"><Link href={`/store/${encodeURIComponent(params.slug)}/orders`} className="text-sm font-semibold text-[#9b792f] underline">{ar ? "طلبات هذا المتجر" : "Store orders"}</Link><span className="text-sm text-slate-500">{products.length}</span></div></div>
        {products.length === 0 ? <p className="rounded-2xl bg-white p-8 text-slate-500">{ar ? "لا توجد منتجات منشورة حالياً." : "No published products yet."}</p> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{products.map(product => <Link key={product.id} href={`/product/${product.id}`} className="overflow-hidden rounded-2xl border border-[#e5dfd1] bg-white transition hover:-translate-y-0.5 hover:shadow-lg">{product.imageUrl ? <img src={product.imageUrl} alt={product.title} className="h-52 w-full object-cover" loading="lazy"/> : <div className="flex h-52 items-center justify-center bg-[#f2eee4] text-4xl font-bold text-[#b89545]">W</div>}<div className="p-5"><h3 className="font-bold">{product.title}</h3><p className="mt-2 line-clamp-2 text-sm text-slate-500">{product.description}</p><p className="mt-4 font-bold text-[#9b792f]">{product.price} {product.currency}</p></div></Link>)}</div>}
      </>}
    </div>
  </main>;
}
