"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import WorkspaceHeader from "../../components/workspace-header";
import { useLocale } from "../../components/locale-provider";

type Product = { id: string; title: string; description: string | null; price: string; currency: string; image_url: string | null; store_name: string; store_slug: string; business_name: string };
type Store = { id: string; name: string; slug: string; business_name: string; country_code: string | null };
type Business = { id: string; display_name: string; account_type: string; country_code: string | null; description: string | null; website: string | null };
type Person = { id: string; display_name: string; avatar_reference: string | null; bio: string | null };
type Results = { products: Product[]; stores: Store[]; businesses: Business[]; people: Person[] };
const empty: Results = { products: [], stores: [], businesses: [], people: [] };

function SearchResults() {
  const params = useSearchParams();
  const router = useRouter();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const query = params.get("q")?.trim() || "";
  const [term, setTerm] = useState(query);
  const [results, setResults] = useState<Results>(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  useEffect(() => { setTerm(query); }, [query]);
  useEffect(() => {
    if (query.length < 2) { setResults(empty); setSearched(false); return; }
    let active = true;
    setLoading(true); setError("");
    fetch(`/api/search?q=${encodeURIComponent(query)}`, { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Search failed");
        return data.results as Results;
      })
      .then(data => { if (active) { setResults(data); setSearched(true); } })
      .catch(() => { if (active) setError(ar ? "تعذر تنفيذ البحث الآن. حاول مرة أخرى." : "Search is unavailable right now. Please try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, ar]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = term.trim();
    if (value.length >= 2) router.push(`/search?q=${encodeURIComponent(value)}`);
  }

  const sections = [
    { key: "products", title: ar ? "المنتجات" : "Products", icon: "✳", items: results.products, href: "/shops" },
    { key: "stores", title: ar ? "المتاجر" : "Shops", icon: "▣", items: results.stores, href: "/shops" },
    { key: "businesses", title: ar ? "الشركات والأعمال" : "Businesses", icon: "▦", items: results.businesses, href: "/business" },
    { key: "people", title: ar ? "الأشخاص" : "People", icon: "♧", items: results.people, href: "/network" },
  ];

  return <main className="wasla-search-page" dir={ar ? "rtl" : "ltr"} lang={locale}>
    <WorkspaceHeader section="account" />
    <section className="wasla-search-shell">
      <span className="wasla-search-eyebrow">WASLA DISCOVERY</span>
      <h1>{ar ? "اكتشف عالم وصلة" : "Discover WASLA"}</h1>
      <p>{ar ? "ابحث في المنتجات والمتاجر والشركات والأشخاص من مكان واحد." : "Search products, shops, businesses and people from one place."}</p>
      <form className="wasla-search-form" onSubmit={submit}>
        <input value={term} onChange={event => setTerm(event.target.value)} maxLength={80} minLength={2} placeholder={ar ? "ماذا تبحث عنه؟" : "What are you looking for?"} aria-label={ar ? "عبارة البحث" : "Search query"} />
        <button type="submit" disabled={term.trim().length < 2}>{ar ? "بحث" : "Search"} <span>↗</span></button>
      </form>
      {query.length < 2 && <div className="wasla-search-hint">{ar ? "اكتب كلمتين على الأقل للبحث في بيانات وصلة المتاحة للعامة." : "Enter at least two characters to search WASLA’s public records."}</div>}
      {loading && <div className="wasla-search-status">{ar ? "جارٍ البحث..." : "Searching..."}</div>}
      {error && <div className="wasla-search-hint" role="alert">{error}</div>}
      {searched && !loading && !error && (
        <div className="wasla-search-results">
          <div className="wasla-search-summary">{ar ? `نتائج البحث عن «${query}»` : `Results for “${query}”`}</div>
          {sections.map(section => section.items.length > 0 && (
            <section className="wasla-search-group" key={section.key}>
              <header><h2><span>{section.icon}</span>{section.title}</h2><b>{section.items.length}</b></header>
              <div className="wasla-search-result-grid">
                {section.key === "products" && (section.items as Product[]).map(item => (
                  <article className="wasla-search-result" key={item.id}>
                    <span className="wasla-search-result-icon">{section.icon}</span><div><strong>{item.title}</strong><small>{item.store_name} · {item.business_name}</small>{item.price && <em>{item.price} {item.currency}</em>}</div><Link href={section.href}>{ar ? "المتاجر" : "Shops"} ↗</Link>
                  </article>
                ))}
                {section.key === "stores" && (section.items as Store[]).map(item => (
                  <article className="wasla-search-result" key={item.id}>
                    <span className="wasla-search-result-icon">{section.icon}</span><div><strong>{item.name}</strong><small>{item.business_name}{item.country_code ? ` · ${item.country_code}` : ""}</small></div><Link href={section.href}>{ar ? "المتاجر" : "Shops"} ↗</Link>
                  </article>
                ))}
                {section.key === "businesses" && (section.items as Business[]).map(item => (
                  <article className="wasla-search-result" key={item.id}>
                    <span className="wasla-search-result-icon">{section.icon}</span><div><strong>{item.display_name}</strong><small>{item.account_type}{item.country_code ? ` · ${item.country_code}` : ""}</small></div><Link href={section.href}>{ar ? "الأعمال" : "Business"} ↗</Link>
                  </article>
                ))}
                {section.key === "people" && (section.items as Person[]).map(item => (
                  <article className="wasla-search-result" key={item.id}>
                    <span className="wasla-search-result-icon">{item.avatar_reference ? <img src={item.avatar_reference} alt="" /> : section.icon}</span><div><strong>{item.display_name}</strong><small>{item.bio || (ar ? "عضو في وصلة" : "WASLA member")}</small></div><Link href={section.href}>{ar ? "الشبكة" : "Network"} ↗</Link>
                  </article>
                ))}
              </div>
            </section>
          ))}
          {sections.every(section => section.items.length === 0) && <div className="wasla-search-hint">{ar ? "لم نعثر على نتائج مطابقة في البيانات العامة المتاحة." : "No matching results were found in the available public records."}</div>}
        </div>
      )}
    </section>
  </main>;
}

export default function SearchPage() {
  const { locale } = useLocale();
  return <Suspense fallback={<main className="wasla-search-page"><WorkspaceHeader/><div className="wasla-search-shell">{locale === "ar" ? "جارٍ التحميل..." : "Loading..."}</div></main>}><SearchResults/></Suspense>;
}
