
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type Profile = {
  userId: string;
  displayName: string;
  avatarReference: string | null;
  email: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function ProfilePage() {
  const { locale } = useLocale();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarReference, setAvatarReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isArabic = locale === "ar";

  const t = {
    language: isArabic ? "English" : "العربية",
    eyebrow: isArabic ? "إعدادات الحساب" : "ACCOUNT SETTINGS",
    title: isArabic ? "الملف الشخصي" : "My Profile",
    description: isArabic
      ? "اعرض معلوماتك الشخصية وحدّث بيانات ملفك الشخصي."
      : "View your personal information and update your profile.",
    email: isArabic ? "البريد الإلكتروني" : "Email address",
    name: isArabic ? "الاسم المعروض" : "Display name",
    avatar: isArabic ? "رابط الصورة المرجعية" : "Avatar reference URL",
    avatarHint: isArabic
      ? "أدخل رابط صورة متاحاً عبر الإنترنت."
      : "Enter an image URL available online.",
    save: isArabic ? "حفظ التغييرات" : "Save changes",
    saving: isArabic ? "جارٍ الحفظ..." : "Saving...",
    loading: isArabic ? "جارٍ تحميل الملف الشخصي..." : "Loading profile...",
    home: isArabic ? "الرئيسية" : "Home",
    business: isArabic ? "حسابات الأعمال" : "Business",
    invitations: isArabic ? "الدعوات" : "Invitations",
    required: isArabic
      ? "يرجى إدخال اسم صحيح."
      : "Please enter a valid name.",
    loadError: isArabic
      ? "تعذر تحميل الملف الشخصي. يرجى تسجيل الدخول والمحاولة مجدداً."
      : "Could not load your profile. Please sign in and try again.",
    saveError: isArabic
      ? "تعذر حفظ التغييرات. حاول مرة أخرى."
      : "Could not save changes. Please try again.",
    saved: isArabic
      ? "تم حفظ التغييرات بنجاح."
      : "Your changes have been saved.",
    signIn: isArabic ? "تسجيل الدخول" : "Sign in",
    signOut: isArabic ? "تسجيل الخروج" : "Sign out",
    signingOut: isArabic ? "جارٍ تسجيل الخروج..." : "Signing out...",
    signOutError: isArabic
      ? "تعذر تسجيل الخروج. يرجى المحاولة مرة أخرى."
      : "Could not sign out. Please try again.",
  };

  async function profileRequest(
    method: "GET" | "PATCH",
    body?: {
      displayName: string;
      avatarReference: string | null;
    },
  ) {
    const response = await fetch(`${API_BASE}/api/profile`, {
      method,
      credentials: "include",
      headers:
        method === "PATCH"
          ? { "Content-Type": "application/json" }
          : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "";
    const result = contentType.includes("application/json")
      ? await response.json()
      : {};

    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Request failed");
    }

    return result;
  }

  async function loadProfile() {
    setLoading(true);
    setError("");

    try {
      const result = await profileRequest("GET");
      const data = result.profile as Profile;

      if (!data || typeof data.email !== "string") {
        throw new Error("Invalid profile response");
      }

      setProfile(data);
      setDisplayName(data.displayName ?? "");
      setAvatarReference(data.avatarReference ?? "");
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (displayName.trim().length < 2 || displayName.trim().length > 160) {
      setError(t.required);
      return;
    }

    setSaving(true);

    try {
      await profileRequest("PATCH", {
        displayName: displayName.trim(),
        avatarReference: avatarReference.trim() || null,
      });

      await loadProfile();
      setSuccess(t.saved);
    } catch {
      setError(t.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setError("");
    setSuccess("");
    setLoggingOut(true);

    try {
      await authClient.signOut();
      window.location.assign("/login");
    } catch {
      setError(t.signOutError);
      setLoggingOut(false);
    }
  }

  return (
    <><WorkspaceHeader section="account" /><main className="auth-page" dir={isArabic ? "rtl" : "ltr"}>
      <section className="auth-panel">
        <header className="auth-header">
          <a href="/" className="auth-brand">
            <span className="auth-brand-symbol">W</span>
            WASLA
          </a>


        </header>

        <div className="auth-content">
          <span className="auth-eyebrow">{t.eyebrow}</span>
          <h1>{t.title}</h1>
          <p className="auth-description">{t.description}</p>

          {loading ? (
            <p className="business-loading">{t.loading}</p>
          ) : error && !profile ? (
            <>
              <p className="auth-error">{error}</p>
              <a href="/login" className="auth-home">
                {t.signIn}
              </a>
            </>
          ) : profile ? (
            <>
              <form className="auth-form" onSubmit={handleSave}>
                <label className="auth-field">
                  {t.email}
                  <input
                    type="email"
                    value={profile.email}
                    readOnly
                    disabled
                  />
                </label>

                <label className="auth-field">
                  {t.name}
                  <input
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    minLength={2}
                    maxLength={160}
                    required
                  />
                </label>

                <label className="auth-field">
                  {t.avatar}
                  <input
                    type="url"
                    value={avatarReference}
                    onChange={(event) =>
                      setAvatarReference(event.target.value)
                    }
                    maxLength={2048}
                    placeholder="https://example.com/image.jpg"
                  />
                  <span className="auth-hint">{t.avatarHint}</span>
                </label>

                {avatarReference.trim() && (
                  <div style={{ textAlign: "center" }}>
                    <img
                      src={avatarReference}
                      alt="Profile preview"
                      referrerPolicy="no-referrer"
                      style={{
                        width: 100,
                        height: 100,
                        borderRadius: "50%",
                        objectFit: "cover",
                        border: "2px solid #c6a15b",
                      }}
                    />
                  </div>
                )}

                {error && <p className="auth-error">{error}</p>}

                {success && (
                  <p className="business-alert business-alert-success">
                    {success}
                  </p>
                )}

                <button
                  type="submit"
                  className="auth-submit"
                  disabled={saving || loggingOut}
                >
                  {saving ? t.saving : t.save}
                  <span>→</span>
                </button>
              </form>

              <button
                type="button"
                className="auth-submit"
                onClick={handleSignOut}
                disabled={loggingOut || saving}
                style={{ marginTop: 14 }}
              >
                {loggingOut ? t.signingOut : t.signOut}
              </button>

              {error && <p className="auth-error">{error}</p>}
            </>
          ) : null}

          <nav
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 18,
              marginTop: 28,
              fontSize: 12,
            }}
          >
            <a href="/" className="auth-home">
              {t.home}
            </a>
            <a href="/business" className="auth-home">
              {t.business}
            </a>
            <a href="/invitations" className="auth-home">
              {t.invitations}
            </a>
          </nav>
        </div>

        <footer className="auth-footer">
          WASLA — Global Business Platform
        </footer>
      </section>

      <aside className="auth-aside">
        <div className="auth-aside-orbit auth-aside-orbit-one" />
        <div className="auth-aside-orbit auth-aside-orbit-two" />
        <div className="auth-aside-center">
          <span>W</span>
          <strong>WASLA</strong>
          <small>GLOBAL BUSINESS PLATFORM</small>
        </div>
      </aside>
    </main></>
  );
}
