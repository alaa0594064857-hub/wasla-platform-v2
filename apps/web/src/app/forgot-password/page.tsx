"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
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
      if (result.error) {
        setError("تعذر إرسال رابط الاستعادة. تحقق من البريد وحاول مجدداً.");
      } else {
        setMessage("إذا كان البريد مسجلاً ومسموحاً له باستقبال الرسائل، فسيصلك رابط إعادة تعيين كلمة المرور.");
      }
    } catch {
      setError("تعذر إرسال رابط الاستعادة. حاول مجدداً لاحقاً.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page" lang="ar" dir="rtl">
      <section className="auth-panel">
        <header className="auth-header">
          <Link href="/" className="auth-brand"><span className="auth-brand-symbol">W</span><span>وصلة</span></Link>
        </header>
        <div className="auth-content">
          <span className="auth-eyebrow">WASLA ACCOUNT</span>
          <h1>استعادة كلمة المرور</h1>
          <p className="auth-description">أدخل البريد الإلكتروني المرتبط بحسابك لنرسل لك رابطاً آمناً لتعيين كلمة مرور جديدة.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>البريد الإلكتروني</span>
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} required />
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            {message && <p className="auth-success" role="status">{message}</p>}
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "جارٍ الإرسال..." : "إرسال رابط الاستعادة"} <span aria-hidden="true">↗</span>
            </button>
          </form>
          <p className="auth-switch"><Link href="/login">العودة إلى تسجيل الدخول</Link></p>
        </div>
        <footer className="auth-footer">WASLA · A global platform for commerce and business</footer>
      </section>
      <aside className="auth-aside"><div className="auth-aside-orbit auth-aside-orbit-one" /><div className="auth-aside-orbit auth-aside-orbit-two" /><div className="auth-aside-center"><span>W</span><strong>WASLA</strong><small>ONE IDENTITY. GLOBAL OPPORTUNITIES.</small></div></aside>
    </main>
  );
}
