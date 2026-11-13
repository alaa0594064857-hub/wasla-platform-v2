"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type Profile = {
  userId: string;
  displayName: string;
  avatarReference: string | null;
  email: string;
  bio: string;
  website: string;
  socialLinks: Record<string, string>;
};

const emptyLinks = { instagram: "", facebook: "", linkedin: "", x: "", youtube: "", tiktok: "" };
const labels = {
  ar: {
    eyebrow: "WASLA ID · هويتك الرقمية", title: "ملفي الشخصي", subtitle: "أنشئ حضورك الشخصي على وصلة. معلوماتك وروابطك تظهر ضمن هويتك الموحدة.",
    photo: "الصورة الشخصية", upload: "اختيار صورة من الهاتف", photoHint: "PNG أو JPG أو WEBP — حتى 3 ميغابايت",
    name: "الاسم الظاهر", email: "البريد الإلكتروني", bio: "نبذة عنك", bioHint: "اكتب نبذة قصيرة تعرّف الآخرين بك...", website: "موقعك الإلكتروني",
    socials: "روابطك وحساباتك", save: "حفظ الملف الشخصي", saving: "جارٍ الحفظ...", loading: "جارٍ تحميل ملفك...", saved: "تم حفظ ملفك الشخصي.", error: "تعذر حفظ التغييرات. تحقق من البيانات وحاول مجدداً.",
    home: "الرئيسية", remove: "إزالة الصورة", preview: "معاينة الصورة", invalid: "اختر صورة صالحة أصغر من 3 ميغابايت."
  },
  en: {
    eyebrow: "WASLA ID · YOUR DIGITAL IDENTITY", title: "My profile", subtitle: "Build your personal presence on WASLA. Your details and links belong to your unified identity.",
    photo: "Profile photo", upload: "Choose a photo from your device", photoHint: "PNG, JPG or WEBP — up to 3 MB",
    name: "Display name", email: "Email address", bio: "About you", bioHint: "Write a short introduction...", website: "Your website",
    socials: "Your links & social accounts", save: "Save profile", saving: "Saving...", loading: "Loading your profile...", saved: "Your profile has been saved.", error: "Could not save changes. Check the details and try again.",
    home: "Home", remove: "Remove photo", preview: "Photo preview", invalid: "Choose a valid image smaller than 3 MB."
  }
};

