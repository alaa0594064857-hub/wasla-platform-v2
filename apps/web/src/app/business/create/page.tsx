"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Locale = "ar" | "en";
type AccountType = "company" | "supplier" | "manufacturer" | "trader" | "brand";

const labels = {
  ar: {
    brand: "وصلة",
    title: "إنشاء حساب تجاري",
    subtitle: "أنشئ هوية نشاطك التجاري واربطها بحسابك الشخصي.",
    home: "الرئيسية",
    back: "العودة إلى إدارة الأعمال",
    type: "نوع الحساب التجاري",
    company: "شركة",
    supplier: "مورد",
    manufacturer: "مصنع",
    trader: "تاجر",
    brandType: "علامة تجارية / متجر",
    legalName: "الاسم القانوني للنشاط",
    displayName: "الاسم الظاهر للعملاء",
    country: "رمز الدولة (اختياري - حرفان)",
    description: "نبذة عن النشاط (اختياري)",
    website: "الموقع الإلكتروني (اختياري)",
    submit: "إنشاء الحساب التجاري",
    saving: "جارٍ الإنشاء...",
    error: "تعذر إنشاء الحساب. تحقق من البيانات وحاول مرة أخرى.",
    required: "يرجى إدخال الاسمين القانوني والظاهر بشكل صحيح.",
  },
  en: {
    brand: "WASLA",
    title: "Create a business account",
    subtitle: "Create your business identity and link it to your personal account.",
    home: "Home",
    back: "Back to business management",
    type: "Business account type",
    company: "Company",
    supplier: "Supplier",
    manufacturer: "Factory / Manufacturer",
    trader: "Trader",
    brandType: "Brand / Store",
    legalName: "Legal business name",
    displayName: "Public display name",
    country: "Country code (optional - 2 letters)",
    description: "Business description (optional)",
    website: "Website (optional)",
    submit: "Create business account",
    saving: "Creating...",
    error: "Could not create the account. Check the details and try again.",
    required: "Enter valid legal and display names.",
  },
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function CreateBusinessAccountPage() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ar");
  const [accountType, setAccountType] = useState<AccountType>("company");
  const [legalName, setLegalName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const t = labels[locale];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (legalName.trim().length < 2 || displayName.trim().length < 2) {
      setError(t.required);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/accounts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType,
          legalName: legalName.trim(),
          displayName: displayName.trim(),
          countryCode: countryCode.trim() || undefined,
          description: description.trim() || undefined,
          website: website.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) {
        throw new Error("Business account creation failed");
      }
      router.replace("/business");
      router.refresh();
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="business-page" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <header className="business-header">
        <Link href="/" className="business-brand">
          <span className="business-logo">W</span>
          <span>{t.brand}</span>
        </Link>
        <div className="business-header-actions">
          <Link href="/" className="business-home">{t.home}</Link>
          <button type="button" className="business-language" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>
            {locale === "ar" ? "English" : "العربية"}
          </button>
        </div>
      </header>

      <section className="business-container">
        <div className="business-heading">
          <div>
            <span className="business-eyebrow">WASLA BUSINESS</span>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
        </div>

        {error && <div className="business-alert business-alert-error" role="alert">{error}</div>}

        <form className="business-invite-form" onSubmit={submit}>
          <label>
            <span>{t.type}</span>
            <select value={accountType} onChange={(event) => setAccountType(event.target.value as AccountType)}>
              <option value="company">{t.company}</option>
              <option value="supplier">{t.supplier}</option>
              <option value="manufacturer">{t.manufacturer}</option>
              <option value="trader">{t.trader}</option>
              <option value="brand">{t.brandType}</option>
            </select>
          </label>

          <label>
            <span>{t.legalName}</span>
            <input value={legalName} onChange={(event) => setLegalName(event.target.value)} minLength={2} maxLength={255} required />
          </label>

          <label>
            <span>{t.displayName}</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={255} required />
          </label>

          <label>
            <span>{t.country}</span>
            <input value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} maxLength={2} />
          </label>

          <label>
            <span>{t.description}</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={4} />
          </label>

          <label>
            <span>{t.website}</span>
            <input type="url" value={website} onChange={(event) => setWebsite(event.target.value)} maxLength={2048} placeholder="https://" />
          </label>

          <button type="submit" disabled={loading} className="business-invite-button">
            {loading ? t.saving : t.submit}
            <span>↗</span>
          </button>
        </form>

        <p><Link href="/business" className="business-primary-link">{t.back}</Link></p>
        <footer className="business-footer">WASLA · A global platform for commerce and business</footer>
      </section>
    </main>
  );
}
