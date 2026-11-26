"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "@/components/locale-provider";

const copy = {
  ar: {
    eyebrow: "WASLA ACCOUNT", title: "تعيين كلمة مرور جديدة",
    description: "اختر كلمة مرور جديدة لحسابك، ولا تشارك رابط الاستعادة مع أي شخص.",
    password: "كلمة المرور الجديدة", confirm: "تأكيد كلمة المرور", save: "حفظ كلمة المرور الجديدة", saving: "جارٍ الحفظ...",
    missing: "رابط الاستعادة غير صالح أو لا يحتوي على رمز التحقق.",
    length: "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.",
    mismatch: "كلمتا المرور غير متطابقتين.",
    failed: "تعذر تغيير كلمة المرور. قد يكون الرابط منتهي الصلاحية؛ اطلب رابطاً جديداً.",
    generic: "تعذر تغيير كلمة المرور. اطلب رابط استعادة جديداً.",
    success: "تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.",
    back: "العودة إلى تسجيل الدخول", footer: "WASLA · منصة عالمية للتجارة والأعمال", language: "English",
  },
  en: {
    eyebrow: "WASLA ACCOUNT", title: "Choose a new password",
    description: "Choose a new password for your account. Never share your password reset link with anyone.",
    password: "New password", confirm: "Confirm new password", save: "Save new password", saving: "Saving...",
    missing: "The reset link is invalid or does not contain a verification token.",
    length: "Your password must be at least 8 characters long.",
    mismatch: "The passwords do not match.",
    failed: "We couldn't change your password. The link may have expired; request a new one.",
    generic: "We couldn't change your password. Please request a new reset link.",
    success: "Your password has been changed successfully. You can now sign in.",
    back: "Back to sign in", footer: "WASLA · A global platform for commerce and business", language: "العربية",
  },
};

export default function ResetPasswordPage() {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!token) {
      setError(t.missing);
      return;
    }
    if (password.length < 8) {
      setError(t.length);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.mismatch);
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) setError(t.failed);
      else setMessage(t.success);
    } catch {
      setError(t.generic);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <section className="auth-panel">
        <header className="auth-header">
          <Link href="/" className="auth-brand"><span className="auth-brand-symbol">W</span><span>{locale === "ar" ? "وصلة" : "WASLA"}</span></Link>
          <button className="auth-language" type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{t.language}</button>
        </header>
        <div className="auth-content">
          <span className="auth-eyebrow">{t.eyebrow}</span>
          <h1>{t.title}</h1>
          <p className="auth-description">{t.description}</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field"><span>{t.password}</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
            <label className="auth-field"><span>{t.confirm}</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            {message && <p className="auth-success" role="status">{message}</p>}
            <button className="auth-submit" type="submit" disabled={loading || !token}>{loading ? t.saving : t.save} <span aria-hidden="true">↗</span></button>
          </form>
          <p className="auth-switch"><Link href="/login">{t.back}</Link></p>
        </div>
        <footer className="auth-footer">{t.footer}</footer>
      </section>
      <aside className="auth-aside"><div className="auth-aside-orbit auth-aside-orbit-one" /><div className="auth-aside-orbit auth-aside-orbit-two" /><div className="auth-aside-center"><span>W</span><strong>WASLA</strong><small>ONE IDENTITY. GLOBAL OPPORTUNITIES.</small></div></aside>
    </main>
  );
}
