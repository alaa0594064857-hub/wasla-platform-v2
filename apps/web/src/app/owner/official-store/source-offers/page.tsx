"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../../../components/locale-provider";

type Product = { id: string; title_ar: string; title_en: string };
type RegisteredDataSource = { id: string; name: string; provider: string; permission_status: string };
type MatchResult = { productId: string; titleAr: string; titleEn: string; score: number; reasons: string[] };
type Offer = {
  id: string; product_id: string; title_ar: string; title_en: string;
  supplier_name: string; source_platform: string; source_product_url: string;
  supplier_price: string; supplier_currency: string; shipping_cost: string | null;
  shipping_currency: string | null; minimum_order_quantity: number | null;
  availability_status: string; offer_status: string; supplier_identity_verified: boolean;
  specifications_verified: boolean; direct_to_customer_confirmed: boolean;
  ships_to_countries?: string[]; quote_valid_until?: string; last_verified_at?: string | null;
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
  const [importForm, setImportForm] = useState({ provider: "shopify", dataSourceId: "", supplierName: "", productUrl: "", supplierEvidenceUrl: "", specificationEvidenceUrl: "", payload: "" });
  const [registeredSources, setRegisteredSources] = useState<RegisteredDataSource[]>([]);
  const [importing, setImporting] = useState(false);
  const [enrichmentBusyId, setEnrichmentBusyId] = useState("");
  const [enrichmentResults, setEnrichmentResults] = useState<Record<string, { category: string; classificationConfidence: number; facts: Record<string,string>; missingRequiredReviewFields: string[]; warnings: string[]; sourceEvidence?: Array<{ type: string; url?: string; value?: string; rightsStatus: string; verificationStatus: string }> }>>({});

  const [importResult, setImportResult] = useState<{ importedCount: number; candidates: Array<{ id: string; proposed_title: string; supplier_name?: string; proposed_price?: string | null; currency?: string | null; source_platform?: string; source_product_url?: string; review_status?: string; verification_status?: string; supplier_identity_verified?: boolean; specifications_verified?: boolean; supplier_dropship_confirmed?: boolean; minimum_order_quantity?: number | null }> } | null>(null);
  const [candidateReviewBusyId, setCandidateReviewBusyId] = useState("");
  const [sourcingCandidateId, setSourcingCandidateId] = useState("");
  const [pricingForm, setPricingForm] = useState({ supplierCost: "", supplierCurrency: "USD", supplierFxRate: "", supplierFxRateAsOf: "", supplierFxSource: "", shippingCost: "", shippingCurrency: "USD", shippingFxRate: "", shippingFxRateAsOf: "", shippingFxSource: "", displayCurrency: "USD", destinationCountry: "", marginPercent: "20", fixedMargin: "0", additionalCost: "", additionalCostCurrency: "USD", additionalCostFxRate: "", additionalCostFxRateAsOf: "", additionalCostFxSource: "", additionalCostType: "other_cost" });
  const [pricingCosts, setPricingCosts] = useState([{ id: "cost-1", type: "tax", amount: "", currency: "USD", fxRate: "", fxRateAsOf: "", fxSource: "" }]);
  const [pricingOfferId, setPricingOfferId] = useState("");
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingApprovalBusy, setPricingApprovalBusy] = useState(false);
  const [pricingResult, setPricingResult] = useState<{ previewId: string; productId: string; offerId: string; destinationCountry: string; currency: string; breakdown: { costSubtotal: number; margin: { total: number }; finalCustomerPrice: number; grossMarginPercent: number }; warnings: string[] } | null>(null);

  const t = ar ? {
    title: "عروض الموردين للمنتجات الموحدة",
    importTitle: "استيراد بيانات منتج من مصدر موثوق", importHelp: "الصق بيانات منتج حصلت عليها من واجهة المورد الرسمية أو ملف كتالوج مصرح به. ستدخل المنتجات للمراجعة فقط.", provider: "نوع المصدر", shopify: "Shopify", feed: "كتالوج مورد", importSupplier: "اسم المورد", importUrl: "رابط المنتج الأصلي HTTPS", payload: "بيانات المنتج بصيغة JSON", importRun: "استيراد للمراجعة", importing: "جارٍ الاستيراد...", imported: "عدد المنتجات التي أضيفت للمراجعة", importRights: "الصور لا تُنسخ ولا تُنشر تلقائياً؛ يجب مراجعة حقوق استخدامها والتحقق من المورد والتوفر والشحن.", pricingTitle: "معاينة سعر البيع", pricingHelp: "اختر عرض مورد معتمداً. تُؤخذ تكلفة المورد والشحن من بيانات العرض الموثق تلقائياً، ثم أضف تكاليف الوجهة وهامش WASLA. عند اختلاف العملة، أدخل سعر صرف موثقاً: عدد وحدات عملة العميل مقابل وحدة واحدة من العملة الأصلية.", supplierCostLabel: "تكلفة المورد", shippingCostLabel: "تكلفة الشحن", displayCurrencyLabel: "عملة سعر العميل", destinationCountryLabel: "دولة العميل (رمز ISO مثل TR أو US)", pricingOfferLabel: "عرض المورد المعتمد", choosePricingOffer: "اختر عرضاً معتمداً يشحن إلى الوجهة", marginLabel: "زيادة السعر على التكلفة % (Markup)", fixedMarginLabel: "زيادة ثابتة بعملة العميل", grossMarginLabel: "هامش الربح من سعر البيع %", extraCostLabel: "تكلفة إضافية موثقة (اختياري)", extraCostType: "نوع التكلفة", calculate: "احسب السعر", calculating: "جارٍ الحساب...", costSubtotalLabel: "إجمالي التكلفة", marginTotalLabel: "هامش WASLA", finalPriceLabel: "السعر المقترح للعميل", approvePrice: "اعتماد السعر لهذه الدولة", approvingPrice: "جارٍ اعتماد السعر...", priceApproved: "تم اعتماد السعر لهذه الدولة. لم يتم نشر المنتج بعد.", pricingWarning: "هذا حساب تجريبي للمالك فقط. أدخل الضرائب والجمارك والرسوم الفعلية كبنود منفصلة؛ لا نفترض قيماً لها. لا تستخدم سعر صرف تقديرياً.", fxRateLabel: "سعر الصرف (عملة العميل لكل 1 من العملة الأصلية)", fxDateLabel: "تاريخ ووقت سعر الصرف", fxSourceLabel: "مصدر سعر الصرف (رابط أو مرجع)", supplierProof: "رابط إثبات هوية المورد HTTPS", specificationProof: "رابط إثبات مواصفات المنتج HTTPS",
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
    importTitle: "Import product data from an authorized source", importHelp: "Paste product data obtained from the merchant’s official API or an authorized catalog feed. Imported records enter review only.", provider: "Source type", shopify: "Shopify", feed: "Merchant feed", importSupplier: "Supplier name", importUrl: "Original HTTPS product URL", payload: "Product data (JSON)", importRun: "Import for review", importing: "Importing...", imported: "Products added to review", importRights: "Images are not copied or published automatically. Image rights, supplier identity, availability and shipping must be verified.", pricingTitle: "Customer price preview", pricingHelp: "Select an approved supplier offer. Supplier and shipping costs are loaded from the verified offer; then add destination costs and the WASLA margin. When currencies differ, provide a documented FX rate: customer-currency units per one source-currency unit.", supplierCostLabel: "Supplier cost", shippingCostLabel: "Shipping cost", displayCurrencyLabel: "Customer price currency", destinationCountryLabel: "Customer destination country (ISO code, e.g. TR or US)", pricingOfferLabel: "Approved supplier offer", choosePricingOffer: "Choose an approved offer that ships to this destination", marginLabel: "Markup on landed cost %", fixedMarginLabel: "Fixed markup in customer currency", grossMarginLabel: "Gross margin as % of sale price", extraCostLabel: "Verified additional cost (optional)", extraCostType: "Cost type", calculate: "Calculate price", calculating: "Calculating...", costSubtotalLabel: "Total cost", marginTotalLabel: "WASLA margin", finalPriceLabel: "Suggested customer price", approvePrice: "Approve price for this destination", approvingPrice: "Approving price...", priceApproved: "Price approved for this destination. The product has not been published.", pricingWarning: "Owner-only preview. Add actual taxes, customs and fees as separate line items; no values are assumed. Never use an estimated FX rate.", fxRateLabel: "FX rate (customer currency per 1 source-currency unit)", fxDateLabel: "FX rate date and time", fxSourceLabel: "FX rate source (URL or reference)", supplierProof: "Supplier identity evidence URL HTTPS", specificationProof: "Exact product specification evidence URL HTTPS",
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
    const [p, o, c, s] = await Promise.all([
      fetch("/api/platform/official-store/products", { credentials: "include", cache: "no-store" }),
      fetch("/api/platform/official-store/source-offers", { credentials: "include", cache: "no-store" }),
      fetch("/api/platform/official-store/candidates/enrich", { credentials: "include", cache: "no-store" }),
      fetch("/api/platform/official-store/data-sources", { credentials: "include", cache: "no-store" }),
    ]);
    const pd = await p.json(); const od = await o.json(); const cd = await c.json(); const sd = await s.json();
    if (!p.ok || !pd.success || !o.ok || !od.success || !c.ok || !cd.success || !s.ok || !sd.success) throw new Error("load");
    setRegisteredSources(Array.isArray(sd.sources) ? sd.sources : []);
    setProducts(Array.isArray(pd.products) ? pd.products : []);
    setOffers(Array.isArray(od.offers) ? od.offers : []);
    const candidates = Array.isArray(cd.candidates) ? cd.candidates : [];
    setImportResult(candidates.length ? { importedCount: candidates.length, candidates: candidates.map((item: any) => ({ id: item.id, proposed_title: item.proposed_title || "", supplier_name: item.supplier_name, proposed_price: item.proposed_price, currency: item.currency, source_platform: item.source_platform, source_product_url: item.source_product_url, review_status: item.review_status, verification_status: item.verification_status, supplier_identity_verified: item.supplier_identity_verified, specifications_verified: item.specifications_verified, supplier_dropship_confirmed: item.supplier_dropship_confirmed, minimum_order_quantity: item.minimum_order_quantity })) } : null);
    setEnrichmentResults(Object.fromEntries(candidates.filter((item: any) => item.enrichment).map((item: any) => [item.id, item.enrichment])));
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
        body: JSON.stringify({ provider: importForm.provider, dataSourceId: importForm.dataSourceId || null, supplierName: importForm.supplierName.trim(), productUrl: importForm.productUrl.trim(), supplierEvidenceUrl: importForm.supplierEvidenceUrl.trim() || null, specificationEvidenceUrl: importForm.specificationEvidenceUrl.trim() || null, payload }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("import");
      setImportResult({ importedCount: Number(data.importedCount || 0), candidates: Array.isArray(data.candidates) ? data.candidates : [] });
      setNotice(ar ? "تم استيراد البيانات إلى قائمة المراجعة فقط." : "Data imported into the review queue only.");
    } catch { setError(ar ? "تعذر الاستيراد. تحقق من رابط HTTPS وصيغة JSON وبيانات المصدر." : "Import failed. Check the HTTPS URL, JSON format and source data."); }
    finally { setImporting(false); }
  }

  async function enrichCandidate(candidateId: string) {
    setEnrichmentBusyId(candidateId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/platform/official-store/candidates/enrich", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.enrichment) throw new Error("enrich");
      setEnrichmentResults(current => ({ ...current, [candidateId]: data.enrichment }));
      setNotice(ar ? "تم تحليل بيانات المنتج وحفظ النتيجة للمراجعة." : "Product data analyzed and saved for review.");
    } catch { setError(ar ? "تعذر تحليل المنتج. تأكد من نشر الخدمة وصلاحيات الحساب." : "Could not analyze this product. Check deployment and account permissions."); }
    finally { setEnrichmentBusyId(""); }
  }

  async function reviewCandidate(candidateId: string, decision: "request_evidence" | "reject") {
    setCandidateReviewBusyId(candidateId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/platform/official-store/candidates/enrich", {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, decision }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("review");
      setImportResult(current => current ? { ...current, candidates: current.candidates.map(item =>
        item.id === candidateId ? { ...item, review_status: data.candidate.review_status } : item) } : current);
      setNotice(decision === "reject"
        ? (ar ? "تم رفض المرشح. لم يُنشر أي منتج." : "Candidate rejected. No product was published.")
        : (ar ? "أُعيد المرشح لاستكمال الأدلة." : "Candidate returned for additional evidence."));
    } catch { setError(ar ? "تعذرت مراجعة المرشح." : "Could not save the candidate review."); }
    finally { setCandidateReviewBusyId(""); }
  }

  async function calculatePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPricingBusy(true); setPricingResult(null); setError("");
    try {
      const targetCurrency = pricingForm.displayCurrency.trim().toUpperCase();
      const supplierCurrency = pricingForm.supplierCurrency.trim().toUpperCase();
      const shippingCurrency = pricingForm.shippingCurrency.trim().toUpperCase();
      const costs = pricingCosts.filter(line => line.amount.trim()).map(line => {
        const currency = line.currency.trim().toUpperCase();
        return {
          type: line.type, amount: Number(line.amount), currency,
          ...(currency !== targetCurrency ? {
            fxRate: Number(line.fxRate),
            fxRateAsOf: line.fxRateAsOf ? new Date(line.fxRateAsOf).toISOString() : "",
            fxSource: line.fxSource.trim(),
          } : {}),
        };
      });
      const body = {
        productId: offers.find(offer => offer.id === pricingOfferId)?.product_id,
        offerId: pricingOfferId,
        supplierCost: Number(pricingForm.supplierCost), supplierCurrency,
        ...(supplierCurrency !== targetCurrency ? {
          supplierFxRate: Number(pricingForm.supplierFxRate),
          supplierFxRateAsOf: pricingForm.supplierFxRateAsOf ? new Date(pricingForm.supplierFxRateAsOf).toISOString() : "",
          supplierFxSource: pricingForm.supplierFxSource.trim(),
        } : {}),
        shippingCost: Number(pricingForm.shippingCost), shippingCurrency,
        ...(shippingCurrency !== targetCurrency ? {
          shippingFxRate: Number(pricingForm.shippingFxRate),
          shippingFxRateAsOf: pricingForm.shippingFxRateAsOf ? new Date(pricingForm.shippingFxRateAsOf).toISOString() : "",
          shippingFxSource: pricingForm.shippingFxSource.trim(),
        } : {}),
        displayCurrency: targetCurrency, destinationCountry: pricingForm.destinationCountry.trim().toUpperCase(), marginPercent: Number(pricingForm.marginPercent),
        fixedMargin: Number(pricingForm.fixedMargin), costs,
      };
      const response = await fetch("/api/platform/official-store/pricing/preview", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok || !data.success || !data.previewOnly) throw new Error("pricing");
      setPricingResult(data);
    } catch { setError(ar ? "تعذر الحساب. عند اختلاف العملات، أدخل سعر الصرف وتاريخه ومصدره لكل تكلفة مختلفة العملة." : "Calculation failed. For each cost in a different currency, provide its FX rate, timestamp and source."); }
    finally { setPricingBusy(false); }
  }

  async function approvePrice() {
    if (!pricingResult?.previewId) return;
    setPricingApprovalBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/platform/official-store/pricing/approve", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewId: pricingResult.previewId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.approval) throw new Error("approval");
      setNotice(t.priceApproved);
      setPricingResult(null);
    } catch {
      setError(ar ? "تعذر اعتماد السعر. ربما انتهت صلاحية المعاينة أو تغير عرض المورد؛ أعد الحساب." : "Could not approve the price. The preview may have expired or the supplier offer may have changed; recalculate.");
    } finally { setPricingApprovalBusy(false); }
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
          ...(sourcingCandidateId ? { sourcingCandidateId } : {}),
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
      setForm({ ...initial }); setSourcingCandidateId(""); setNotice(t.saved); await load();
    } catch { setError(t.error); }
    finally { setSaving(false); }
  }

  async function review(offer: Offer) {
    const confirmed = window.confirm(ar
      ? "قبل الاعتماد: هل فتحت أدلة المورد والمواصفات وتحققت بنفسك من أنها تخص المنتج والنسخة المحددة؟ وهل تأكدت من هوية المورد، والسعر الساري، والتوفر، والحد الأدنى للطلب (قطعة واحدة أو أقل)، والشحن المباشر للعميل؟ بالضغط على موافق ستسجل WASLA هذه التأكيدات باسم حسابك."
      : "Before approval: have you opened and checked the supplier and specification evidence and confirmed they match the exact product and variant? Have you verified supplier identity, current price, availability, MOQ (one unit or less), and direct-to-customer shipping? Confirming records these attestations under your account.");
    if (!confirmed) return;
    setBusyId(offer.id); setError(""); setNotice("");
    try {
      const headers = { "Content-Type": "application/json" };
      const verificationResponse = await fetch(`/api/platform/official-store/source-offers/${offer.id}`, {
        method: "PATCH", credentials: "include", headers,
        body: JSON.stringify({
          supplierIdentityVerified: true, specificationsVerified: true,
          directToCustomerConfirmed: true,
        }),
      });
      const verificationData = await verificationResponse.json();
      if (!verificationResponse.ok || !verificationData.success) throw new Error("verification");
      const approvalResponse = await fetch(`/api/platform/official-store/source-offers/${offer.id}`, {
        method: "PATCH", credentials: "include", headers,
        body: JSON.stringify({ offerStatus: "approved" }),
      });
      const approvalData = await approvalResponse.json();
      if (!approvalResponse.ok || !approvalData.success) throw new Error("approval");
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
    <Link href="/owner/official-store/opportunities" style={{ display: "inline-block", marginTop: 10, padding: "10px 14px", border: "1px solid #b89a5a", borderRadius: 10, color: "#9b762c", fontWeight: 700, textDecoration: "none" }}>{ar ? "تقييم فرص المنتجات والربح" : "Assess product opportunities"}</Link>
    <section style={{ padding: 18, border: "1px solid #d8dce5", borderRadius: 16, marginTop: 22 }}>
    <section style={{ padding: 18, border: "1px solid #d8dce5", borderRadius: 16, marginTop: 22 }}>
      <h2 style={{ fontSize: 19, marginTop: 0 }}>{t.importTitle}</h2>
      <p style={{ fontSize: 13, opacity: .75 }}>{t.importHelp}</p>
      <form onSubmit={importCandidates} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <label style={labelStyle}>{t.provider}<select value={importForm.provider} onChange={e => setImportForm(s => ({ ...s, provider: e.target.value }))} style={inputStyle}><option value="shopify">{t.shopify}</option><option value="merchant_feed">{t.feed}</option></select></label>
          <label style={labelStyle}>{ar ? "مصدر البيانات المعتمد (اختياري)" : "Approved registered data source (optional)"}<select value={importForm.dataSourceId} onChange={e => setImportForm(s => ({ ...s, dataSourceId: e.target.value }))} style={inputStyle}><option value="">{ar ? "استيراد يدوي بدون ربط بسجل مصدر" : "Manual import without registry link"}</option>{registeredSources.filter(source => source.permission_status === "approved" && source.provider.toLowerCase() === importForm.provider.toLowerCase()).map(source => <option key={source.id} value={source.id}>{source.name} · {source.provider}</option>)}</select></label>
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
        {importResult.candidates.map(item => <div key={item.id} style={{ margin: "10px 0", padding: 10, background: "white", border: "1px solid #e5e7eb", borderRadius: 9 }}>
          <strong>{item.proposed_title}</strong>
          <p style={{ fontSize: 12, opacity: .75 }}>{item.supplier_name || ""}{item.source_platform ? ` · ${item.source_platform}` : ""}{item.proposed_price ? ` · ${item.proposed_price} ${item.currency || ""}` : ""}</p>
          <p style={{ fontSize: 12, fontWeight: 700 }}>{ar ? "حالة المراجعة:" : "Review status:"} {item.review_status || "needs_owner_review"} · {ar ? "التحقق:" : "Verification:"} {item.verification_status || "unverified"}</p>
          {item.source_product_url && <a href={item.source_product_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#9b762c" }}>{ar ? "فتح صفحة المنتج الأصلية" : "Open original product listing"}</a>}
          {item.review_status === "approved" && item.verification_status === "verified" && item.supplier_identity_verified === true && item.specifications_verified === true && item.supplier_dropship_confirmed === true && item.minimum_order_quantity === 1 && <button type="button" onClick={() => {
            setSourcingCandidateId(item.id);
            const sourceEvidence = enrichmentResults[item.id]?.sourceEvidence ?? [];
            const supplierProof = sourceEvidence.find(entry => entry.type === "supplier_evidence_url" && entry.url)?.url ?? "";
            const specificationProof = sourceEvidence.find(entry => entry.type === "product_specification" && entry.url)?.url ?? "";
            setForm(current => ({
              ...current,
              supplierName: item.supplier_name || "",
              sourcePlatform: item.source_platform || "",
              sourceProductUrl: item.source_product_url || "",
              supplierPrice: item.proposed_price || "",
              supplierCurrency: item.currency || "USD",
              evidenceUrl: supplierProof,
              specificationEvidenceUrl: specificationProof,
            }));
            document.getElementById("source-offer-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }} style={{ display: "block", marginTop: 8, padding: "8px 11px", border: "1px solid #b18a3c", borderRadius: 8, background: "white", color: "#72551f", fontWeight: 700 }}>{ar ? "ربط بعرض مورد" : "Link to supplier offer"}</button>}
          <button type="button" disabled={enrichmentBusyId === item.id} onClick={() => void enrichCandidate(item.id)} style={{ display: "block", marginTop: 8, padding: "8px 11px", border: 0, borderRadius: 8, background: "#27344d", color: "white", fontWeight: 700 }}>
            {enrichmentBusyId === item.id ? (ar ? "جارٍ تحليل المنتج..." : "Analyzing product...") : (ar ? "حلّل وصنّف المنتج" : "Analyze and classify product")}
          </button>
          {enrichmentResults[item.id] && <div style={{ marginTop: 10, fontSize: 13 }}>
            <p><strong>{ar ? "التصنيف:" : "Category:"}</strong> {enrichmentResults[item.id].category} · {Math.round(enrichmentResults[item.id].classificationConfidence * 100)}%</p>
            <p><strong>{ar ? "المواصفات المستخرجة من المصدر (غير مؤكدة):" : "Extracted source claims (unverified):"}</strong> {Object.keys(enrichmentResults[item.id].facts).length ? Object.entries(enrichmentResults[item.id].facts).map(([k,v]) => `${k}: ${v}`).join(" · ") : (ar ? "لم تُستخرج مواصفات مؤكدة من النص." : "No attributes could be extracted from the text.")}</p>
            <p><strong>{ar ? "حقول تحتاج مراجعة:" : "Fields needing review:"}</strong> {enrichmentResults[item.id].missingRequiredReviewFields.join(", ") || (ar ? "لا توجد حقول ناقصة في قائمة الفحص الأولية." : "No missing fields in the initial checklist.")}</p>
            {!!enrichmentResults[item.id].sourceEvidence?.length && <div><strong>{ar ? "أدلة المصدر المستوردة:" : "Imported source evidence:"}</strong><ul>{enrichmentResults[item.id].sourceEvidence!.map((entry,i) => <li key={`${entry.type}-${i}`}>{entry.type}{entry.value ? `: ${entry.value}` : ""}{entry.url ? <> · <a href={entry.url} target="_blank" rel="noreferrer">{ar ? "فتح المصدر" : "Open source"}</a></> : ""} · {entry.type === "image_reference" ? (ar ? "حقوق الصورة غير مراجعة" : "Image rights unreviewed") : (ar ? "غير متحقق" : "Unverified")}</li>)}</ul></div>}
            <ul>{enrichmentResults[item.id].warnings.map((warning,i) => <li key={i}>{warning}</li>)}</ul>
          </div>}
          {item.review_status !== "rejected" && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <button type="button" disabled={candidateReviewBusyId === item.id} onClick={() => void reviewCandidate(item.id, "request_evidence")} style={{ padding: "8px 10px", border: "1px solid #b18a3c", borderRadius: 8, background: "white", color: "#72551f" }}>{candidateReviewBusyId === item.id ? "..." : (ar ? "إعادة لاستكمال الأدلة" : "Return for more evidence")}</button>
            <button type="button" disabled={candidateReviewBusyId === item.id} onClick={() => { if (window.confirm(ar ? "هل تريد رفض هذا المرشح؟" : "Reject this candidate?")) void reviewCandidate(item.id, "reject"); }} style={{ padding: "8px 10px", border: "1px solid #b42318", borderRadius: 8, background: "white", color: "#b42318" }}>{ar ? "رفض المرشح" : "Reject candidate"}</button>
          </div>}
        </div>)}
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
    <section id="source-offer-form" style={{ padding: 18, border: "1px solid #d8dce5", borderRadius: 16, marginTop: 22 }}>
      <h2 style={{ fontSize: 19, marginTop: 0 }}>{t.add}</h2>
      {sourcingCandidateId && <p role="status" style={{ padding: 10, background: "#f6f4ee", borderRadius: 9, fontSize: 13 }}>{ar ? "العرض مرتبط بمرشح مستورد. يجب أن تطابق بيانات المورد والسعر والرابط بيانات المرشح." : "This offer is linked to an imported candidate. Supplier, price and source URL must match the candidate."} <button type="button" onClick={() => setSourcingCandidateId("")} style={{ marginInlineStart: 8 }}>{ar ? "إلغاء الربط" : "Unlink"}</button></p>}
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
        <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>{t.pricingOfferLabel}<select required value={pricingOfferId} onChange={e => {
          const selected = offers.find(offer => offer.id === e.target.value);
          setPricingOfferId(e.target.value);
          if (selected) setPricingForm(s => ({ ...s, supplierCost: selected.supplier_price, supplierCurrency: selected.supplier_currency, shippingCost: selected.shipping_cost || "", shippingCurrency: selected.shipping_currency || s.shippingCurrency }));
          setPricingResult(null);
        }} style={inputStyle}>
          <option value="">{t.choosePricingOffer}</option>
          {offers.filter(offer => offer.offer_status === "approved" && ["available", "limited"].includes(offer.availability_status) && offer.minimum_order_quantity === 1 && offer.direct_to_customer_confirmed && offer.supplier_identity_verified && offer.specifications_verified && offer.shipping_cost !== null && Boolean(offer.last_verified_at) && Boolean(offer.quote_valid_until && Date.parse(offer.quote_valid_until) > Date.now()) && (pricingForm.destinationCountry.trim().length !== 2 || (offer.ships_to_countries || []).includes(pricingForm.destinationCountry.trim().toUpperCase()))).map(offer => <option key={offer.id} value={offer.id}>{offer.title_en} — {offer.supplier_name} ({offer.supplier_price} {offer.supplier_currency})</option>)}
        </select></label>
        <label style={labelStyle}>{t.supplierCostLabel}<input required readOnly type="number" min="0" step="0.01" value={pricingForm.supplierCost} style={inputStyle}/></label>
        <label style={labelStyle}>{t.currency}<input required readOnly maxLength={3} value={pricingForm.supplierCurrency} style={inputStyle}/></label>
        {pricingForm.supplierCurrency.trim().toUpperCase() !== pricingForm.displayCurrency.trim().toUpperCase() && <>
          <label style={labelStyle}>{t.fxRateLabel}<input required type="number" min="0.000000001" step="any" value={pricingForm.supplierFxRate} onChange={e => setPricingForm(s => ({ ...s, supplierFxRate: e.target.value }))} style={inputStyle}/></label>
          <label style={labelStyle}>{t.fxDateLabel}<input required type="datetime-local" value={pricingForm.supplierFxRateAsOf} onChange={e => setPricingForm(s => ({ ...s, supplierFxRateAsOf: e.target.value }))} style={inputStyle}/></label>
          <label style={labelStyle}>{t.fxSourceLabel}<input required value={pricingForm.supplierFxSource} onChange={e => setPricingForm(s => ({ ...s, supplierFxSource: e.target.value }))} style={inputStyle}/></label>
        </>}
        <label style={labelStyle}>{t.shippingCostLabel}<input required readOnly type="number" min="0" step="0.01" value={pricingForm.shippingCost} style={inputStyle}/></label>
        <label style={labelStyle}>{t.shippingCurrency}<input required readOnly maxLength={3} value={pricingForm.shippingCurrency} style={inputStyle}/></label>
        {pricingForm.shippingCurrency.trim().toUpperCase() !== pricingForm.displayCurrency.trim().toUpperCase() && <>
          <label style={labelStyle}>{t.fxRateLabel}<input required type="number" min="0.000000001" step="any" value={pricingForm.shippingFxRate} onChange={e => setPricingForm(s => ({ ...s, shippingFxRate: e.target.value }))} style={inputStyle}/></label>
          <label style={labelStyle}>{t.fxDateLabel}<input required type="datetime-local" value={pricingForm.shippingFxRateAsOf} onChange={e => setPricingForm(s => ({ ...s, shippingFxRateAsOf: e.target.value }))} style={inputStyle}/></label>
          <label style={labelStyle}>{t.fxSourceLabel}<input required value={pricingForm.shippingFxSource} onChange={e => setPricingForm(s => ({ ...s, shippingFxSource: e.target.value }))} style={inputStyle}/></label>
        </>}
        <label style={labelStyle}>{t.destinationCountryLabel}<input required maxLength={2} pattern="[A-Za-z]{2}" value={pricingForm.destinationCountry} onChange={e => { setPricingForm(s => ({ ...s, destinationCountry: e.target.value.toUpperCase() })); setPricingOfferId(""); setPricingResult(null); }} placeholder="TR" style={inputStyle}/></label>
        <label style={labelStyle}>{t.displayCurrencyLabel}<input required maxLength={3} value={pricingForm.displayCurrency} onChange={e => setPricingForm(s => ({ ...s, displayCurrency: e.target.value }))} style={inputStyle}/></label>
        <label style={labelStyle}>{t.marginLabel}<input required type="number" min="0" max="500" step="0.1" value={pricingForm.marginPercent} onChange={e => setPricingForm(s => ({ ...s, marginPercent: e.target.value }))} style={inputStyle}/></label>
        <label style={labelStyle}>{t.fixedMarginLabel}<input required type="number" min="0" step="0.01" value={pricingForm.fixedMargin} onChange={e => setPricingForm(s => ({ ...s, fixedMargin: e.target.value }))} style={inputStyle}/></label>
        {pricingCosts.map((line, index) => <div key={line.id} style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, padding: 12, border: "1px solid #e2e5eb", borderRadius: 10 }}>
          <label style={labelStyle}>{t.extraCostLabel} #{index + 1}<input type="number" min="0" step="0.01" value={line.amount} onChange={e => setPricingCosts(rows => rows.map(item => item.id === line.id ? { ...item, amount: e.target.value } : item))} style={inputStyle}/></label>
          <label style={labelStyle}>{t.extraCostType}<select value={line.type} onChange={e => setPricingCosts(rows => rows.map(item => item.id === line.id ? { ...item, type: e.target.value } : item))} style={inputStyle}><option value="payment_fee">payment_fee</option><option value="tax">tax</option><option value="customs">customs</option><option value="other_cost">other_cost</option></select></label>
          <label style={labelStyle}>{t.currency}<input maxLength={3} value={line.currency} onChange={e => setPricingCosts(rows => rows.map(item => item.id === line.id ? { ...item, currency: e.target.value } : item))} style={inputStyle}/></label>
          {line.amount.trim() && line.currency.trim().toUpperCase() !== pricingForm.displayCurrency.trim().toUpperCase() && <>
            <label style={labelStyle}>{t.fxRateLabel}<input required type="number" min="0.000000001" step="any" value={line.fxRate} onChange={e => setPricingCosts(rows => rows.map(item => item.id === line.id ? { ...item, fxRate: e.target.value } : item))} style={inputStyle}/></label>
            <label style={labelStyle}>{t.fxDateLabel}<input required type="datetime-local" value={line.fxRateAsOf} onChange={e => setPricingCosts(rows => rows.map(item => item.id === line.id ? { ...item, fxRateAsOf: e.target.value } : item))} style={inputStyle}/></label>
            <label style={labelStyle}>{t.fxSourceLabel}<input required value={line.fxSource} onChange={e => setPricingCosts(rows => rows.map(item => item.id === line.id ? { ...item, fxSource: e.target.value } : item))} style={inputStyle}/></label>
          </>}
          <button type="button" disabled={pricingCosts.length === 1} onClick={() => setPricingCosts(rows => rows.filter(item => item.id !== line.id))} style={{ justifySelf: "start", border: "1px solid #b42318", color: "#b42318", background: "white", borderRadius: 8, padding: "7px 10px" }}>{ar ? "حذف البند" : "Remove cost"}</button>
        </div>)}
        <button type="button" disabled={pricingCosts.length >= 20} onClick={() => setPricingCosts(rows => [...rows, { id: `cost-${Date.now()}`, type: "other_cost", amount: "", currency: pricingForm.displayCurrency.toUpperCase(), fxRate: "", fxRateAsOf: "", fxSource: "" }])} style={{ justifySelf: "start", border: "1px solid #b18a3c", color: "#7d602d", background: "white", borderRadius: 8, padding: "8px 12px" }}>{ar ? "إضافة تكلفة أخرى" : "Add another cost"} ({pricingCosts.length}/20)</button>
        <button disabled={pricingBusy} type="submit" style={{ padding: "11px 15px", border: 0, borderRadius: 10, background: "#27344d", color: "white", fontWeight: 700 }}>{pricingBusy ? t.calculating : t.calculate}</button>
      </form>
      <p style={{ fontSize: 12, opacity: .75 }}>{t.pricingWarning}</p>
      {pricingResult && <div role="status" style={{ marginTop: 12, padding: 14, background: "#f6f4ee", borderRadius: 10 }}>
        <p>{t.costSubtotalLabel}: <strong>{pricingResult.breakdown.costSubtotal.toFixed(2)} {pricingResult.currency}</strong></p>
        <p>{t.marginTotalLabel}: <strong>{pricingResult.breakdown.margin.total.toFixed(2)} {pricingResult.currency}</strong></p>
        <p>{t.grossMarginLabel}: <strong>{pricingResult.breakdown.grossMarginPercent.toFixed(2)}%</strong></p>
        <p>{t.finalPriceLabel}: <strong>{pricingResult.breakdown.finalCustomerPrice.toFixed(2)} {pricingResult.currency}</strong></p>
        <p>{ar ? "الدولة:" : "Destination:"} <strong>{pricingResult.destinationCountry}</strong></p>
        {pricingResult.warnings.map((warning, index) => <p key={index} style={{ fontSize: 12, opacity: .75 }}>{warning}</p>)}
        <button type="button" disabled={pricingApprovalBusy} onClick={approvePrice} style={{ marginTop: 8, padding: "10px 14px", border: 0, borderRadius: 9, background: "#27344d", color: "white", fontWeight: 700 }}>{pricingApprovalBusy ? t.approvingPrice : t.approvePrice}</button>
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
