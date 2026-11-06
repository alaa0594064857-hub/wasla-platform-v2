"use client";

import { useEffect, useState, type FormEvent, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../../components/locale-provider";

type Plan = {
  id: string; code: string; name_ar: string; name_en: string;
  description_ar: string | null; description_en: string | null;
  amount: string; currency: string; billing_interval: "month" | "year" | "one_time";
  interval_count: number; trial_days: number; entitlements: Record<string, unknown>;
  is_active: boolean; is_public: boolean; sort_order: number;
};

export default function OwnerSubscriptionsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [amount, setAmount] = useState("0");
  const [currency, setCurrency] = useState("USD");
  const [interval, setInterval] = useState<"month" | "year" | "one_time">("month");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");

  const copy = ar ? {
    title: "إدارة خطط العضوية", subtitle: "إنشاء الخطط وإدارة ظهورها في الكتالوج العام.",
    back: "العودة لمركز المالك", loading: "جارٍ التحقق من الصلاحيات...",
    denied: "هذه الصفحة مخصصة لمالك المنصة.", code: "رمز الخطة",
    nameAr: "اسم الخطة بالعربية", nameEn: "اسم الخطة بالإنجليزية",
    descriptionAr: "الوصف بالعربية", descriptionEn: "الوصف بالإنجليزية",
    amount: "السعر", currency: "العملة", interval: "دورة الفوترة",
    month: "شهري", year: "سنوي", one_time: "دفعة واحدة",
    create: "إنشاء الخطة", saving: "جارٍ الحفظ...", plans: "الخطط الحالية",
    empty: "لا توجد خطط بعد. لم ننشئ أسعاراً افتراضية.",
    inactive: "غير مفعّلة", private: "غير منشورة", public: "منشورة للعامة",
    activate: "تفعيل ونشر", deactivate: "إيقاف وإخفاء",
    billingOff: "تحصيل المدفوعات غير مفعّل. هذه الصفحة تدير بيانات الخطط فقط.",
    loadError: "تعذر تحميل الخطط.", saveError: "تعذر حفظ الخطة. تحقق من الرمز والحقول.",
    saved: "تم حفظ الخطة.", amountNote: "استخدم السعر والعملة المعتمدين بعد اتخاذ قرار التسعير."
  } : {
    title: "Subscription plan administration", subtitle: "Create plans and control their public catalogue visibility.",
    back: "Back to owner center", loading: "Checking permissions...",
    denied: "This page is restricted to the platform owner.", code: "Plan code",
    nameAr: "Arabic plan name", nameEn: "English plan name",
    descriptionAr: "Arabic description", descriptionEn: "English description",
    amount: "Price", currency: "Currency", interval: "Billing interval",
    month: "Monthly", year: "Yearly", one_time: "One-time",
    create: "Create plan", saving: "Saving...", plans: "Current plans",
    empty: "No plans yet. No default prices have been invented.",
    inactive: "Inactive", private: "Unpublished", public: "Public",
    activate: "Activate & publish", deactivate: "Deactivate & hide",
    billingOff: "Payment collection is disabled. This page only manages plan records.",
    loadError: "Could not load plans.", saveError: "Could not save the plan. Check the code and fields.",
    saved: "Plan saved.", amountNote: "Use an approved price and currency once pricing is decided."
  };

  async function loadPlans() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/platform/subscription-plans", { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("load");
      setPlans(Array.isArray(data.plans) ? data.plans : []);
    } catch { setError(copy.loadError); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) { router.replace("/login"); return; }
    let active = true;
    fetch("/api/platform/security", { credentials: "include", cache: "no-store" })
      .then(async response => {
        if (response.status === 401) { router.replace("/login"); return null; }
        if (!response.ok) throw new Error("access");
        return response.json();
      })
      .then(data => {
        if (!active) return;
        const ok = Boolean(data?.success && data.platformAccess?.roles?.includes("platform_owner") && data.platformAccess?.permissions?.includes("platform.manage"));
        setAuthorized(ok);
        if (ok) void loadPlans();
      })
      .catch(() => { if (active) setAuthorized(false); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [isPending, session?.user?.id]);

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/platform/subscription-plans", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toLowerCase(), nameAr: nameAr.trim(), nameEn: nameEn.trim(),
          descriptionAr: descriptionAr.trim() || null, descriptionEn: descriptionEn.trim() || null,
          amount: Number(amount), currency: currency.trim().toUpperCase(), billingInterval: interval,
          intervalCount: 1, trialDays: 0, entitlements: {}, isActive: false, isPublic: false, sortOrder: plans.length
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("save");
      setCode(""); setNameAr(""); setNameEn(""); setDescriptionAr(""); setDescriptionEn(""); setAmount("0");
      await loadPlans();
      setError(copy.saved);
    } catch { setError(copy.saveError); }
    finally { setSaving(false); }
  }

  async function togglePlan(plan: Plan) {
    setError("");
    try {
      const activate = !(plan.is_active && plan.is_public);
      const response = await fetch(`/api/platform/subscription-plans/${plan.id}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: activate, isPublic: activate })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("update");
      await loadPlans();
    } catch { setError(copy.saveError); }
  }

  if (isPending || checking) return <main style={styles.shell} dir={ar ? "rtl" : "ltr"}>{copy.loading}</main>;
  if (!authorized) return <main style={styles.shell} dir={ar ? "rtl" : "ltr"}><h1>{copy.denied}</h1><Link href="/owner">{copy.back}</Link></main>;

  return <main style={styles.shell} dir={ar ? "rtl" : "ltr"} lang={locale}>
    <header style={styles.header}><div><Link href="/owner" style={styles.back}>← {copy.back}</Link><h1>{copy.title}</h1><p>{copy.subtitle}</p></div><span style={styles.off}>BILLING OFF</span></header>
    <section style={styles.notice}>{copy.billingOff}</section>
    <section style={styles.panel}>
      <h2>{copy.create}</h2>
      <form onSubmit={createPlan} style={styles.form}>
        <label>{copy.code}<input style={styles.input} required minLength={2} maxLength={80} pattern="[a-z0-9][a-z0-9_-]+" value={code} onChange={e => setCode(e.target.value)} placeholder="starter_monthly" /></label>
        <label>{copy.nameAr}<input style={styles.input} required maxLength={160} value={nameAr} onChange={e => setNameAr(e.target.value)} /></label>
        <label>{copy.nameEn}<input style={styles.input} required maxLength={160} value={nameEn} onChange={e => setNameEn(e.target.value)} /></label>
        <label>{copy.amount}<input style={styles.input} required type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>{copy.currency}<input style={styles.input} required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} /></label>
        <label>{copy.interval}<select style={styles.input} value={interval} onChange={e => setInterval(e.target.value as typeof interval)}><option value="month">{copy.month}</option><option value="year">{copy.year}</option><option value="one_time">{copy.one_time}</option></select></label>
        <label>{copy.descriptionAr}<textarea style={styles.input} rows={3} maxLength={5000} value={descriptionAr} onChange={e => setDescriptionAr(e.target.value)} /></label>
        <label>{copy.descriptionEn}<textarea style={styles.input} rows={3} maxLength={5000} value={descriptionEn} onChange={e => setDescriptionEn(e.target.value)} /></label>
        <button type="submit" style={styles.button} disabled={saving}>{saving ? copy.saving : copy.create}</button>
      </form>
      <p style={styles.hint}>{copy.amountNote}</p>
      {error && <p role="status" style={styles.feedback}>{error}</p>}
    </section>
    <section style={styles.panel}>
      <h2>{copy.plans}</h2>
      {loading ? <p>…</p> : plans.length === 0 ? <p>{copy.empty}</p> : <div style={styles.list}>{plans.map(plan => <article key={plan.id} style={styles.plan}>
        <div><strong>{ar ? plan.name_ar : plan.name_en}</strong><small>{plan.code} · {plan.amount} {plan.currency} / {plan.billing_interval}</small><p>{ar ? plan.description_ar : plan.description_en}</p></div>
        <div style={styles.planSide}><span>{plan.is_active ? (ar ? "مفعّلة" : "ACTIVE") : copy.inactive}</span><span>{plan.is_public ? copy.public : copy.private}</span><button type="button" style={styles.button} onClick={() => void togglePlan(plan)}>{plan.is_active && plan.is_public ? copy.deactivate : copy.activate}</button></div>
      </article>)}</div>}
    </section>
  </main>;
}

const styles: Record<string, CSSProperties> = {
  shell: { minHeight: "100vh", padding: "32px clamp(18px, 5vw, 64px)", background: "#f5f1e8", color: "#17253a", fontFamily: "Arial, sans-serif" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, marginBottom: 24 },
  back: { color: "#9a742d", textDecoration: "none", fontWeight: 700 },
  off: { background: "#e8e0d1", padding: "9px 13px", borderRadius: 20, fontSize: 12, fontWeight: 800 },
  notice: { padding: 16, border: "1px solid #d8c9a8", borderRadius: 12, marginBottom: 20, background: "#fffaf0" },
  panel: { background: "#fff", border: "1px solid #e4dfd4", borderRadius: 16, padding: 22, marginBottom: 20, boxShadow: "0 8px 24px rgba(23,37,58,.04)" },
  form: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 },
  label: { display: "grid", gap: 7, fontSize: 13, fontWeight: 700 },
  hint: { color: "#6b7280", fontSize: 13 },
  feedback: { fontWeight: 700, color: "#8a5b1b" },
  list: { display: "grid", gap: 12 },
  plan: { display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap", border: "1px solid #e7e2d8", borderRadius: 12, padding: 16 },
  planSide: { display: "grid", gap: 7, justifyItems: "start", fontSize: 12 },
  button: { border: 0, borderRadius: 8, padding: "10px 14px", background: "#17253a", color: "#fff", fontWeight: 700, cursor: "pointer" }
};
