"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../../../components/locale-provider";

type Result = {
  score: { total: number; maximum: number; demand: number; demandMaximum: number; grossMargin: number; grossMarginMaximum: number; supplierReadiness: number; supplierReadinessMaximum: number };
  economics: { landedCost: number; grossProfitBeforeUnenteredCosts: number; grossMarginPercent: number; note: string };
  recommendation: string; missingChecks: string[]; disclaimer: string;
};
type SavedOpportunity = { id: string; title: string; market: string; currency: string; score: number; recommendation: string; created_at: string };
const initial = { title: "", market: "US", demandEvidenceUrl: "", demandEvidenceDate: new Date().toISOString().slice(0,10), demandSignalStrength: "3", demandSourceType: "owner_supplied", currency: "USD", sellingPrice: "", supplierCost: "", shippingCost: "", extraCosts: "0", supplierEvidenceUrl: "", specificationEvidenceUrl: "", supplierIdentityVerified: false, specificationsVerified: false, directShippingConfirmed: false, returnsConfirmed: false };
export default function ProductOpportunitiesPage() {
  const { locale } = useLocale(); const ar = locale === "ar"; const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [form, setForm] = useState(initial); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<SavedOpportunity[]>([]);
  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    fetch("/api/platform/official-store/opportunities/assess", { credentials: "include", cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error("history"); return data.opportunities as SavedOpportunity[]; })
      .then(items => { if (active) setHistory(items); })
      .catch(() => { if (active) setHistory([]); });
    return () => { active = false; };
  }, [session?.user?.id]);
  const t = ar ? {
    title: "تقييم فرص المنتجات", subtitle: "قيّم فرصة منتج بناءً على دليل طلب موثق وتكلفة ومخاطر المورد. هذه نسخة تقييم يدوي أولية وليست بحثاً مباشراً في أمازون.",
    product: "اسم المنتج", market: "السوق المستهدف", demandUrl: "رابط دليل الطلب HTTPS", demandDate: "تاريخ الدليل", signal: "قوة إشارة الطلب (1 ضعيفة – 5 قوية)", source: "نوع مصدر الدليل", owner: "بحث/دليل أدخله المالك", api: "واجهة سوق أو مصدر مرخص", currency: "العملة", sell: "سعر البيع المتوقع", supplierCost: "تكلفة المورد", shipping: "الشحن", extra: "تكاليف إضافية معروفة", supplierUrl: "رابط إثبات المورد HTTPS", specUrl: "رابط إثبات المواصفات HTTPS", identity: "تم التحقق من هوية المورد", specs: "تم التحقق من تطابق المواصفات", direct: "تم تأكيد الشحن المباشر", returns: "تم تأكيد سياسة الإرجاع وخدمة ما بعد البيع", run: "قيّم الفرصة", running: "جارٍ التقييم...", back: "العودة لعروض الموردين", score: "النتيجة", demandScore: "الطلب", marginScore: "هامش الربح الإجمالي", readiness: "جاهزية المورد", landed: "التكلفة المدخلة", gross: "الربح الإجمالي التقديري قبل التكاليف غير المدخلة", margin: "هامش الربح الإجمالي", missing: "النواقص", recommendation: "التوصية", errorText: "تعذر التقييم. تحقق من الروابط HTTPS والأسعار والعملة.", disclaimer: "التقييم لا يجلب بيانات أمازون تلقائياً ولا يثبت المبيعات أو المورد. لا ينشر منتجاً ولا ينشئ طلب شراء."
  } : {
    title: "Product opportunity assessment", subtitle: "Assess a product using documented demand evidence, costs and supplier readiness. This is an initial manual assessment, not a live Amazon search.",
    product: "Product title", market: "Target market", demandUrl: "Demand evidence HTTPS URL", demandDate: "Evidence date", signal: "Demand signal strength (1 low – 5 high)", source: "Evidence source type", owner: "Owner-provided research", api: "Marketplace API or licensed source", currency: "Currency", sell: "Expected selling price", supplierCost: "Supplier cost", shipping: "Shipping", extra: "Known additional costs", supplierUrl: "Supplier evidence HTTPS URL", specUrl: "Specification evidence HTTPS URL", identity: "Supplier identity verified", specs: "Exact specifications verified", direct: "Direct shipping confirmed", returns: "Returns and after-sales confirmed", run: "Assess opportunity", running: "Assessing...", back: "Back to supplier offers", score: "Score", demandScore: "Demand", marginScore: "Gross margin", readiness: "Supplier readiness", landed: "Entered landed cost", gross: "Estimated gross profit before unentered costs", margin: "Gross margin", missing: "Missing checks", recommendation: "Recommendation", errorText: "Assessment failed. Check HTTPS evidence links, prices and currency.", disclaimer: "This does not fetch Amazon data or verify sales/suppliers. It does not publish listings or create purchase orders."
  };
  if (isPending) return <main className="mx-auto max-w-4xl p-6">Loading…</main>;
  if (!session?.user) { router.replace("/login"); return null; }
  const update = (key: keyof typeof initial, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
  async function assess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/platform/official-store/opportunities/assess", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, demandSignalStrength: Number(form.demandSignalStrength), sellingPrice: Number(form.sellingPrice), supplierCost: Number(form.supplierCost), shippingCost: Number(form.shippingCost), extraCosts: Number(form.extraCosts) }) });
      const data = await response.json(); if (!response.ok || !data.success || !data.assessmentOnly) throw new Error("assessment");
      setResult(data);
      if (data.opportunityId) setHistory(items => [{ id: data.opportunityId, title: data.title, market: data.market, currency: data.currency, score: data.score.total, recommendation: data.recommendation, created_at: data.createdAt }, ...items].slice(0,100));
    } catch { setError(t.errorText); } finally { setBusy(false); }
  }
  const field = (key: keyof typeof initial, label: string, type = "text") => <label className="grid gap-1 text-sm font-medium">{label}<input className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" type={type} value={String(form[key])} onChange={e => update(key, e.target.value)} required /></label>;
  const check = (key: keyof typeof initial, label: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form[key])} onChange={e => update(key, e.target.checked)} />{label}</label>;
  const missingLabels: Record<string,string> = { supplier_identity_verified: ar ? "التحقق من هوية المورد" : "Verify supplier identity", exact_specifications_verified: ar ? "مطابقة المواصفات" : "Verify exact specifications", direct_shipping_confirmed: ar ? "تأكيد الشحن المباشر" : "Confirm direct shipping", returns_and_after_sales_confirmed: ar ? "سياسة الإرجاع وخدمة ما بعد البيع" : "Confirm returns and after-sales", refresh_demand_evidence: ar ? "تحديث دليل الطلب" : "Refresh demand evidence", review_margin_and_missing_costs: ar ? "مراجعة الهامش والتكاليف الناقصة" : "Review margin and missing costs", supplier_identity_evidence_required: ar ? "إضافة دليل هوية المورد" : "Add supplier identity evidence", product_specification_evidence_required: ar ? "إضافة دليل المواصفات" : "Add specification evidence" };
  return <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8" dir={ar ? "rtl" : "ltr"}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{t.title}</h1><p className="mt-2 text-sm text-slate-600">{t.subtitle}</p></div><Link className="rounded-lg border px-3 py-2 text-sm" href="/owner/official-store/data-sources">{ar ? "مصادر البيانات" : "Data sources"}</Link> <Link className="rounded-lg border px-3 py-2 text-sm" href="/owner/official-store/source-offers">{t.back}</Link></div>
    <form onSubmit={assess} className="grid gap-4 rounded-2xl border bg-white p-4 md:grid-cols-2 md:p-6">
      <div className="md:col-span-2"><h2 className="font-semibold">{ar ? "دليل الطلب والسوق" : "Demand evidence and market"}</h2></div>
      {field("title",t.product)}{field("market",t.market)}
      {field("demandEvidenceUrl",t.demandUrl,"url")}{field("demandEvidenceDate",t.demandDate,"date")}
      <label className="grid gap-1 text-sm font-medium">{t.signal}<select className="rounded-lg border px-3 py-2" value={form.demandSignalStrength} onChange={e=>update("demandSignalStrength",e.target.value)}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-medium">{t.source}<select className="rounded-lg border px-3 py-2" value={form.demandSourceType} onChange={e=>update("demandSourceType",e.target.value)}><option value="owner_supplied">{t.owner}</option><option value="licensed_api">{t.api}</option></select></label>
      <div className="md:col-span-2 border-t pt-4"><h2 className="font-semibold">{ar ? "التكلفة والربحية" : "Costs and economics"}</h2></div>
      {field("currency",t.currency)}{field("sellingPrice",t.sell,"number")}{field("supplierCost",t.supplierCost,"number")}{field("shippingCost",t.shipping,"number")}{field("extraCosts",t.extra,"number")}
      <div className="md:col-span-2 border-t pt-4"><h2 className="font-semibold">{ar ? "التحقق من المورد" : "Supplier checks"}</h2></div>
      {field("supplierEvidenceUrl",t.supplierUrl,"url")}{field("specificationEvidenceUrl",t.specUrl,"url")}
      <div className="grid gap-3 md:col-span-2 md:grid-cols-2">{check("supplierIdentityVerified",t.identity)}{check("specificationsVerified",t.specs)}{check("directShippingConfirmed",t.direct)}{check("returnsConfirmed",t.returns)}</div>
      {error && <p role="alert" className="text-sm text-red-700 md:col-span-2">{error}</p>}
      <button disabled={busy} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50 md:col-span-2">{busy ? t.running : t.run}</button>
    </form>
    {result && <section className="space-y-4 rounded-2xl border p-4 md:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{t.score}: {result.score.total}/{result.score.maximum}</h2><strong>{t.recommendation}: {result.recommendation}</strong></div>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3">{t.demandScore}<p className="text-2xl font-bold">{result.score.demand}/{result.score.demandMaximum}</p></div><div className="rounded-xl bg-slate-50 p-3">{t.marginScore}<p className="text-2xl font-bold">{result.score.grossMargin}/{result.score.grossMarginMaximum}</p></div><div className="rounded-xl bg-slate-50 p-3">{t.readiness}<p className="text-2xl font-bold">{result.score.supplierReadiness}/{result.score.supplierReadinessMaximum}</p></div></div>
      <div className="grid gap-2 text-sm sm:grid-cols-3"><p>{t.landed}: <b>{result.economics.landedCost.toFixed(2)} {form.currency}</b></p><p>{t.gross}: <b>{result.economics.grossProfitBeforeUnenteredCosts.toFixed(2)} {form.currency}</b></p><p>{t.margin}: <b>{result.economics.grossMarginPercent.toFixed(2)}%</b></p></div>
      <div><h3 className="font-semibold">{t.missing}</h3>{result.missingChecks.length ? <ul className="list-disc ps-6 text-sm">{result.missingChecks.map(item=><li key={item}>{missingLabels[item] ?? item}</li>)}</ul> : <p className="text-sm">{ar ? "لا توجد نواقص ضمن الفحوص المحددة." : "No missing checks in the defined review set."}</p>}</div>
      <p className="text-xs text-slate-500">{result.economics.note} {result.disclaimer}</p>
    </section>}
    <section className="space-y-3 rounded-2xl border p-4 md:p-6">
      <h2 className="text-lg font-bold">{ar ? "سجل الفرص المحفوظة" : "Saved opportunity history"}</h2>
      {history.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-start"><th className="p-2 text-start">{ar ? "المنتج" : "Product"}</th><th className="p-2 text-start">{ar ? "السوق" : "Market"}</th><th className="p-2 text-start">{ar ? "النتيجة" : "Score"}</th><th className="p-2 text-start">{ar ? "التوصية" : "Recommendation"}</th><th className="p-2 text-start">{ar ? "التاريخ" : "Date"}</th></tr></thead><tbody>{history.map(item => <tr key={item.id} className="border-b last:border-0"><td className="p-2">{item.title}</td><td className="p-2">{item.market}</td><td className="p-2 font-semibold">{item.score}/75</td><td className="p-2">{item.recommendation}</td><td className="p-2 whitespace-nowrap">{new Date(item.created_at).toLocaleDateString(ar ? "ar" : "en")}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">{ar ? "لا توجد تقييمات محفوظة بعد. سيظهر كل تقييم جديد هنا." : "No saved assessments yet. New assessments will appear here."}</p>}
    </section>
    <p className="text-xs text-slate-500">{t.disclaimer}</p>
  </main>;
}
