"use client";

import { useEffect, useState, type FormEvent, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../../../components/locale-provider";

type Candidate = {
  id: string; supplier_name: string; supplier_website: string | null;
  supplier_contact: string | null; supplier_product_reference: string | null;
  proposed_title: string | null; proposed_description: string | null;
  proposed_price: string | null; currency: string | null;
  availability_claim: string | null; fulfilment_claim: string | null;
  evidence: unknown[]; verification_status: string; review_status: string;
  source_platform: string | null; source_product_url: string | null;
  supplier_dropship_confirmed: boolean; supplier_identity_verified: boolean;
  specifications_verified: boolean; sample_inspected: boolean; minimum_order_quantity: number | null;
  shipping_countries: string[] | null; shipping_cost: string | null;
  shipping_currency: string | null; estimated_shipping_days_min: number | null;
  estimated_shipping_days_max: number | null; quote_valid_until: string | null;
  created_at: string;
};

const initial = {
  supplierName: "", supplierWebsite: "", sourcePlatform: "Direct supplier - Turkey",
  sourceProductUrl: "", supplierProductReference: "", proposedTitle: "",
  proposedDescription: "", proposedPrice: "", currency: "USD",
  availabilityClaim: "", fulfilmentClaim: "", supplierContact: "",
  supplierDropshipConfirmed: false, supplierIdentityVerified: false,
  specificationsVerified: false, sampleInspected: false, minimumOrderQuantity: "1",
  shippingCountries: "TR,US,GB,DE", shippingCost: "", shippingCurrency: "USD",
  shippingMin: "", shippingMax: "", quoteValidUntil: "", evidenceUrl: "", specificationEvidenceUrl: "",
};

export default function OwnerSourcingPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [form, setForm] = useState({ ...initial });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const t = ar ? {
    title: "مراجعة الموردين والمنتجات", subtitle: "سجل عروض الموردين قبل تحويل أي منتج إلى متجر WASLA الرسمي.",
    back: "العودة لمتجر WASLA الرسمي", add: "إضافة عرض مورد", queue: "قائمة عروض الموردين",
    supplier: "اسم المورد", website: "موقع المورد HTTPS", platform: "منصة المصدر",
    source: "رابط المنتج الأصلي HTTPS", ref: "مرجع المنتج لدى المورد",
    product: "اسم المنتج المقترح", description: "وصف المنتج", price: "سعر المورد",
    currency: "العملة", contact: "وسيلة تواصل المورد", availability: "ادعاء التوفر",
    fulfilment: "شروط التنفيذ والشحن المباشر", dropship: "أكد المورد الشحن المباشر لقطعة واحدة",
    moq: "الحد الأدنى للطلب", countries: "الدول المدعوم شحنها (رموز ISO مثل TR,US)",
    shippingCost: "تكلفة الشحن", shippingCurrency: "عملة الشحن",
    shipMin: "أقل مدة شحن بالأيام", shipMax: "أقصى مدة شحن بالأيام",
    quoteExpiry: "صلاحية عرض السعر (مطلوب للاعتماد)", evidence: "رابط إثبات المورد HTTPS", specEvidence: "رابط إثبات مواصفات المنتج HTTPS",
    save: "حفظ العرض", saving: "جارٍ الحفظ...", loading: "جارٍ التحميل...",
    empty: "لا توجد عروض موردين بعد.", loadError: "تعذر تحميل العروض.",
    saveError: "تعذر حفظ العرض. تحقق من البيانات والروابط.", created: "تم تسجيل عرض المورد.",
    verify: "تأكيد التحقق", approve: "اعتماد العرض", reject: "رفض العرض",
    verified: "تم التحقق", unverified: "غير متحقق", awaiting: "بانتظار المورد",
    partial: "تحقق جزئي", rejected: "مرفوض", draft: "مسودة", review: "بانتظار المراجعة",
    approved: "معتمد", noEvidence: "أضف دليلاً موثقاً قبل الاعتماد.",
    note: "يمكن التوريد من مصنع أو تاجر محلي في تركيا أو من أي دولة أو منصة؛ لا نعتمد على Alibaba وحده. لا يعتمد المنتج إلا بعد إثبات المورد ومطابقة المواصفات وتأكيد الشحن المباشر لقطعة واحدة وسعر ساري. الاعتماد لا ينشر المنتج ولا يشتريه.",
    sourceLabel: "المصدر", priceLabel: "السعر", moqLabel: "الحد الأدنى", shipLabel: "الشحن",
    dropshipYes: "شحن مباشر مؤكد", dropshipNo: "الشحن المباشر غير مؤكد",
    identityVerified: "تم التحقق من هوية المورد", specsVerified: "تم التحقق من مطابقة المواصفات", sampleInspected: "تم فحص عينة المنتج",
    actionError: "تعذر تنفيذ الإجراء.", saved: "تم تحديث حالة العرض.",
  } : {
    title: "Supplier & product review", subtitle: "Record supplier offers before converting any item into the official WASLA Store.",
    back: "Back to official WASLA Store", add: "Add supplier offer", queue: "Supplier offer queue",
    supplier: "Supplier name", website: "Supplier website HTTPS", platform: "Source platform",
    source: "Original product URL HTTPS", ref: "Supplier product reference",
    product: "Proposed product title", description: "Product description", price: "Supplier price",
    currency: "Currency", contact: "Supplier contact", availability: "Availability claim",
    fulfilment: "Fulfilment and direct-shipping terms", dropship: "Supplier confirmed single-unit direct shipping",
    moq: "Minimum order quantity", countries: "Shipping countries (ISO codes e.g. TR,US)",
    shippingCost: "Shipping cost", shippingCurrency: "Shipping currency",
    shipMin: "Minimum shipping days", shipMax: "Maximum shipping days",
    quoteExpiry: "Quote expiry (required for approval)", evidence: "Supplier proof URL HTTPS", specEvidence: "Product specification proof URL HTTPS",
    save: "Save offer", saving: "Saving...", loading: "Loading...",
    empty: "No supplier offers yet.", loadError: "Could not load offers.",
    saveError: "Could not save offer. Check the fields and URLs.", created: "Supplier offer recorded.",
    verify: "Mark verified", approve: "Approve offer", reject: "Reject offer",
    verified: "Verified", unverified: "Unverified", awaiting: "Awaiting supplier",
    partial: "Partially verified", rejected: "Rejected", draft: "Draft", review: "Needs owner review",
    approved: "Approved", noEvidence: "Add verifiable evidence before approval.",
    note: "Source from a local Turkish manufacturer or seller, or any trusted supplier worldwide; Alibaba is not required. Approval requires supplier proof, matching product specifications, confirmed single-unit direct shipping and a current quote. Approval does not publish or purchase the product.",
    sourceLabel: "Source", priceLabel: "Price", moqLabel: "MOQ", shipLabel: "Shipping",
    dropshipYes: "Direct shipping confirmed", dropshipNo: "Direct shipping not confirmed",
    identityVerified: "Supplier identity verified", specsVerified: "Product specifications verified", sampleInspected: "Product sample inspected",
    actionError: "Could not complete this action.", saved: "Offer status updated.",
  };

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/platform/official-store/sourcing-candidates", { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("load");
      setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
    } catch { setError(t.loadError); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) { router.replace("/login"); return; }
    let active = true;
    fetch("/api/platform/security", { credentials: "include", cache: "no-store" })
      .then(async response => {
        if (response.status === 401) { router.replace("/login"); return null; }
        if (!response.ok) throw new Error("access");
        return response.json();
      })
      .then(data => {
        if (!active) return;
        const ok = Boolean(data?.success && data.platformAccess?.roles?.includes("platform_owner") && data.platformAccess?.permissions?.includes("platform.manage"));
        setAuthorized(ok);
        if (ok) void load();
      })
      .catch(() => { if (active) setAuthorized(false); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [isPending, session?.user?.id]);

  function update<K extends keyof typeof initial>(key: K, value: typeof initial[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const evidence = [
        ...(form.evidenceUrl.trim() ? [{ type: "supplier_evidence_url", url: form.evidenceUrl.trim(), recordedAt: new Date().toISOString() }] : []),
        ...(form.specificationEvidenceUrl.trim() ? [{ type: "product_specification", url: form.specificationEvidenceUrl.trim(), recordedAt: new Date().toISOString() }] : []),
      ];
      const countries = form.shippingCountries.split(",").map(value => value.trim().toUpperCase()).filter(Boolean);
      const body = {
        supplierName: form.supplierName.trim(),
        supplierWebsite: form.supplierWebsite.trim() || null,
        sourcePlatform: form.sourcePlatform.trim() || null,
        sourceProductUrl: form.sourceProductUrl.trim() || null,
        supplierProductReference: form.supplierProductReference.trim() || null,
        proposedTitle: form.proposedTitle.trim() || null,
        proposedDescription: form.proposedDescription.trim() || null,
        proposedPrice: form.proposedPrice === "" ? null : Number(form.proposedPrice),
        currency: form.currency.trim().toUpperCase() || null,
        supplierContact: form.supplierContact.trim() || null,
        availabilityClaim: form.availabilityClaim.trim() || null,
        fulfilmentClaim: form.fulfilmentClaim.trim() || null,
        supplierDropshipConfirmed: form.supplierDropshipConfirmed,
        supplierIdentityVerified: form.supplierIdentityVerified,
        specificationsVerified: form.specificationsVerified,
        sampleInspected: form.sampleInspected,
        minimumOrderQuantity: form.minimumOrderQuantity === "" ? null : Number(form.minimumOrderQuantity),
        shippingCountries: countries,
        shippingCost: form.shippingCost === "" ? null : Number(form.shippingCost),
        shippingCurrency: form.shippingCurrency.trim().toUpperCase() || null,
        estimatedShippingDaysMin: form.shippingMin === "" ? null : Number(form.shippingMin),
        estimatedShippingDaysMax: form.shippingMax === "" ? null : Number(form.shippingMax),
        quoteValidUntil: form.quoteValidUntil || null,
        evidence,
        verificationStatus: "unverified",
        reviewStatus: "needs_owner_review",
      };
      const response = await fetch("/api/platform/official-store/sourcing-candidates", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("create");
      setForm({ ...initial }); setNotice(t.created); await load();
    } catch { setError(t.saveError); }
    finally { setSaving(false); }
  }

  async function patch(candidate: Candidate, body: Record<string, unknown>) {
    setBusyId(candidate.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/platform/official-store/sourcing-candidates/${candidate.id}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("patch");
      setNotice(t.saved); await load();
    } catch { setError(t.actionError); }
    finally { setBusyId(""); }
  }

  if (isPending || checking) return <main style={styles.shell} dir={ar ? "rtl" : "ltr"}>{t.loading}</main>;
  if (!authorized) return <main style={styles.shell} dir={ar ? "rtl" : "ltr"}><h1>{ar ? "هذه الصفحة مخصصة لمالك المنصة." : "Platform owner access required."}</h1><Link href="/owner">{t.back}</Link></main>;

  const status = (value: string) => value === "verified" ? t.verified : value === "partially_verified" ? t.partial : value === "awaiting_supplier" ? t.awaiting : value === "rejected" ? t.rejected : t.unverified;
  const review = (value: string) => value === "approved" ? t.approved : value === "rejected" ? t.rejected : value === "needs_owner_review" ? t.review : t.draft;

  return <main style={styles.shell} dir={ar ? "rtl" : "ltr"} lang={locale}>
    <header style={styles.header}>
      <div><Link href="/owner/official-store" style={styles.back}>← {t.back}</Link><h1>{t.title}</h1><p>{t.subtitle}</p></div>
      <span style={styles.tag}>OWNER REVIEW</span>
    </header>
    <section style={styles.notice}><strong>{t.note}</strong></section>
    <section style={styles.panel}>
      <h2>{t.add}</h2>
      <form onSubmit={create} style={styles.form}>
        <label>{t.supplier}<input required maxLength={180} style={styles.input} value={form.supplierName} onChange={e => update("supplierName", e.target.value)} /></label>
        <label>{t.platform}<input maxLength={80} style={styles.input} value={form.sourcePlatform} onChange={e => update("sourcePlatform", e.target.value)} /></label>
        <label>{t.website}<input type="url" placeholder="https://" style={styles.input} value={form.supplierWebsite} onChange={e => update("supplierWebsite", e.target.value)} /></label>
        <label>{t.source}<input type="url" placeholder="https://" style={styles.input} value={form.sourceProductUrl} onChange={e => update("sourceProductUrl", e.target.value)} /></label>
        <label>{t.ref}<input maxLength={500} style={styles.input} value={form.supplierProductReference} onChange={e => update("supplierProductReference", e.target.value)} /></label>
        <label>{t.product}<input maxLength={500} style={styles.input} value={form.proposedTitle} onChange={e => update("proposedTitle", e.target.value)} /></label>
        <label>{t.price}<input type="number" min="0" step="0.01" style={styles.input} value={form.proposedPrice} onChange={e => update("proposedPrice", e.target.value)} /></label>
        <label>{t.currency}<input required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" style={styles.input} value={form.currency} onChange={e => update("currency", e.target.value)} /></label>
        <label>{t.contact}<input maxLength={500} style={styles.input} value={form.supplierContact} onChange={e => update("supplierContact", e.target.value)} /></label>
        <label>{t.moq}<input type="number" min="1" step="1" style={styles.input} value={form.minimumOrderQuantity} onChange={e => update("minimumOrderQuantity", e.target.value)} /></label>
        <label>{t.shippingCost}<input type="number" min="0" step="0.01" style={styles.input} value={form.shippingCost} onChange={e => update("shippingCost", e.target.value)} /></label>
        <label>{t.shippingCurrency}<input minLength={3} maxLength={3} pattern="[A-Za-z]{3}" style={styles.input} value={form.shippingCurrency} onChange={e => update("shippingCurrency", e.target.value)} /></label>
        <label>{t.shipMin}<input type="number" min="0" step="1" style={styles.input} value={form.shippingMin} onChange={e => update("shippingMin", e.target.value)} /></label>
        <label>{t.shipMax}<input type="number" min="0" step="1" style={styles.input} value={form.shippingMax} onChange={e => update("shippingMax", e.target.value)} /></label>
        <label>{t.quoteExpiry}<input type="date" style={styles.input} value={form.quoteValidUntil} onChange={e => update("quoteValidUntil", e.target.value ? new Date(e.target.value + "T23:59:59Z").toISOString() : "")} /></label>
        <label style={styles.full}>{t.evidence}<input type="url" placeholder="https://" style={styles.input} value={form.evidenceUrl} onChange={e => update("evidenceUrl", e.target.value)} /></label>
        <label style={styles.full}>{t.specEvidence}<input type="url" placeholder="https://" style={styles.input} value={form.specificationEvidenceUrl} onChange={e => update("specificationEvidenceUrl", e.target.value)} /></label>
        <label style={styles.full}>{t.countries}<input style={styles.input} value={form.shippingCountries} onChange={e => update("shippingCountries", e.target.value)} /></label>
        <label style={styles.full}>{t.description}<textarea rows={3} maxLength={10000} style={styles.input} value={form.proposedDescription} onChange={e => update("proposedDescription", e.target.value)} /></label>
        <label style={styles.full}>{t.availability}<textarea rows={2} maxLength={500} style={styles.input} value={form.availabilityClaim} onChange={e => update("availabilityClaim", e.target.value)} /></label>
        <label style={styles.full}>{t.fulfilment}<textarea rows={3} maxLength={500} style={styles.input} value={form.fulfilmentClaim} onChange={e => update("fulfilmentClaim", e.target.value)} /></label>
        <label style={styles.check}><input type="checkbox" checked={form.supplierIdentityVerified} onChange={e => update("supplierIdentityVerified", e.target.checked)} /> {t.identityVerified}</label>
        <label style={styles.check}><input type="checkbox" checked={form.specificationsVerified} onChange={e => update("specificationsVerified", e.target.checked)} /> {t.specsVerified}</label>
        <label style={styles.check}><input type="checkbox" checked={form.sampleInspected} onChange={e => update("sampleInspected", e.target.checked)} /> {t.sampleInspected}</label>
        <label style={styles.check}><input type="checkbox" checked={form.supplierDropshipConfirmed} onChange={e => update("supplierDropshipConfirmed", e.target.checked)} /> {t.dropship}</label>
        <div style={styles.actions}><button type="submit" style={styles.button} disabled={saving}>{saving ? t.saving : t.save}</button></div>
      </form>
      {error && <p role="alert" style={styles.error}>{error}</p>}
      {notice && <p role="status" style={styles.success}>{notice}</p>}
    </section>
    <section style={styles.panel}>
      <h2>{t.queue}</h2>
      {loading ? <p>{t.loading}</p> : candidates.length === 0 ? <p>{t.empty}</p> : <div style={styles.list}>
        {candidates.map(candidate => <article key={candidate.id} style={styles.card}>
          <div style={styles.cardHead}><div><strong>{candidate.proposed_title || candidate.supplier_product_reference || candidate.supplier_name}</strong><small>{candidate.supplier_name} · {candidate.source_platform || "—"}</small></div><span style={styles.state}>{review(candidate.review_status)}</span></div>
          <div style={styles.meta}>
            <span>{t.priceLabel}: {candidate.proposed_price ?? "—"} {candidate.currency ?? ""}</span>
            <span>{t.moqLabel}: {candidate.minimum_order_quantity ?? "—"}</span>
            <span>{t.shipLabel}: {candidate.estimated_shipping_days_min ?? "—"}–{candidate.estimated_shipping_days_max ?? "—"} {ar ? "يوم" : "days"}</span>
            <span>{status(candidate.verification_status)}</span>
          </div>
          <p>{candidate.supplier_dropship_confirmed ? t.dropshipYes : t.dropshipNo}</p>
          {candidate.source_product_url && <a href={candidate.source_product_url} target="_blank" rel="noreferrer" style={styles.sourceLink}>{t.sourceLabel} ↗</a>}
          <div style={styles.actions}>
            {candidate.verification_status !== "verified" && <button type="button" style={styles.secondary} disabled={busyId === candidate.id} onClick={() => patch(candidate, { verificationStatus: "verified" })}>{t.verify}</button>}
            {candidate.review_status !== "approved" && <button type="button" style={styles.button} disabled={busyId === candidate.id} onClick={() => patch(candidate, { reviewStatus: "approved" })}>{t.approve}</button>}
            {candidate.review_status !== "rejected" && <button type="button" style={styles.danger} disabled={busyId === candidate.id} onClick={() => patch(candidate, { reviewStatus: "rejected" })}>{t.reject}</button>}
          </div>
        </article>)}
      </div>}
    </section>
  </main>;
}

const styles: Record<string, CSSProperties> = {
  shell: { minHeight: "100vh", padding: "30px clamp(16px,5vw,64px)", background: "#f5f1e8", color: "#17253a", fontFamily: "Arial,sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 22 },
  back: { color: "#9a742d", textDecoration: "none", fontWeight: 700 },
  tag: { padding: "9px 13px", borderRadius: 20, background: "#e9e1d2", fontSize: 11, fontWeight: 800 },
  notice: { background: "#fffaf0", border: "1px solid #d8c9a8", borderRadius: 12, padding: 17, marginBottom: 20, lineHeight: 1.6 },
  panel: { background: "#fff", border: "1px solid #e4dfd4", borderRadius: 16, padding: 22, marginBottom: 20, boxShadow: "0 8px 24px rgba(23,37,58,.04)" },
  form: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 },
  label: { display: "grid", gap: 7, fontSize: 13, fontWeight: 700 },
  input: { boxSizing: "border-box", width: "100%", border: "1px solid #dce1e8", borderRadius: 8, padding: "11px 12px", background: "#fbfcfd", color: "#17253a", font: "inherit", minWidth: 0 },
  full: { gridColumn: "1 / -1", display: "grid", gap: 7, fontSize: 13, fontWeight: 700 },
  check: { display: "flex", alignItems: "center", gap: 9, gridColumn: "1 / -1", fontSize: 13, fontWeight: 700 },
  actions: { display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginTop: 12 },
  button: { border: 0, borderRadius: 8, padding: "10px 14px", background: "#17253a", color: "#fff", fontWeight: 700, cursor: "pointer" },
  secondary: { border: "1px solid #c9b98f", borderRadius: 8, padding: "9px 13px", background: "#fffaf0", color: "#72551f", fontWeight: 700, cursor: "pointer" },
  danger: { border: "1px solid #e5c4bf", borderRadius: 8, padding: "9px 13px", background: "#fff5f3", color: "#963e34", fontWeight: 700, cursor: "pointer" },
  error: { color: "#9b3d32", fontWeight: 700 }, success: { color: "#247653", fontWeight: 700 },
  list: { display: "grid", gap: 12 },
  card: { border: "1px solid #e7e2d8", borderRadius: 12, padding: 16, display: "grid", gap: 10 },
  cardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  state: { padding: "6px 10px", borderRadius: 20, background: "#f5f0e4", color: "#72551f", fontSize: 11, fontWeight: 700 },
  meta: { display: "flex", gap: 14, flexWrap: "wrap", color: "#5e6a79", fontSize: 12 },
  sourceLink: { color: "#876525", fontWeight: 700, fontSize: 12, width: "fit-content" },
};
