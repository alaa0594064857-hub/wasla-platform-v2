"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "./locale-provider";

type AuthMode = "login" | "register";
type RegistrationType = "buyer" | "company" | "supplier" | "manufacturer" | "trader" | "brand";

const labels = {
  ar: {
    brand: "وصلة",
    loginTitle: "مرحباً بعودتك",
    registerTitle: "أنشئ حسابك في وصلة",
    loginText: "سجّل الدخول لمتابعة أعمالك واتصالاتك التجارية.",
    registerText: "ابدأ بهوية واحدة تربطك بعالم التجارة والأعمال.",
    name: "الاسم الشخصي",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    login: "تسجيل الدخول",
    register: "إنشاء الحساب",
    noAccount: "ليس لديك حساب؟",
    hasAccount: "لديك حساب بالفعل؟",
    create: "أنشئ حساباً",
    enter: "سجّل الدخول",
    home: "العودة إلى الرئيسية",
    loading: "جارٍ المعالجة...",
    loginError: "تعذر تسجيل الدخول. تحقق من بياناتك وحاول مجدداً.",
    registerError: "تعذر إنشاء الحساب. تحقق من البيانات وحاول مجدداً.",
    verificationSent: "إذا كان هذا البريد بحاجة إلى التحقق، فسنرسل إليه رابطاً. افحص الوارد والرسائل غير المرغوب فيها.",
    verificationEmailError: "تعذر إرسال رسالة التحقق الآن. لم يكتمل التفعيل؛ يمكنك إعادة المحاولة.",
    resendVerification: "إعادة إرسال رسالة التحقق",
    language: "English",
    passwordHint: "ثمانية أحرف على الأقل",
    accountType: "نوع العضوية",
    buyer: "مشتري (حساب شخصي)",
    company: "شركة",
    supplier: "مورد",
    manufacturer: "مصنع",
    trader: "تاجر",
    brandOwner: "صاحب علامة تجارية / متجر",
  },
  en: {
    brand: "WASLA",
    loginTitle: "Welcome back",
    registerTitle: "Create your WASLA account",
    loginText: "Sign in to continue your business and connections.",
    registerText: "Start with one identity connecting you to global commerce.",
    name: "Personal name",
    email: "Email address",
    password: "Password",
    login: "Sign in",
    register: "Create account",
    noAccount: "Don't have an account?",
    hasAccount: "Already have an account?",
    create: "Create an account",
    enter: "Sign in",
    home: "Back to home",
    loading: "Please wait...",
    loginError: "Unable to sign in. Check your details and try again.",
    registerError: "Unable to create your account. Check your details and try again.",
    verificationSent: "If this email needs verification, a link will be sent. Check your inbox and spam folder.",
    verificationEmailError: "We could not send the verification email right now. Activation is not complete; you can retry.",
    resendVerification: "Resend verification email",
    language: "العربية",
    passwordHint: "At least 8 characters",
    accountType: "Membership type",
    buyer: "Buyer (personal account)",
    company: "Company",
    supplier: "Supplier",
    manufacturer: "Factory / Manufacturer",
    trader: "Trader",
    brandOwner: "Brand / Store owner",
  },
};

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registrationType, setRegistrationType] = useState<RegistrationType>("buyer");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const t = labels[locale];
  const isRegister = mode === "register";

  async function handleResendVerification() {
    if (!verificationEmail || resendingVerification) return;
    setResendingVerification(true);
    setError("");
    setSuccessMessage("");
    try {
      const result = await authClient.sendVerificationEmail({ email: verificationEmail, callbackURL: "/" });
      if (result.error) {
        setError(t.verificationEmailError);
        return;
      }
      setSuccessMessage(t.verificationSent);
    } catch {
      setError(t.verificationEmailError);
    } finally {
      setResendingVerification(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      if (isRegister) {
        const signUpWithRegistrationType = authClient.signUp.email as unknown as (data: {
          name: string;
          email: string;
          password: string;
          registrationType: RegistrationType;
        }) => Promise<{ error?: unknown }>;
        const result = await signUpWithRegistrationType({
          name: name.trim(),
          email: email.trim(),
          password,
          registrationType,
        });

        if (result.error) {
          setError(t.registerError);
          return;
        }
        const normalizedEmail = email.trim();
        setVerificationEmail(normalizedEmail);
        const verificationResult = await authClient.sendVerificationEmail({ email: normalizedEmail, callbackURL: "/" });
        if (verificationResult.error) {
          setError(t.verificationEmailError);
          return;
        }
        setSuccessMessage(t.verificationSent);
        return;
      } else {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
        });

        if (result.error) {
          setError(t.loginError);
          return;
        }
      }

      // Resolve the signed-in account's server-verified platform role before choosing its landing page.
      let destination = "/account";
      try {
        const accessResponse = await fetch("/api/platform/security", {
          credentials: "include",
          cache: "no-store",
        });
        if (accessResponse.ok) {
          const accessData = await accessResponse.json();
          if (accessData?.success && accessData.platformAccess?.roles?.includes("platform_owner")) {
            destination = "/owner";
          }
        }
      } catch {
        // Keep the normal account landing page if the security check is temporarily unavailable.
      }
      router.replace(destination);
      router.refresh();
    } catch {
      setError(isRegister ? t.registerError : t.loginError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <section className="auth-panel">
        <header className="auth-header">
          <Link href="/" className="auth-brand">
            <span className="auth-brand-symbol">W</span>
            <span>{t.brand}</span>
          </Link>

          <button
            className="auth-language"
            type="button"
            onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
          >
            {t.language}
          </button>
        </header>

        <div className="auth-content">
          <span className="auth-eyebrow">WASLA ACCOUNT</span>

          <h1>{isRegister ? t.registerTitle : t.loginTitle}</h1>

          <p className="auth-description">
            {isRegister ? t.registerText : t.loginText}
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {isRegister && (
              <label className="auth-field">
                <span>{t.name}</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={160}
                  required
                />
              </label>
            )}


            {isRegister && (
              <label className="auth-field">
                <span>{t.accountType}</span>
                <select value={registrationType} onChange={(event) => setRegistrationType(event.target.value as RegistrationType)} required>
                  <option value="buyer">{t.buyer}</option>
                  <option value="company">{t.company}</option>
                  <option value="supplier">{t.supplier}</option>
                  <option value="manufacturer">{t.manufacturer}</option>
                  <option value="trader">{t.trader}</option>
                  <option value="brand">{t.brandOwner}</option>
                </select>
              </label>
            )}

            <label className="auth-field">
              <span>{t.email}</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setVerificationEmail("");
                  setError("");
                  setSuccessMessage("");
                }}
                maxLength={320}
                required
              />
            </label>

            <label className="auth-field">
              <span>{t.password}</span>
              <input
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
              {isRegister && (
                <small className="auth-hint">{t.passwordHint}</small>
              )}
            </label>

            {!isRegister && (
              <p className="auth-switch">
                <Link href="/forgot-password">{locale === "ar" ? "نسيت كلمة المرور؟" : "Forgot password?"}</Link>
              </p>
            )}

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            {error === t.verificationEmailError && verificationEmail && (
              <button className="auth-language" type="button" onClick={() => void handleResendVerification()} disabled={resendingVerification || loading}>
                {resendingVerification ? t.loading : t.resendVerification}
              </button>
            )}

            {successMessage && (
              <p className="auth-success" role="status">
                {successMessage}
              </p>
            )}

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? t.loading : isRegister ? t.register : t.login}
              <span aria-hidden="true">↗</span>
            </button>
          </form>

          <p className="auth-switch">
            {isRegister ? t.hasAccount : t.noAccount}{" "}
            <Link href={isRegister ? "/login" : "/register"}>
              {isRegister ? t.enter : t.create}
            </Link>
          </p>

          <Link href="/" className="auth-home">
            {t.home}
          </Link>
        </div>

        <footer className="auth-footer">
          WASLA · A global platform for commerce and business
        </footer>
      </section>

      <aside className="auth-aside">
        <div className="auth-aside-orbit auth-aside-orbit-one" />
        <div className="auth-aside-orbit auth-aside-orbit-two" />

        <div className="auth-aside-center">
          <span>W</span>
          <strong>WASLA</strong>
          <small>ONE IDENTITY. GLOBAL OPPORTUNITIES.</small>
        </div>
      </aside>
    </main>
  );
}
