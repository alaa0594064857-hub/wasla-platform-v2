"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../../../components/locale-provider";

type Product = { id: string; title_ar: string; title_en: string };
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
  supplierPrice: "", supplierCurrency: "USD", shippingCost: "",
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

  const t = ar ? {
    title: "عروض الموردين للمنتجات الموحدة",
    subtitle: "اربط عدة عروض توريد بالمنتج نفسه، مع الاحتفاظ بسعر وشحن ومصدر كل مورد بشكل مستقل.",
    back: "العودة إلى متجر WASLA", add: "إضافة عرض توريد", product: "منتج WASLA",
    supplier: "اسم المورد", platform: "الموقع أو المنصة", url: "رابط المنتج الأصلي HTTPS",
    availability: "حالة التوفر بعد التأكد", available: "متوفر", limited: "توفر محدود", needsConfirmation: "بانتظار التأكيد", unavailable: "غير متوفر",
    price: "سعر المورد", currency: "عملة المورد", shipping: "تكلفة الشحن",
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
    approve: "اعتماد العرض", needs: "بانتظار المراجعة", available: "متوفر",
    note: "لا يؤدي تسجيل العرض إلى نشر المنتج أو شراءه. لا يُعتمد العرض إلا بعد توثيق الهوية والمواصفات والسعر والشحن وتأكيد التوفر.",
  } : {
    title: "Supplier offers for unified products",
    subtitle: "Link multiple supplier offers to one WASLA product while keeping each source, price and shipping terms separate.",
    back: "Back to official WASLA Store", add: "Add supplier offer", product: "WASLA product",
    supplier: "Supplier name", platform: "Source site or marketplace", url: "Original product URL HTTPS",
    availability: "Verified availability", available: "Available", limited: "Limited", needsConfirmation: "Needs confirmation", unavailable: "Unavailable",
    price: "Supplier price", currency: "Supplier currency", shipping: "Shipping cost",
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
    approve: "Approve offer", needs: "Needs review", available: "Available",
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
      <h2 style={{ fontSize: 19, marginTop: 0 }}>{t.add}</h2>
      <form onSubmit={save} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 13 }}>
        <label style={labelStyle}>{t.product}<select required value={form.productId} onChange={e => update("productId", e.target.value)} style={inputStyle}>
          <option value="">{ar ? "اختر المنتج" : "Select product"}</option>
          {products.map(p => <option key={p.id} value={p.id}>{ar ? p.title_ar : p.title_en}</option>)}
        </select></label>
        <label style={labelStyle}>{t.supplier}<input required value={form.supplierName} onChange={e => update("supplierName", e.target.value)} style={inputStyle}/></label>
        <label style={labelStyle}>{t.platform}<input required value={form.sourcePlatform} onChange={e => update("sourcePlatform", e.target.value)} style={inputStyle}/></label>
        <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>{t.url}<input required type="url" value={form.sourceProductUrl} onChange={e => update("sourceProductUrl", e.target.value)} style={inputStyle}/></label>
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
