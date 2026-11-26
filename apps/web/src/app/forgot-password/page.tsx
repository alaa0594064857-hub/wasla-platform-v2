"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "@/components/locale-provider";

const copy = {
  ar: {
    eyebrow: "WASLA ACCOUNT", title: "استعادة كلمة المرور",
    description: "أدخل البريد الإلكتروني المرتبط بحسابك لنرسل لك رابطاً آمناً لتعيين كلمة مرور جديدة.",
    email: "البريد الإلكتروني", send: "إرسال رابط الاستعادة", sending: "جارٍ الإرسال...",
    error: "تعذر إرسال رابط الاستعادة. تحقق من البريد وحاول مجدداً.",
    genericError: "تعذر إرسال رابط الاستعادة. حاول مجدداً لاحقاً.",
    success: "إذا كان البريد مسجلاً ومسموحاً له باستقبال الرسائل، فسيصلك رابط إعادة تعيين كلمة المرور.",
    back: "العودة إلى تسجيل الدخول", footer: "WASLA · منصة عالمية للتجارة والأعمال", language: "English",
  },
  en: {
    eyebrow: "WASLA ACCOUNT", title: "Reset your password",
    description: "Enter the email address linked to your account and we’ll send you a secure password reset link.",
    email: "Email address", send: "Send reset link", sending: "Sending...",
    error: "We couldn't send the reset link. Check the email address and try again.",
    genericError: "We couldn't send the reset link. Please try again later.",
    success: "If this email is registered and eligible to receive messages, a password reset link will be sent.",
    back: "Back to sign in", footer: "WASLA · A global platform for commerce and business", language: "العربية",
  },
};

export default function ForgotPasswordPage() {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: "/reset-password",
      });
      if (result.error) setError(t.error);
      else setMessage(t.success);
    } catch {
      setError(t.genericError);
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
            <label className="auth-field">
              <span>{t.email}</span>
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} required />
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            {message && <p className="auth-success" role="status">{message}</p>}
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? t.sending : t.send} <span aria-hidden="true">↗</span>
            </button>
          </form>
          <p className="auth-switch"><Link href="/login">{t.back}</Link></p>
        </div>
        <footer className="auth-footer">{t.footer}</footer>
      </section>
      <aside className="auth-aside"><div className="auth-aside-orbit auth-aside-orbit-one" /><div className="auth-aside-orbit auth-aside-orbit-two" /><div className="auth-aside-center"><span>W</span><strong>WASLA</strong><small>ONE IDENTITY. GLOBAL OPPORTUNITIES.</small></div></aside>
    </main>
  );
}
