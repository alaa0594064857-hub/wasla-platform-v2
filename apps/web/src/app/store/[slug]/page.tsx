"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale } from "../../../components/locale-provider";

type Product = { id: string; title: string; description?: string; price: string; currency: string; imageUrl?: string };
type Store = { id: string; name: string; slug: string; businessName?: string; businessDescription?: string; website?: string };

export default function PublicStorePage() {
  const params = useParams<{ slug: string }>();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/public/stores/${encodeURIComponent(params.slug)}`, { cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error("store"); return data; })
      .then(data => { if (active) { setStore(data.store); setProducts(data.products); } })
      .catch(() => { if (active) setError(ar ? "تعذر العثور على المتجر." : "Store could not be found."); });
    return () => { active = false; };
  }, [params.slug, ar]);
  return <main className="min-h-screen bg-[#f7f4ec] text-[#14233b]" dir={ar ? "rtl" : "ltr"}>
    <header className="border-b border-[#e5dfd1] bg-white px-5 py-4"><Link href="/" className="font-bold tracking-wide">WASLA <span className="text-[#b89545]">وصلة</span></Link></header>
    <div className="mx-auto max-w-6xl px-4 py-10">
      {error ? <p role="alert">{error}</p> : !store ? <p>{ar ? "جارٍ تحميل المتجر..." : "Loading store..."}</p> : <>
        <div className="mb-8 rounded-3xl bg-[#14233b] p-8 text-white"><p className="mb-2 text-xs uppercase tracking-[.2em] text-[#d8bd79]">{ar ? "متجر على وصلة" : "WASLA MEMBER STORE"}</p><h1 className="text-3xl font-bold">{store.name}</h1>{store.businessName && <p className="mt-2 text-sm text-slate-200">{store.businessName}</p>}{store.businessDescription && <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200">{store.businessDescription}</p>}</div>
        <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">{ar ? "المنتجات" : "Products"}</h2><span className="text-sm text-slate-500">{products.length}</span></div>
        {products.length === 0 ? <p className="rounded-2xl bg-white p-8 text-slate-500">{ar ? "لا توجد منتجات منشورة حالياً." : "No published products yet."}</p> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{products.map(product => <Link key={product.id} href={`/product/${product.id}`} className="overflow-hidden rounded-2xl border border-[#e5dfd1] bg-white transition hover:-translate-y-0.5 hover:shadow-lg">{product.imageUrl ? <img src={product.imageUrl} alt={product.title} className="h-52 w-full object-cover" loading="lazy"/> : <div className="flex h-52 items-center justify-center bg-[#f2eee4] text-4xl font-bold text-[#b89545]">W</div>}<div className="p-5"><h3 className="font-bold">{product.title}</h3><p className="mt-2 line-clamp-2 text-sm text-slate-500">{product.description}</p><p className="mt-4 font-bold text-[#9b792f]">{product.price} {product.currency}</p></div></Link>)}</div>}
      </>}
    </div>
  </main>;
}
