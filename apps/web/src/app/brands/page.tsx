"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import WorkspaceHeader from "../../components/workspace-header";
import { useLocale } from "../../components/locale-provider";

type Brand = { id: string; display_name: string; legal_name: string; status: string; country_code: string | null; description: string | null; website: string | null; logo_reference: string | null };

const copy = {
  ar: { eyebrow: "WASLA BRAND STUDIO", title: "العلامات التجارية والشعارات", intro: "مساحة موحدة لإدارة هويات علاماتك التجارية وشعاراتها داخل وصلة.", empty: "لا توجد علامة تجارية مرتبطة بحسابك حتى الآن.", create: "إنشاء علامة تجارية", manage: "إدارة الحسابات التجارية", upload: "رفع الشعار", save: "حفظ الشعار", saving: "جارٍ الحفظ...", hint: "PNG أو JPG أو WEBP أو SVG — حتى 3 ميغابايت", success: "تم تحديث الشعار.", error: "تعذر تنفيذ العملية. حاول مرة أخرى.", choose: "اختر شعاراً من جهازك", remove: "إزالة الشعار", logo: "الشعار الرسمي", verified: "حالة الحساب" },
  en: { eyebrow: "WASLA BRAND STUDIO", title: "Brands & logos", intro: "One workspace to manage your brand identities and logos across WASLA.", empty: "No brand accounts are linked to your account yet.", create: "Create a brand", manage: "Manage business accounts", upload: "Upload logo", save: "Save logo", saving: "Saving...", hint: "PNG, JPG, WEBP or SVG — up to 3 MB", success: "Logo updated.", error: "Could not complete the action. Please try again.", choose: "Choose a logo from your device", remove: "Remove logo", logo: "Official logo", verified: "Account status" }
};

export default function BrandsPage() {
  const { locale } = useLocale();
  const t = copy[locale];
  const ar = locale === "ar";
  const [brands, setBrands] = useState<Brand[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/brands", { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("load");
      setBrands(data.brands || []);
      setDrafts(Object.fromEntries((data.brands || []).map((b: Brand) => [b.id, b.logo_reference || ""])));
    } catch { setNotice(t.error); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function selectLogo(id: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type) || file.size > 3 * 1024 * 1024) { setNotice(t.error); event.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setDrafts(current => ({ ...current, [id]: reader.result as string })); };
    reader.onerror = () => setNotice(t.error);
    reader.readAsDataURL(file);
  }

  async function saveLogo(id: string) {
    setSaving(id); setNotice("");
    try {
      const response = await fetch("/api/brands", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: id, logoReference: drafts[id] || null }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("save");
      setNotice(t.success); await load();
    } catch { setNotice(t.error); }
    finally { setSaving(""); }
  }

  return (
    <main className="wasla-brands-page" lang={locale} dir={ar ? "rtl" : "ltr"}>
      <WorkspaceHeader section="business" />
      <div className="wasla-brands-wrap">
        <header className="wasla-brands-heading">
          <div><span>{t.eyebrow}</span><h1>{t.title}</h1><p>{t.intro}</p></div>
          <div className="wasla-brands-emblem">B</div>
        </header>
        <div className="wasla-brands-toolbar"><div><b>{ar ? "استوديو العلامات" : "Brand identity studio"}</b><small>{ar ? "إدارة أصول العلامة التجارية" : "Manage your brand assets"}</small></div><a href="/business">{t.manage} ↗</a></div>
        {notice && <p className="wasla-brands-notice" role="status">{notice}</p>}
        {loading ? <div className="wasla-brands-empty">{ar ? "جارٍ تحميل العلامات..." : "Loading brands..."}</div> : brands.length === 0 ? (
          <section className="wasla-brands-empty"><span className="wasla-brands-empty-mark">B</span><h2>{t.empty}</h2><p>{ar ? "أنشئ حساباً تجارياً من نوع علامة تجارية، ثم ستتمكن من إضافة شعارها وإدارته هنا." : "Create a business account with the Brand type, then add and manage its logo here."}</p><a href="/business">{t.create} ↗</a></section>
        ) : (
          <div className="wasla-brands-grid">{brands.map(brand => (
            <article className="wasla-brand-card" key={brand.id}>
              <div className="wasla-brand-card-top"><div className="wasla-brand-logo">{drafts[brand.id] ? <img src={drafts[brand.id]} alt={brand.display_name} /> : <span>{brand.display_name.slice(0,1).toUpperCase()}</span>}</div><div><h2>{brand.display_name}</h2><p>{brand.legal_name}</p><small>{brand.country_code || "—"} · {brand.status}</small></div></div>
              <label className="wasla-brand-file">{t.choose}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e => void selectLogo(brand.id,e)} /></label>
              <p className="wasla-brand-hint">{t.hint}</p>
              <button type="button" onClick={() => void saveLogo(brand.id)} disabled={saving === brand.id}>{saving === brand.id ? t.saving : t.save}<span>↗</span></button>
            </article>
          ))}</div>
        )}
      </div>
    </main>
  );
}