export default function ProfilePage() {
  const { locale } = useLocale();
  const t = labels[locale];
  const ar = locale === "ar";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarReference, setAvatarReference] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [socialLinks, setSocialLinks] = useState({ ...emptyLinks });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadProfile() {
    setLoading(true);
    try {
      const response = await fetch("/api/profile", { credentials: "include", cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success || !result.profile) throw new Error("profile");
      const data = result.profile as Profile;
      setProfile(data);
      setDisplayName(data.displayName || "");
      setAvatarReference(data.avatarReference || "");
      setBio(data.bio || "");
      setWebsite(data.website || "");
      setSocialLinks({ ...emptyLinks, ...(data.socialLinks || {}) });
      setError("");
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadProfile(); }, []);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 3 * 1024 * 1024) {
      setError(t.invalid);
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatarReference(reader.result);
        setError("");
      }
    };
    reader.onerror = () => setError(t.invalid);
    reader.readAsDataURL(file);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, avatarReference: avatarReference || null, bio, website, socialLinks })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("save");
      await loadProfile();
      setSuccess(t.saved);
    } catch {
      setError(t.error);
    } finally {
      setSaving(false);
    }
  }

  function updateLink(key: keyof typeof emptyLinks, value: string) {
    setSocialLinks(current => ({ ...current, [key]: value }));
  }

  return (
    <main className="wasla-profile-page" lang={locale} dir={ar ? "rtl" : "ltr"}>
      <WorkspaceHeader section="account" />
      <div className="wasla-profile-wrap">
        <header className="wasla-profile-heading">
          <div><span>{t.eyebrow}</span><h1>{t.title}</h1><p>{t.subtitle}</p></div>
          <a href="/account">{t.home} ↗</a>
        </header>

        {!loading && <section className="wasla-profile-public-preview">
          <div className="wasla-profile-public-avatar">{avatarReference ? <img src={avatarReference} alt={t.preview} /> : <span>{(displayName.trim().charAt(0) || "W").toUpperCase()}</span>}</div>
          <div className="wasla-profile-public-copy">
            <span>{ar ? "معاينة هويتك" : "PROFILE PREVIEW"}</span>
            <h2>{displayName || (ar ? "اسمك سيظهر هنا" : "Your name will appear here")}</h2>
            {bio && <p>{bio}</p>}
            {website && <a href={website} target="_blank" rel="noreferrer">{website}</a>}
            <div className="wasla-profile-public-links">
              {Object.entries(socialLinks).filter(([, value]) => Boolean(value)).map(([key, value]) => <a key={key} href={value} target="_blank" rel="noreferrer">{key === "x" ? "X" : key[0].toUpperCase() + key.slice(1)} ↗</a>)}
            </div>
          </div>
        </section>}
        {loading ? <div className="wasla-profile-loading">{t.loading}</div> : (
          <form className="wasla-profile-form" onSubmit={save}>
            <section className="wasla-profile-card wasla-profile-photo-card">
              <div className="wasla-profile-section-title"><span>01</span><div><h2>{t.photo}</h2><p>{t.photoHint}</p></div></div>
              <div className="wasla-profile-photo-row">
                <div className="wasla-profile-photo-preview">
                  {avatarReference ? <img src={avatarReference} alt={t.preview} /> : <span>{(displayName.trim().charAt(0) || "W").toUpperCase()}</span>}
                </div>
                <div className="wasla-profile-photo-actions">
                  <label className="wasla-profile-upload">{t.upload}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={choosePhoto} /></label>
                  {avatarReference && <button type="button" className="wasla-profile-remove" onClick={() => setAvatarReference("")}>{t.remove}</button>}
                </div>
              </div>
            </section>

            <section className="wasla-profile-card">
              <div className="wasla-profile-section-title"><span>02</span><div><h2>{ar ? "معلوماتك الأساسية" : "Basic information"}</h2><p>{ar ? "المعلومات التي تعرّف بك داخل منظومة وصلة." : "The details that identify you across WASLA."}</p></div></div>
              <div className="wasla-profile-fields">
                <label>{t.name}<input value={displayName} onChange={e => setDisplayName(e.target.value)} minLength={2} maxLength={160} required /></label>
                <label>{t.email}<input value={profile?.email || ""} readOnly disabled /></label>
                <label className="wasla-profile-full">{t.bio}<textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={500} rows={4} placeholder={t.bioHint} /><small>{bio.length}/500</small></label>
                <label className="wasla-profile-full">{t.website}<input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://example.com" /></label>
              </div>
            </section>

            <section className="wasla-profile-card">
              <div className="wasla-profile-section-title"><span>03</span><div><h2>{t.socials}</h2><p>{ar ? "أضف الروابط التي تريد أن يراها الآخرون في ملفك." : "Add the links you want people to find on your profile."}</p></div></div>
              <div className="wasla-profile-fields wasla-profile-social-grid">
                <label>Instagram<input type="url" value={socialLinks.instagram} onChange={e => updateLink("instagram", e.target.value)} placeholder="https://instagram.com/..." /></label>
                <label>Facebook<input type="url" value={socialLinks.facebook} onChange={e => updateLink("facebook", e.target.value)} placeholder="https://facebook.com/..." /></label>
                <label>LinkedIn<input type="url" value={socialLinks.linkedin} onChange={e => updateLink("linkedin", e.target.value)} placeholder="https://linkedin.com/in/..." /></label>
                <label>X<input type="url" value={socialLinks.x} onChange={e => updateLink("x", e.target.value)} placeholder="https://x.com/..." /></label>
                <label>YouTube<input type="url" value={socialLinks.youtube} onChange={e => updateLink("youtube", e.target.value)} placeholder="https://youtube.com/..." /></label>
                <label>TikTok<input type="url" value={socialLinks.tiktok} onChange={e => updateLink("tiktok", e.target.value)} placeholder="https://tiktok.com/@..." /></label>
              </div>
            </section>

            {error && <p className="wasla-profile-error" role="alert">{error}</p>}
            {success && <p className="wasla-profile-success" role="status">{success}</p>}
            <div className="wasla-profile-submit-row"><button type="submit" disabled={saving}>{saving ? t.saving : t.save} <span>↗</span></button></div>
          </form>
        )}
      </div>
    </main>
  );
}
