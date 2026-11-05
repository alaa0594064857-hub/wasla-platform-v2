"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordPage() {
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
      setError("رابط الاستعادة غير صالح أو لا يحتوي على رمز التحقق.");
      return;
    }
    if (password.length < 8) {
      setError("يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.");
      return;
    }
    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError("تعذر تغيير كلمة المرور. قد يكون الرابط منتهي الصلاحية؛ اطلب رابطاً جديداً.");
      } else {
        setMessage("تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.");
      }
    } catch {
      setError("تعذر تغيير كلمة المرور. اطلب رابط استعادة جديداً.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page" lang="ar" dir="rtl">
      <section className="auth-panel">
        <header className="auth-header"><Link href="/" className="auth-brand"><span className="auth-brand-symbol">W</span><span>وصلة</span></Link></header>
        <div className="auth-content">
          <span className="auth-eyebrow">WASLA ACCOUNT</span>
          <h1>تعيين كلمة مرور جديدة</h1>
          <p className="auth-description">اختر كلمة مرور جديدة لحسابك، ولا تشارك رابط الاستعادة مع أي شخص.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field"><span>كلمة المرور الجديدة</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
            <label className="auth-field"><span>تأكيد كلمة المرور</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            {message && <p className="auth-success" role="status">{message}</p>}
            <button className="auth-submit" type="submit" disabled={loading || !token}>{loading ? "جارٍ الحفظ..." : "حفظ كلمة المرور الجديدة"} <span aria-hidden="true">↗</span></button>
          </form>
          <p className="auth-switch"><Link href="/login">العودة إلى تسجيل الدخول</Link></p>
        </div>
        <footer className="auth-footer">WASLA · A global platform for commerce and business</footer>
      </section>
      <aside className="auth-aside"><div className="auth-aside-orbit auth-aside-orbit-one" /><div className="auth-aside-orbit auth-aside-orbit-two" /><div className="auth-aside-center"><span>W</span><strong>WASLA</strong><small>ONE IDENTITY. GLOBAL OPPORTUNITIES.</small></div></aside>
    </main>
  );
}
