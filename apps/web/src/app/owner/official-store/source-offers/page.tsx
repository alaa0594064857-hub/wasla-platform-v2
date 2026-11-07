"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../../../components/locale-provider";

type Product = { id: string; title_ar: string; title_en: string };
type MatchResult = { productId: string; titleAr: string; titleEn: string; score: number; reasons: string[] };
type Offer = {
  id: string; product_id: string; title_ar: string; title_en: string;
  supplier_name: string; source_platform: string; source_product_url: string;
  supplier_price: string; supplier_currency: string; shipping_cost: string | null;
  shipping_currency: string | null; minimum_order_quantity: number | null;
  availability_status: string; offer_status: string; supplier_identity_verified: boolean;
  specifications_verified: boolean; direct_to_customer_confirmed: boolean;
};

const initial = {
  productId: "", supplierName: "", sourcePlatform: "", sourceProductUrl: "",
  variantDescription: "", supplierPrice: "", supplierCurrency: "USD", shippingCost: "",
  shippingCurrency: "USD", minimumOrderQuantity: "1", shipsToCountries: "TR,US,GB,DE",
  directToCustomerConfirmed: false, availabilityStatus: "needs_confirmation",
  evidenceUrl: "", specificationEvidenceUrl: "", quoteValidUntil: "",
};

export default function OfficialStoreSourceOffersPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [form, setForm] = useState({ ...initial });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [matchInput, setMatchInput] = useState({ title: "", brand: "", model: "", gtin: "", mpn: "" });
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [matching, setMatching] = useState(false);
  const [matchDecision, setMatchDecision] = useState("");
  const [identityBusy, setIdentityBusy] = useState("");
  const [importForm, setImportForm] = useState({ provider: "shopify", supplierName: "", productUrl: "", supplierEvidenceUrl: "", specificationEvidenceUrl: "", payload: "" });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ importedCount: number; candidates: Array<{ id: string; proposed_title: string }> } | null>(null);
  const [pricingForm, setPricingForm] = useState({ supplierCost: "", supplierCurrency: "USD", shippingCost: "", shippingCurrency: "USD", displayCurrency: "USD", marginPercent: "20", fixedMargin: "0", additionalCost: "", additionalCostCurrency: "USD", additionalCostType: "other_cost" });
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingResult, setPricingResult] = useState<{ currency: string; breakdown: { costSubtotal: number; margin: { total: number }; finalCustomerPrice: number }; warnings: string[] } | null>(null);

  const t = ar ? {
    title: "عروض الموردين للمنتجات الموحدة",
    importTitle: "استيراد بيانات منتج من مصدر موثوق", importHelp: "الصق بيانات منتج حصلت عليها من واجهة المورد الرسمية أو ملف كتالوج مصرح به. ستدخل المنتجات للمراجعة فقط.", provider: "نوع المصدر", shopify: "Shopify", feed: "كتالوج مورد", importSupplier: "اسم المورد", importUrl: "رابط المنتج الأصلي HTTPS", payload: "بيانات المنتج بصيغة JSON", importRun: "استيراد للمراجعة", importing: "جارٍ الاستيراد...", imported: "عدد المنتجات التي أضيفت للمراجعة", importRights: "الصور لا تُنسخ ولا تُنشر تلقائياً؛ يجب مراجعة حقوق استخدامها والتحقق من المورد والتوفر والشحن.", pricingTitle: "معاينة سعر البيع", pricingHelp: "أدخل التكلفة الفعلية وهامش WASLA. لا يتم نشر السعر تلقائياً.", supplierCostLabel: "تكلفة المورد", shippingCostLabel: "تكلفة الشحن", displayCurrencyLabel: "عملة سعر العميل", marginLabel: "هامش الربح %", fixedMarginLabel: "هامش ثابت", extraCostLabel: "تكلفة إضافية موثقة (اختياري)", extraCostType: "نوع التكلفة", calculate: "احسب السعر", calculating: "جارٍ الحساب...", costSubtotalLabel: "إجمالي التكلفة", marginTotalLabel: "هامش WASLA", finalPriceLabel: "السعر المقترح للعميل", pricingWarning: "هذا حساب تجريبي للمالك فقط. أدخل الضرائب والجمارك والرسوم الفعلية كبنود منفصلة؛ لا نفترض قيماً لها.", supplierProof: "رابط إثبات هوية المورد HTTPS", specificationProof: "رابط إثبات مواصفات المنتج HTTPS",
    saveIdentity: "اعتماد بيانات المنتج الموحد", identitySaved: "تم حفظ هوية المنتج.", matchTitle: "مطابقة منتج من موقع خارجي", matchHelp: "أدخل بيانات المنتج من الموقع الآخر لمعرفة هل هو موجود لدينا باسم أو سجل مختلف.", match: "مطابقة المنتجات", matchRun: "ابحث عن منتج مطابق", matchBusy: "جارٍ فحص المنتجات...", brand: "العلامة التجارية", model: "الموديل", gtin: "GTIN / الباركود", mpn: "رقم القطعة", matches: "المنتجات المحتملة", noMatch: "لم نجد تطابقاً موثوقاً. يلزم مراجعة أو إنشاء منتج جديد.",
    subtitle: "اربط عدة عروض توريد بالمنتج نفسه، مع الاحتفاظ بسعر وشحن ومصدر كل مورد بشكل مستقل.",
    back: "العودة إلى متجر WASLA", add: "إضافة عرض توريد", product: "منتج WASLA",
    supplier: "اسم المورد", platform: "الموقع أو المنصة", url: "رابط المنتج الأصلي HTTPS",
    availability: "حالة التوفر بعد التأكد", available: "متوفر", limited: "توفر محدود", needsConfirmation: "بانتظار التأكيد", unavailable: "غير متوفر",
    variant: "المقاس أو اللون أو الموديل", price: "سعر المورد", currency: "عملة المورد", shipping: "تكلفة الشحن",
    shippingCurrency: "عملة الشحن", moq: "الحد الأدنى للطلب",
    countries: "الدول المتاح الشحن إليها (رموز مثل TR,US)",
    dropship: "المورد أكد الشحن مباشرة للعميل",
    evidence: "رابط إثبات هوية/بيانات المورد HTTPS",
    specificationEvidence: "رابط إثبات مواصفات المنتج HTTPS",
    quoteExpiry: "تاريخ انتهاء عرض السعر",
    save: "حفظ العرض", saving: "جارٍ الحفظ...", offers: "العروض المسجلة",
    empty: "لا توجد عروض توريد بعد.", error: "تعذر تنفيذ العملية. تحقق من البيانات.",
    saved: "تم حفظ عرض المورد.", verify: "تأكيد التحقق والاعتماد",
    identity: "هوية المورد", specs: "مطابقة المواصفات", direct: "الشحن المباشر",
    approve: "اعتماد العرض", needs: "بانتظار المراجعة",
    note: "لا يؤدي تسجيل العرض إلى نشر المنتج أو شراءه. لا يُعتمد العرض إلا بعد توثيق الهوية والمواصفات والسعر والشحن وتأكيد التوفر.",
  } : {
    title: "Supplier offers for unified products",
    importTitle: "Import product data from an authorized source", importHelp: "Paste product data obtained from the merchant’s official API or an authorized catalog feed. Imported records enter review only.", provider: "Source type", shopify: "Shopify", feed: "Merchant feed", importSupplier: "Supplier name", importUrl: "Original HTTPS product URL", payload: "Product data (JSON)", importRun: "Import for review", importing: "Importing...", imported: "Products added to review", importRights: "Images are not copied or published automatically. Image rights, supplier identity, availability and shipping must be verified.", pricingTitle: "Customer price preview", pricingHelp: "Enter actual costs and the WASLA margin. The result is not published automatically.", supplierCostLabel: "Supplier cost", shippingCostLabel: "Shipping cost", displayCurrencyLabel: "Customer price currency", marginLabel: "Margin %", fixedMarginLabel: "Fixed margin", extraCostLabel: "Verified additional cost (optional)", extraCostType: "Cost type", calculate: "Calculate price", calculating: "Calculating...", costSubtotalLabel: "Total cost", marginTotalLabel: "WASLA margin", finalPriceLabel: "Suggested customer price", pricingWarning: "Owner-only preview. Add actual taxes, customs and fees as separate line items; no values are assumed.", supplierProof: "Supplier identity evidence URL HTTPS", specificationProof: "Exact product specification evidence URL HTTPS",
    saveIdentity: "Save canonical product identity", identitySaved: "Canonical product identity saved.", matchTitle: "Match a product from another website", matchHelp: "Enter product details from an external listing to check whether it already exists under another title or record.", match: "Product matching", matchRun: "Find matching products", matchBusy: "Comparing products...", brand: "Brand", model: "Model", gtin: "GTIN / barcode", mpn: "Part number", matches: "Possible matches", noMatch: "No confident match found. Review manually or create a new product.",
    subtitle: "Link multiple supplier offers to one WASLA product while keeping each source, price and shipping terms separate.",
    back: "Back to official WASLA Store", add: "Add supplier offer", product: "WASLA product",
    supplier: "Supplier name", platform: "Source site or marketplace", url: "Original product URL HTTPS",
    availability: "Verified availability", available: "Available", limited: "Limited", needsConfirmation: "Needs confirmation", unavailable: "Unavailable",
    variant: "Size, colour or model variant", price: "Supplier price", currency: "Supplier currency", shipping: "Shipping cost",
    shippingCurrency: "Shipping currency", moq: "Minimum order quantity",
    countries: "Shipping destinations (ISO codes e.g. TR,US)",
    dropship: "Supplier confirmed direct-to-customer shipping",
    evidence: "Supplier identity/offer proof URL HTTPS",
    specificationEvidence: "Exact product specification proof URL HTTPS",
    quoteExpiry: "Supplier quote expiry",
    save: "Save offer", saving: "Saving...", offers: "Recorded offers",
    empty: "No supplier offers yet.", error: "Could not complete the action. Check the fields.",
    saved: "Supplier offer saved.", verify: "Confirm verification and approval",
    identity: "Supplier identity", specs: "Specifications", direct: "Direct shipping",
    approve: "Approve offer", needs: "Needs review",
    note: "Recording an offer does not publish or purchase the product. Approval requires evidence for supplier identity, exact specifications, price, shipping and availability.",
  };

  async function load() {
    const [p, o] = await Promise.all([
      fetch("/api/platform/official-store/products", { credentials: "include", cache: "no-store" }),
      fetch("/api/platform/official-store/source-offers", { credentials: "include", cache: "no-store" }),
    ]);
    const pd = await p.json(); const od = await o.json();
    if (!p.ok || !pd.success || !o.ok || !od.success) throw new Error("load");
    setProducts(Array.isArray(pd.products) ? pd.products : []);
    setOffers(Array.isArray(od.offers) ? od.offers : []);
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
      .then(async data => {
        if (!active) return;
        const ok = Boolean(data?.success && data.platformAccess?.roles?.includes("platform_owner") && data.platformAccess?.permissions?.includes("platform.manage"));
        setAuthorized(ok);
        if (ok) await load();
      })
      .catch(() => { if (active) setError(t.error); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [isPending, session?.user?.id]);

  function update<K extends keyof typeof initial>(key: K, value: typeof initial[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function runMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMatching(true); setMatchResults([]); setMatchDecision(""); setError("");
    try {
      const response = await fetch("/api/platform/official-store/product-matches", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(matchInput),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("match");
      setMatchResults(Array.isArray(data.matches) ? data.matches : []);
      setMatchDecision(String(data.decision || ""));
    } catch { setError(t.error); }
    finally { setMatching(false); }
  }

  async function saveIdentity(productId: string) {
    setIdentityBusy(productId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/platform/official-store/product-matches", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...matchInput, productId, saveIdentity: true }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("identity");
      setNotice(t.identitySaved);
    } catch { setError(t.error); }
    finally { setIdentityBusy(""); }
  }

  async function importCandidates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setImporting(true); setImportResult(null); setError(""); setNotice("");
    try {
      const payload = JSON.parse(importForm.payload);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("json");
      const response = await fetch("/api/platform/official-store/import-candidates", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: importForm.provider, supplierName: importForm.supplierName.trim(), productUrl: importForm.productUrl.trim(), supplierEvidenceUrl: importForm.supplierEvidenceUrl.trim() || null, specificationEvidenceUrl: importForm.specificationEvidenceUrl.trim() || null, payload }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("import");
      setImportResult({ importedCount: Number(data.importedCount || 0), candidates: Array.isArray(data.candidates) ? data.candidates : [] });
      setNotice(ar ? "تم استيراد البيانات إلى قائمة المراجعة فقط." : "Data imported into the review queue only.");
    } catch { setError(ar ? "تعذر الاستيراد. تحقق من رابط HTTPS وصيغة JSON وبيانات المصدر." : "Import failed. Check the HTTPS URL, JSON format and source data."); }
    finally { setImporting(false); }
  }

  async function calculatePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPricingBusy(true); setPricingResult(null); setError("");
    try {
      const costs = pricingForm.additionalCost.trim() ? [{ type: pricingForm.additionalCostType, amount: Number(pricingForm.additionalCost), currency: pricingForm.additionalCostCurrency.toUpperCase() }] : [];
      const response = await fetch("/api/platform/official-store/pricing/preview", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplierCost: Number(pricingForm.supplierCost), supplierCurrency: pricingForm.supplierCurrency.toUpperCase(), shippingCost: Number(pricingForm.shippingCost), shippingCurrency: pricingForm.shippingCurrency.toUpperCase(), displayCurrency: pricingForm.displayCurrency.toUpperCase(), marginPercent: Number(pricingForm.marginPercent), fixedMargin: Number(pricingForm.fixedMargin), costs }) });
      const data = await response.json();
      if (!response.ok || !data.success || !data.previewOnly) throw new Error("pricing");
      setPricingResult(data);
    } catch { setError(ar ? "تعذر الحساب. يجب أن تتطابق العملات في هذه المعاينة الأولية." : "Calculation failed. Currencies must match in this basic preview."); }
    finally { setPricingBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const countries = form.shipsToCountries.split(",").map(x => x.trim().toUpperCase()).filter(Boolean);
      const evidence = [
        ...(form.evidenceUrl.trim() ? [{ type: "supplier_evidence_url", url: form.evidenceUrl.trim() }] : []),
        ...(form.specificationEvidenceUrl.trim() ? [{ type: "product_specification", url: form.specificationEvidenceUrl.trim() }] : []),
      ];
      const response = await fetch("/api/platform/official-store/source-offers", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: form.productId, supplierName: form.supplierName.trim(),
          sourcePlatform: form.sourcePlatform.trim(), sourceProductUrl: form.sourceProductUrl.trim(),
          variantAttributes: form.variantDescription.trim() ? { description: form.variantDescription.trim() } : {},
          supplierPrice: Number(form.supplierPrice), supplierCurrency: form.supplierCurrency.trim().toUpperCase(),
          shippingCost: form.shippingCost === "" ? null : Number(form.shippingCost),
          shippingCurrency: form.shippingCurrency.trim().toUpperCase(),
          minimumOrderQuantity: form.minimumOrderQuantity === "" ? null : Number(form.minimumOrderQuantity),
          shipsToCountries: countries, directToCustomerConfirmed: form.directToCustomerConfirmed,
          availabilityStatus: form.availabilityStatus,
          quoteValidUntil: form.quoteValidUntil ? new Date(form.quoteValidUntil).toISOString() : null,
          evidence,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("save");
      setForm({ ...initial }); setNotice(t.saved); await load();
    } catch { setError(t.error); }
    finally { setSaving(false); }
  }

  async function review(offer: Offer) {
    setBusyId(offer.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/platform/official-store/source-offers/${offer.id}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierIdentityVerified: true, specificationsVerified: true,
          directToCustomerConfirmed: true, offerStatus: "approved",
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("review");
      setNotice(t.saved); await load();
    } catch { setError(t.error); }
    finally { setBusyId(""); }
  }

  if (checking || isPending) return <main style={{ padding: 28 }}>{ar ? "جارٍ التحقق..." : "Checking access..."}</main>;
  if (!authorized) return <main style={{ padding: 28 }}>{ar ? "هذه الصفحة مخصصة لمالك المنصة." : "Platform owner access required."}</main>;

  const inputStyle = { width: "100%", padding: "11px 12px", border: "1px solid #d5d9e2", borderRadius: 10, background: "white", color: "#172033", boxSizing: "border-box" as const };
  const labelStyle = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 as const, color: "#29344b" };

  return <main style={{ maxWidth: 1050, margin: "0 auto", padding: "28px 18px 60px", color: "var(--foreground)" }}>
    <Link href="/owner/official-store" style={{ color: "#9b762c", textDecoration: "none", fontWeight: 700 }}>{t.back}</Link>
    <h1 style={{ fontSize: 28, margin: "18px 0 8px" }}>{t.title}</h1>
    <p style={{ opacity: .78, marginTop: 0 }}>{t.subtitle}</p>
    <section style={{ padding: 18, border: "1px solid #d8dce5", borderRadius: 16, marginTop: 22 }}>
    <section style={{ padding: 18, border: "1px solid #d8dce5", borderRadius: 16, marginTop: 22 }}>
      <h2 style={{ fontSize: 19, marginTop: 0 }}>{t.importTitle}</h2>
      <p style={{ fontSize: 13, opacity: .75 }}>{t.importHelp}</p>
      <form onSubmit={importCandidates} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <label style={labelStyle}>{t.provider}<select value={importForm.provider} onChange={e => setImportForm(s => ({ ...s, provider: e.target.value }))} style={inputStyle}><option value="shopify">{t.shopify}</option><option value="merchant_feed">{t.feed}</option></select></label>
          <label style={labelStyle}>{t.importSupplier}<input required value={importForm.supplierName} onChange={e => setImportForm(s => ({ ...s, supplierName: e.target.value }))} style={inputStyle}/></label>
          <label style={labelStyle}>{t.importUrl}<input required type="url" placeholder="https://..." value={importForm.productUrl} onChange={e => setImportForm(s => ({ ...s, productUrl: e.target.value }))} style={inputStyle}/></label>
          <label style={labelStyle}>{t.supplierProof}<input type="url" placeholder="https://..." value={importForm.supplierEvidenceUrl} onChange={e => setImportForm(s => ({ ...s, supplierEvidenceUrl: e.target.value }))} style={inputStyle}/></label>
          <label style={labelStyle}>{t.specificationProof}<input type="url" placeholder="https://..." value={importForm.specificationEvidenceUrl} onChange={e => setImportForm(s => ({ ...s, specificationEvidenceUrl: e.target.value }))} style={inputStyle}/></label>
        </div>
        <label style={labelStyle}>{t.payload}<textarea required rows={8} value={importForm.payload} onChange={e => setImportForm(s => ({ ...s, payload: e.target.value }))} placeholder={importForm.provider === "shopify" ? '{"product":{"title":"Product name","vendor":"Brand","variants":[{"sku":"SKU-1","price":"19.99","available":true}]}}' : '{"title":"Product name","brand":"Brand","sku":"SKU-1","price":"19.99","currency":"USD","available":true,"images":[]}' } style={{ ...inputStyle, fontFamily: "monospace", resize: "vertical" }}/></label>
        <button disabled={importing} type="submit" style={{ padding: "11px 15px", border: 0, borderRadius: 10, background: "#27344d", color: "white", fontWeight: 700 }}>{importing ? t.importing : t.importRun}</button>
      </form>
      <p style={{ fontSize: 12, opacity: .75 }}>{t.importRights}</p>
      {importResult && <div role="status" style={{ marginTop: 12, padding: 12, background: "#f6f4ee", borderRadius: 10 }}>
        <strong>{t.imported}: {importResult.importedCount}</strong>
        {importResult.candidates.map(item => <p key={item.id} style={{ margin: "6px 0" }}>{item.proposed_title}</p>)}
      </div>}
    </section>
      <h2 style={{ fontSize: 19, marginTop: 0 }}>{t.matchTitle}</h2>
      <p style={{ fontSize: 13, opacity: .75 }}>{t.matchHelp}</p>
      <form onSubmit={runMatch} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        <label style={labelStyle}>{ar ? "اسم المنتج" : "Product title"}<input required minLength={3} value={matchInput.title} onChange={e => setMatchInput(s => ({ ...s, title: e.target.value }))} style={inputStyle}/></label>
        <label style={labelStyle}>{t.brand}<input value={matchInput.brand} onChange={e => setMatchInput(s => ({ ...s, brand: e.target.value }))} style={inputStyle}/></label>
        <label style={labelStyle}>{t.model}<input value={matchInput.model} onChange={e => setMatchInput(s => ({ ...s, model: e.target.value }))} style={inputStyle}/></label>
        <label style={labelStyle}>{t.gtin}<input value={matchInput.gtin} onChange={e => setMatchInput(s => ({ ...s, gtin: e.target.value }))} style={inputStyle}/></label>
        <label style={labelStyle}>{t.mpn}<input value={matchInput.mpn} onChange={e => setMatchInput(s => ({ ...s, mpn: e.target.value }))} style={inputStyle}/></label>
        <button disabled={matching} type="submit" style={{ padding: "11px 15px", border: 0, borderRadius: 10, background: "#27344d", color: "white", fontWeight: 700 }}>{matching ? t.matchBusy : t.matchRun}</button>
      </form>
      {matchDecision && <div style={{ marginTop: 14 }}><strong>{t.matches}</strong>
        {matchResults.length === 0 ? <p>{t.noMatch}</p> : matchResults.map(item => <p key={item.productId} style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 8 }}>
          <strong>{ar ? item.titleAr : item.titleEn}</strong> · {item.score}% · {item.reasons.join(", ")}
          <button type="button" disabled={identityBusy === item.productId} onClick={() => void saveIdentity(item.productId)} style={{ display: "block", marginTop: 7, padding: "7px 10px", border: "1px solid #b18a3c", borderRadius: 8, background: "white", color: "#8a682a" }}>{identityBusy === item.productId ? "..." : t.saveIdentity}</button>
        </p>)}
        <p style={{ fontSize: 12, opacity: .7 }}>{ar ? "هذه اقتراحات للمراجعة فقط؛ لا يتم دمج السجلات تلقائياً." : "Suggestions only; records are never merged automatically."}</p>
      </div>}
    </section>
    <section style={{ padding: 18, border: "1px solid #d8dce5", borderRadius: 16, marginTop: 22 }}>
      <h2 style={{ fontSize: 19, marginTop: 0 }}>{t.add}</h2>
      <form onSubmit={save} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 13 }}>
        <label style={labelStyle}>{t.product}<select required value={form.productId} onChange={e => update("productId", e.target.value)} style={inputStyle}>
          <option value="">{ar ? "اختر المنتج" : "Select product"}</option>
          {products.map(p => <option key={p.id} value={p.id}>{ar ? p.title_ar : p.title_en}</option>)}
        </select></label>
        <label style={labelStyle}>{t.supplier}<input required value={form.supplierName} onChange={e => update("supplierName", e.target.value)} style={inputStyle}/></label>
        <label style={labelStyle}>{t.platform}<input required value={form.sourcePlatform} onChange={e => update("sourcePlatform", e.target.value)} style={inputStyle}/></label>
        <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>{t.url}<input required type="url" value={form.sourceProductUrl} onChange={e => update("sourceProductUrl", e.target.value)} style={inputStyle}/></label>
        <label style={labelStyle}>{t.variant}<input value={form.variantDescription} onChange={e => update("variantDescription", e.target.value)} style={inputStyle}/></label>
        <label style={labelStyle}>{t.price}<input required type="number" min="0" step="0.01" value={form.supplierPrice} onChange={e => update("supplierPrice", e.target.value)} style={inputStyle}/></label>
        <label style={labelStyle}>{t.currency}<input required maxLength={3} value={form.supplierCurrency} onChange={e => update("supplierCurrency", e.target.value)} style={inputStyle}/></label>
        <label style={labelStyle}>{t.shipping}<input type="number" min="0" step="0.01" value={form.shippingCost} onChange={e => update("shippingCost", e.target.value)} style={inputStyle}/></label>
        <label style={labelStyle}>{t.shippingCurrency}<input maxLength={3} value={form.shippingCurrency} onChange={e => update("shippingCurrency", e.target.value)} style={inputStyle}/></label>
        <label style={labelStyle}>{t.moq}<input type="number" min="1" step="1" value={form.minimumOrderQuantity} onChange={e => update("minimumOrderQuantity", e.target.value)} style={inputStyle}/></label>
        <label style={labelStyle}>{t.countries}<input value={form.shipsToCountries} onChange={e => update("shipsToCountries", e.target.value)} style={inputStyle}/></label>
        <label style={labelStyle}>{t.availability}<select value={form.availabilityStatus} onChange={e => update("availabilityStatus", e.target.value)} style={inputStyle}>
          <option value="needs_confirmation">{t.needsConfirmation}</option>
          <option value="available">{t.available}</option>
          <option value="limited">{t.limited}</option>
          <option value="unavailable">{t.unavailable}</option>
        </select></label>
        <label style={labelStyle}>{t.quoteExpiry}<input required type="datetime-local" value={form.quoteValidUntil} onChange={e => update("quoteValidUntil", e.target.value)} style={inputStyle}/></label>
        <label style={labelStyle}>{t.evidence}<input required type="url" value={form.evidenceUrl} onChange={e => update("evidenceUrl", e.target.value)} style={inputStyle}/></label>
        <label style={labelStyle}>{t.specificationEvidence}<input required type="url" value={form.specificationEvidenceUrl} onChange={e => update("specificationEvidenceUrl", e.target.value)} style={inputStyle}/></label>
        <label style={{ display: "flex", gap: 9, alignItems: "center", gridColumn: "1 / -1" }}>
          <input type="checkbox" checked={form.directToCustomerConfirmed} onChange={e => update("directToCustomerConfirmed", e.target.checked)}/>{t.dropship}
        </label>
        <button disabled={saving} type="submit" style={{ padding: "12px 18px", border: 0, borderRadius: 10, background: "#b18a3c", color: "white", fontWeight: 700, cursor: "pointer" }}>{saving ? t.saving : t.save}</button>
      </form>
      <p style={{ fontSize: 13, opacity: .75, marginBottom: 0 }}>{t.note}</p>
      {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
      {notice && <p role="status" style={{ color: "#16804a" }}>{notice}</p>}
    </section>
    <section style={{ padding: 18, border: "1px solid #d8dce5", borderRadius: 16, marginTop: 22 }}>
      <h2 style={{ fontSize: 19, marginTop: 0 }}>{t.pricingTitle}</h2><p style={{ fontSize: 13, opacity: .75 }}>{t.pricingHelp}</p>
      <form onSubmit={calculatePrice} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        <label style={labelStyle}>{t.supplierCostLabel}<input required type="number" min="0" step="0.01" value={pricingForm.supplierCost} onChange={e => setPricingForm(s => ({ ...s, supplierCost: e.target.value }))} style={inputStyle}/></label>
        <label style={labelStyle}>{t.currency}<input required maxLength={3} value={pricingForm.supplierCurrency} onChange={e => setPricingForm(s => ({ ...s, supplierCurrency: e.target.value }))} style={inputStyle}/></label>
        <label style={labelStyle}>{t.shippingCostLabel}<input required type="number" min="0" step="0.01" value={pricingForm.shippingCost} onChange={e => setPricingForm(s => ({ ...s, shippingCost: e.target.value }))} style={inputStyle}/></label>
        <label style={labelStyle}>{t.shippingCurrency}<input required maxLength={3} value={pricingForm.shippingCurrency} onChange={e => setPricingForm(s => ({ ...s, shippingCurrency: e.target.value }))} style={inputStyle}/></label>
        <label style={labelStyle}>{t.displayCurrencyLabel}<input required maxLength={3} value={pricingForm.displayCurrency} onChange={e => setPricingForm(s => ({ ...s, displayCurrency: e.target.value }))} style={inputStyle}/></label>
        <label style={labelStyle}>{t.marginLabel}<input required type="number" min="0" max="500" step="0.1" value={pricingForm.marginPercent} onChange={e => setPricingForm(s => ({ ...s, marginPercent: e.target.value }))} style={inputStyle}/></label>
        <label style={labelStyle}>{t.fixedMarginLabel}<input required type="number" min="0" step="0.01" value={pricingForm.fixedMargin} onChange={e => setPricingForm(s => ({ ...s, fixedMargin: e.target.value }))} style={inputStyle}/></label>
        <label style={labelStyle}>{t.extraCostLabel}<input type="number" min="0" step="0.01" value={pricingForm.additionalCost} onChange={e => setPricingForm(s => ({ ...s, additionalCost: e.target.value }))} style={inputStyle}/></label>
        <label style={labelStyle}>{t.extraCostType}<select value={pricingForm.additionalCostType} onChange={e => setPricingForm(s => ({ ...s, additionalCostType: e.target.value }))} style={inputStyle}><option value="payment_fee">payment_fee</option><option value="tax">tax</option><option value="customs">customs</option><option value="other_cost">other_cost</option></select></label>
        <label style={labelStyle}>{t.currency}<input maxLength={3} value={pricingForm.additionalCostCurrency} onChange={e => setPricingForm(s => ({ ...s, additionalCostCurrency: e.target.value }))} style={inputStyle}/></label>
        <button disabled={pricingBusy} type="submit" style={{ padding: "11px 15px", border: 0, borderRadius: 10, background: "#27344d", color: "white", fontWeight: 700 }}>{pricingBusy ? t.calculating : t.calculate}</button>
      </form>
      <p style={{ fontSize: 12, opacity: .75 }}>{t.pricingWarning}</p>
      {pricingResult && <div role="status" style={{ marginTop: 12, padding: 14, background: "#f6f4ee", borderRadius: 10 }}>
        <p>{t.costSubtotalLabel}: <strong>{pricingResult.breakdown.costSubtotal.toFixed(2)} {pricingResult.currency}</strong></p>
        <p>{t.marginTotalLabel}: <strong>{pricingResult.breakdown.margin.total.toFixed(2)} {pricingResult.currency}</strong></p>
        <p>{t.finalPriceLabel}: <strong>{pricingResult.breakdown.finalCustomerPrice.toFixed(2)} {pricingResult.currency}</strong></p>
        {pricingResult.warnings.map((warning, index) => <p key={index} style={{ fontSize: 12, opacity: .75 }}>{warning}</p>)}
      </div>}
    </section>
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 20 }}>{t.offers}</h2>
      {offers.length === 0 ? <p>{t.empty}</p> : <div style={{ display: "grid", gap: 12 }}>
        {offers.map(offer => <article key={offer.id} style={{ padding: 16, border: "1px solid #d8dce5", borderRadius: 14 }}>
          <strong>{ar ? offer.title_ar : offer.title_en}</strong>
          <p style={{ margin: "6px 0" }}>{offer.supplier_name} · {offer.source_platform}</p>
          <p style={{ margin: "6px 0" }}>{offer.supplier_price} {offer.supplier_currency}{offer.shipping_cost ? ` + ${offer.shipping_cost} ${offer.shipping_currency || ""}` : ""} · MOQ: {offer.minimum_order_quantity ?? "—"}</p>
          <p style={{ margin: "6px 0", fontSize: 13, opacity: .75 }}>{offer.offer_status} · {offer.availability_status}</p>
          <a href={offer.source_product_url} target="_blank" rel="noreferrer" style={{ color: "#9b762c", fontSize: 13 }}>{ar ? "فتح المصدر" : "Open source listing"}</a>
          {offer.offer_status !== "approved" && <div><button disabled={busyId === offer.id} onClick={() => void review(offer)} style={{ display: "block", marginTop: 10, padding: "9px 13px", border: 0, borderRadius: 9, background: "#27344d", color: "white" }}>{busyId === offer.id ? "..." : t.verify}</button></div>}
        </article>)}
      </div>}
    </section>
  </main>;
}
