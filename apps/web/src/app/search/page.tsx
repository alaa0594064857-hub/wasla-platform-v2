"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import WorkspaceHeader from "../../components/workspace-header";
import { useLocale } from "../../components/locale-provider";

function SearchResults() {
  const params = useSearchParams();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const query = params.get("q")?.trim() || "";
  const suggestions = [
    { href: "/shops", title: ar ? "المتاجر والمنتجات" : "Shops & products", desc: ar ? "استكشف المتاجر والعلامات التجارية" : "Explore shops and brands", icon: "✳" },
    { href: "/business", title: ar ? "الشركات والأعمال" : "Companies & business", desc: ar ? "اكتشف الشركات والموردين" : "Discover companies and suppliers", icon: "▦" },
    { href: "/network", title: ar ? "الأشخاص والشبكة" : "People & network", desc: ar ? "ابحث عن علاقاتك وأصدقائك" : "Find your connections and friends", icon: "♧" },
    { href: "/messages", title: ar ? "الرسائل" : "Messages", desc: ar ? "انتقل إلى محادثاتك" : "Go to your conversations", icon: "✉" },
  ];
  return <main className="wasla-search-page" dir={ar ? "rtl" : "ltr"} lang={locale}>
    <WorkspaceHeader section="account" />
    <section className="wasla-search-shell">
      <span className="wasla-search-eyebrow">WASLA DISCOVERY</span>
      <h1>{ar ? "اكتشف ما تبحث عنه" : "Discover what you’re looking for"}</h1>
      <p>{query ? (ar ? <>وجهتك للبحث عن: <strong>{query}</strong></> : <>Your search for: <strong>{query}</strong></>) : (ar ? "اكتب اسم متجر أو شركة أو منتج أو شخص." : "Search for a shop, company, product or person.")}</p>
      <div className="wasla-search-destinations">
        {suggestions.map(item => <Link href={item.href} key={item.href}><span>{item.icon}</span><div><strong>{item.title}</strong><small>{item.desc}</small></div><b>↗</b></Link>)}
      </div>
      <div className="wasla-search-hint">{ar ? "البحث الموحد عبر جميع المنتجات والأعضاء والشركات سيتم ربطه بمحرك بيانات وصلة في المرحلة التالية. هذه الصفحة توصلك حاليًا إلى أقسام الاستكشاف المتاحة." : "Unified search across all products, members and businesses will be connected to WASLA’s data engine in a later phase. For now, use these discovery areas."}</div>
    </section>
  </main>;
}

export default function SearchPage() {
  const { locale } = useLocale();
  return <Suspense fallback={<main className="wasla-search-page"><WorkspaceHeader/><div className="wasla-search-shell">{locale === "ar" ? "جارٍ التحميل..." : "Loading..."}</div></main>}><SearchResults/></Suspense>;
}
