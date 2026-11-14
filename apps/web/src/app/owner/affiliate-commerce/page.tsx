"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../../components/locale-provider";

type Program = {
  id: string; provider: string; marketplace: string; marketplace_domain: string;
  destination_country: string; currency: string; tracking_id: string | null;
  status: string; disclosure_en: string; disclosure_ar: string; terms_reviewed_at: string | null;
  item_count: number; published_item_count: number; click_count: number;
};
type AffiliateItem = {
  id: string; provider_item_id: string; title_en: string | null; title_ar: string | null;
  description_en: string | null; description_ar: string | null; source_url: string | null;
  content_source: string; publication_status: string; last_verified_at: string | null;
};
type Dashboard = {
  success: boolean; programs: Program[]; items: AffiliateItem[];
  safeguards: { publicPublishingEnabled: boolean; amazonProductApiConnected: boolean; amazonLinksEnabled: boolean; turkeyAffiliateProgramConfigured: boolean };
  note: string;
};

export default function AffiliateCommercePage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [data, setData] = useState<Dashboard | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) { router.replace("/login"); return; }
    let active = true;
    fetch("/api/platform/security", { credentials: "include", cache: "no-store" })
      .then(async r => {
        if (r.status === 401) { router.replace("/login"); return null; }
        if (!r.ok) throw new Error("security");
        return r.json();
      })
      .then(async security => {
        if (!security) return;
        const allowed = security.success && security.platformAccess?.roles?.includes("platform_owner") && security.platformAccess?.permissions?.includes("platform.manage");
        if (!allowed) { if (active) setDenied(true); return null; }
        const response = await fetch("/api/platform/affiliate-commerce", { credentials: "include", cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error("affiliate");
        if (active) setData(result);
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isPending, session?.user?.id, router]);

  const t = ar ? {
    title: "التسويق بالعمولة", back: "العودة إلى المتجر الرسمي",
    subtitle: "إدارة برامج الإحالة بشكل منفصل عن منتجات WASLA ومخزونها وطلباتها.",
    pending: "بانتظار موافقة الشبكة", paused: "متوقف عن النشر", active: "مقبول ومفعّل", rejected: "مرفوض", terms: "مراجعة الشروط", termsDone: "تمت مراجعة الشروط", termsMissing: "لم تتم مراجعة الشروط", approval: "حالة الموافقة",
    country: "السوق", currency: "العملة", tracking: "معرّف الشريك",
    products: "المنتجات", publishedCount: "المنشور", clicks: "النقرات المسجلة", disclosure: "إفصاح العمولة",
    safety: "حواجز الحماية", noPublish: "النشر العام: معطّل",
    noApi: "ربط Amazon Product API: غير مفعّل", noLinks: "روابط Amazon: غير مفعّلة",
    noTurkey: "برنامج تركيا: غير مهيأ", note: "لا توجد منتجات أو أسعار أو صور أو روابط شراء منشورة. لن نستخدم صور Amazon أو بيانات الأسعار والتقييمات قبل توفر مصدر رسمي مصرح به.",
    owner: "هذه الصفحة مخصصة لمالك المنصة.", loading: "جارٍ تحميل إعدادات التسويق بالعمولة...",
    error: "تعذر تحميل بيانات التسويق بالعمولة.", candidates: "المنتجات المرشحة (مسودات خاصة)", draft: "مسودة — غير منشور", published: "منشور", archived: "مؤرشف",
    source: "المصدر الرسمي", noCandidates: "لا توجد منتجات مرشحة بعد.", reviewed: "آخر تحقق"
  } : {
    title: "Affiliate commerce", back: "Back to official store",
    subtitle: "Manage referral programs separately from WASLA-owned products, inventory and orders.",
    pending: "Awaiting network approval", paused: "Publishing paused", active: "Approved and active", rejected: "Rejected", terms: "Terms review", termsDone: "Terms reviewed", termsMissing: "Terms not reviewed", approval: "Approval status",
    country: "Market", currency: "Currency", tracking: "Associate ID",
    products: "Items", publishedCount: "Published", clicks: "Recorded clicks", disclosure: "Affiliate disclosure",
    safety: "Safety gates", noPublish: "Public publishing: disabled",
    noApi: "Amazon Product API: not connected", noLinks: "Amazon links: disabled",
    noTurkey: "Turkey program: not configured", note: "No products, prices, images or shopping links are published. Amazon images, prices and ratings will not be used until an authorized official data source is available.",
    owner: "This page is restricted to the platform owner.", loading: "Loading affiliate settings...",
    error: "Could not load affiliate commerce data.", candidates: "Product candidates (private drafts)", draft: "Draft — unpublished", published: "Published", archived: "Archived",
    source: "Official source", noCandidates: "No product candidates yet.", reviewed: "Last checked"
  };

  if (isPending || loading) return <main className="mx-auto max-w-5xl p-6">{t.loading}</main>;
  if (denied) return <main className="mx-auto max-w-5xl p-6"><h1>{t.owner}</h1><Link href="/owner">{t.back}</Link></main>;
  return <main dir={ar ? "rtl" : "ltr"} className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
    <header className="space-y-2">
      <Link className="text-sm font-semibold text-amber-800 underline" href="/owner/official-store">← {t.back}</Link>
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="text-sm text-slate-600">{t.subtitle}</p>
    </header>
    {error ? <p role="alert" className="rounded-xl border border-red-200 p-4 text-red-700">{t.error}</p> : null}
    <section className="rounded-2xl border p-4 md:p-6">
      <h2 className="font-bold">{t.safety}</h2>
      <ul className="mt-3 grid gap-2 text-sm">
        <li>{t.noPublish}</li><li>{t.noApi}</li><li>{t.noLinks}</li><li>{t.noTurkey}</li>
      </ul>
      <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{t.note}</p>
    </section>
    <section className="space-y-4">
      {(data?.programs || []).map(program => <article key={program.id} className="space-y-3 rounded-2xl border p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{program.marketplace}</h2>
          <span className={`rounded-full px-3 py-1 text-xs ${program.status === "active" ? "bg-emerald-100 text-emerald-800" : program.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{program.status === "active" ? t.active : program.status === "rejected" ? t.rejected : program.status === "paused" ? t.paused : t.pending}</span>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <p>{t.country}: <strong>{program.destination_country}</strong></p>
          <p>{t.currency}: <strong>{program.currency}</strong></p>
          <p>{t.tracking}: <strong dir="ltr">{program.tracking_id || "—"}</strong></p>
          <p>{t.approval}: <strong>{program.status === "active" ? t.active : program.status === "rejected" ? t.rejected : program.status === "paused" ? t.paused : t.pending}</strong></p>
          <p>{t.terms}: <strong>{program.terms_reviewed_at ? t.termsDone : t.termsMissing}</strong></p>
          <p>{t.products}: <strong>{program.item_count}</strong> · {t.publishedCount}: <strong>{program.published_item_count}</strong></p>
          <p>{t.clicks}: <strong>{program.click_count}</strong></p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <strong>{t.disclosure}</strong>
          <p className="mt-1">{ar ? program.disclosure_ar : program.disclosure_en}</p>
          {program.terms_reviewed_at ? <p className="mt-2 text-xs text-slate-500">{t.terms}: {new Date(program.terms_reviewed_at).toLocaleDateString(ar ? "ar" : "en-US")}</p> : null}
        </div>
      </article>)}
      {!error && (data?.programs.length ?? 0) === 0 ? <p className="rounded-xl border p-4 text-sm text-slate-500">—</p> : null}
    </section>
    <section className="space-y-4">
      <h2 className="text-xl font-bold">{t.candidates}</h2>
      {(data?.items || []).map(item => <article key={item.id} className="space-y-2 rounded-2xl border bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">{ar ? item.title_ar || item.title_en : item.title_en || item.title_ar}</h3>
          <span className={`rounded-full px-3 py-1 text-xs ${item.publication_status === "published" ? "bg-emerald-50 text-emerald-800" : item.publication_status === "archived" ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-900"}`}>{item.publication_status === "published" ? t.published : item.publication_status === "archived" ? t.archived : t.draft}</span>
        </div>
        <p className="text-sm leading-7 text-slate-600">{ar ? item.description_ar : item.description_en}</p>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span>{item.content_source}</span>
          {item.last_verified_at ? <span>{t.reviewed}: {new Date(item.last_verified_at).toLocaleDateString(ar ? "ar" : "en-US")}</span> : null}
          {item.source_url ? <a className="font-semibold text-amber-800 underline" href={item.source_url} target="_blank" rel="noreferrer">{t.source} ↗</a> : null}
        </div>
      </article>)}
      {!error && (data?.items.length ?? 0) === 0 ? <p className="rounded-xl border p-4 text-sm text-slate-500">{t.noCandidates}</p> : null}
    </section>
  </main>;
}
