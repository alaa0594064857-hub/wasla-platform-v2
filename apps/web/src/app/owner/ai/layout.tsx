"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";

const offices = [
  ["market_researcher", "باحث الأسواق", "Market Research", "◉"],
  ["product_analyst", "محلل المنتجات", "Product Analysis", "◇"],
  ["supplier_researcher", "باحث الموردين", "Supplier Research", "⌂"],
  ["catalogue_manager", "مدير الكتالوج", "Catalogue", "▣"],
  ["sales_support", "المبيعات وخدمة العملاء", "Sales & Support", "✧"],
  ["logistics_analyst", "الطلبات والشحن", "Orders & Logistics", "⇄"],
  ["translator", "أخصائي الترجمة", "Translation", "文"],
  ["financial_analyst", "المحلل المالي", "Finance", "$"],
  ["quality_risk_reviewer", "الجودة والمخاطر", "Quality & Risk", "✓"],
] as const;

export default function AiOwnerWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  const pathname = usePathname();
  const ar = locale === "ar";
  const links = [
    { href: "/owner/ai/headquarters", label: ar ? "المقر الرئيسي" : "Headquarters", icon: "⌂" },
    { href: "/owner/ai/chat", label: ar ? "مكتب المدير العام" : "General Manager", icon: "♛" },
    { href: "/owner/ai/reports", label: ar ? "مركز التقارير" : "Reports Center", icon: "▤" },
    { href: "/owner/ai/meeting", label: ar ? "قاعة الاجتماعات" : "Meeting Room", icon: "◷" },
  ];

  const navLink = (href: string) => pathname === href || (href === "/owner/ai/headquarters" && pathname === "/owner/ai");

  return (
    <div dir={ar ? "rtl" : "ltr"} lang={locale} className="min-h-screen bg-[#f5f2e9] text-[#14243a] lg:flex">
      <aside className="w-full shrink-0 bg-[#14243a] text-[#f7f4ed] lg:sticky lg:top-0 lg:h-screen lg:w-[270px] lg:overflow-y-auto">
        <Link href="/owner" className="flex items-center gap-3 border-b border-white/10 px-5 py-5 no-underline">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#dfc58f] to-[#b18d4d] text-xl font-black text-[#14243a]">W</span>
          <span className="grid"><strong className="text-base tracking-wider text-white">WASLA</strong><small className="text-[10px] tracking-[.2em] text-[#dfc58f]">AI OPERATIONS OFFICE</small></span>
        </Link>
        <div className="px-4 pb-3 pt-5 text-[10px] font-bold tracking-[.2em] text-[#91a0b3]">{ar ? "الإدارة التنفيذية" : "EXECUTIVE OFFICE"}</div>
        <nav className="grid gap-1 px-3">
          {links.map(item => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm no-underline transition ${navLink(item.href) ? "bg-[#29425f] font-bold text-[#e6c987] ring-1 ring-inset ring-[#d9b76e]/30" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
              <span className="w-6 text-center text-lg">{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 pb-2 pt-7 text-[10px] font-bold tracking-[.2em] text-[#91a0b3]">{ar ? "أقسام الفريق · 9 مكاتب" : "TEAM DEPARTMENTS · 9 OFFICES"}</div>
        <nav className="grid gap-1 px-3 pb-5 sm:grid-cols-2 lg:grid-cols-1">
          {offices.map(([key, arName, enName, icon]) => {
            const href = `/owner/ai/office/${key}`;
            const active = pathname === href;
            return <Link key={key} href={href} className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-xs no-underline transition ${active ? "bg-[#29425f] font-bold text-[#e6c987] ring-1 ring-inset ring-[#d9b76e]/30" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
              <span className="w-6 shrink-0 text-center text-base">{icon}</span><span className="truncate">{ar ? arName : enName}</span>
            </Link>;
          })}
        </nav>
        <div className="hidden border-t border-white/10 px-5 py-4 text-xs text-slate-400 lg:block">
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" />{ar ? "نظام المالك · مساحة خاصة" : "Owner system · Private workspace"}</div>
          <Link href="/owner" className="mt-3 inline-block text-[#dfc58f] no-underline hover:text-white">← {ar ? "العودة إلى نظام المالك" : "Back to Owner System"}</Link>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-between gap-3 border-b border-[#e5e0d5] bg-white/95 px-4 backdrop-blur sm:px-7">
          <div>
            <p className="text-[10px] font-bold tracking-[.18em] text-[#9b783d]">WASLA / OWNER / AI OPERATIONS</p>
            <p className="mt-1 text-sm font-bold">{ar ? "غرفة عمليات الذكاء الاصطناعي" : "AI Operations Headquarters"}</p>
          </div>
          <Link href="/owner" className="rounded-lg border border-[#e5e0d5] px-3 py-2 text-xs font-semibold text-[#14243a] no-underline hover:border-[#b18d4d]">{ar ? "نظام المالك ↗" : "Owner System ↗"}</Link>
        </header>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
