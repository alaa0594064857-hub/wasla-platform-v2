"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import WorkspaceHeader from "../../../components/workspace-header";

type BusinessAccount = {
  id: string; legal_name: string; display_name: string; country_code: string | null;
  description: string | null; website: string | null; contact_information: Record<string, string> | null;
  verification_status: string | null; role: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function BusinessAccountDetailsPage() {
  const { locale } = useLocale();
  const params = useParams<{ accountId: string }>();
  const ar = locale === "ar";
  const [account, setAccount] = useState<BusinessAccount | null>(null);
  const [legalName, setLegalName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/accounts/${encodeURIComponent(params.accountId)}`, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error ?? "Could not load business account");
      const item = data.account as BusinessAccount;
      setAccount(item);
      setLegalName(item.legal_name ?? "");
      setDisplayName(item.display_name ?? "");
      setCountryCode(item.country_code ?? "");
      setDescription(item.description ?? "");
      setWebsite(item.website ?? "");
      const contact = item.contact_information ?? {};
      setEmail(contact.email ?? "");
      setPhone(contact.phone ?? "");
      setWhatsapp(contact.whatsapp ?? "");
      setAddress(contact.address ?? "");
      setCity(contact.city ?? "");
    } catch {
      setError(ar ? "تعذر تحميل ملف الشركة. تأكد من صلاحيتك وحاول تحديث الصفحة." : "Could not load this business profile. Check your access and refresh.");
    } finally {
      setLoading(false);
    }
  }, [params.accountId, ar]);

  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/accounts/${encodeURIComponent(params.accountId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName, displayName, countryCode, description, website,
          contactInformation: { email, phone, whatsapp, address, city },
        }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error ?? "Save failed");
      setMessage(ar ? "تم حفظ بيانات الشركة. حالة التحقق لم تتغير." : "Business details saved. Verification status has not changed.");
      await load();
    } catch {
      setError(ar ? "تعذر حفظ البيانات. راجع الحقول وحاول مرة أخرى." : "Could not save details. Check the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, value: string, set: (v: string) => void, props: Record<string, unknown> = {}) => (
    <label className="business-detail-field">
      <span>{label}</span>
      <input value={value} onChange={event => set(event.target.value)} {...props} />
    </label>
  );

  return (
    <main className="business-page" lang={locale} dir={ar ? "rtl" : "ltr"}>
      <WorkspaceHeader section="business" />
      <section className="business-container">
        <div className="business-heading">
          <div>
            <span className="business-eyebrow">WASLA BUSINESS</span>
            <h1>{ar ? "ملف النشاط التجاري" : "Business profile"}</h1>
            <p>{ar ? "حدّث معلومات نشاطك التجاري وبيانات التواصل." : "Update your business information and contact details."}</p>
          </div>
          <Link href="/business" className="business-refresh">{ar ? "العودة لإدارة الأعمال" : "Back to business"}</Link>
        </div>

        {loading ? <div className="business-loading">{ar ? "جارٍ تحميل البيانات..." : "Loading..."}</div> : error && !account ? (
          <div className="business-alert business-alert-error" role="alert">{error}</div>
        ) : account ? (
          <>
            <section className="business-account-card">
              <div className="business-account-symbol">W</div>
              <div className="business-account-info">
                <span>{ar ? "حالة التحقق" : "Verification status"}: {account.verification_status ?? "unverified"}</span>
                <h3>{account.display_name}</h3>
                <p>{ar ? "تعديل البيانات لا يمنح توثيقاً تلقائياً." : "Editing details does not automatically verify the business."}</p>
              </div>
            </section>
            {error && <div className="business-alert business-alert-error" role="alert">{error}</div>}
            {message && <div className="business-alert business-alert-success" role="status">{message}</div>}
            <form className="business-invite-form business-details-form" onSubmit={save}>
              {field(ar ? "الاسم القانوني للنشاط" : "Legal business name", legalName, setLegalName, { required: true, minLength: 2, maxLength: 255 })}
              {field(ar ? "الاسم الظاهر للعملاء" : "Public display name", displayName, setDisplayName, { required: true, minLength: 2, maxLength: 255 })}
              {field(ar ? "رمز الدولة (حرفان)" : "Country code (2 letters)", countryCode, v => setCountryCode(v.toUpperCase()), { maxLength: 2, placeholder: "TR" })}
              <label className="business-detail-field">
                <span>{ar ? "وصف النشاط التجاري" : "Business description"}</span>
                <textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={5000} rows={5} />
              </label>
              {field(ar ? "الموقع الإلكتروني" : "Website", website, setWebsite, { type: "url", placeholder: "https://" })}
              <h2>{ar ? "بيانات التواصل" : "Contact information"}</h2>
              {field(ar ? "البريد الإلكتروني التجاري" : "Business email", email, setEmail, { type: "email" })}
              {field(ar ? "رقم الهاتف" : "Phone number", phone, setPhone, { type: "tel" })}
              {field("WhatsApp", whatsapp, setWhatsapp, { type: "tel" })}
              {field(ar ? "العنوان الفعلي للنشاط" : "Business address", address, setAddress, { maxLength: 500 })}
              {field(ar ? "المدينة" : "City", city, setCity)}
              <button type="submit" disabled={saving} className="business-invite-button">
                {saving ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "حفظ بيانات الشركة" : "Save business details")}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}
