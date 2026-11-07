"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import WorkspaceHeader from "@/components/workspace-header";

type Plan = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  amount: string;
  currency: string;
  billing_interval: "month" | "year" | "one_time";
  interval_count: number;
  trial_days: number;
};

export default function PlansPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/subscription-plans", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("plans");
        const data = await response.json();
        if (!data.success || !Array.isArray(data.plans)) throw new Error("plans");
        if (active) setPlans(data.plans);
      })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const interval = (plan: Plan) => {
    if (plan.billing_interval === "one_time") return ar ? "دفعة واحدة" : "one-time";
    const unit = plan.billing_interval === "year" ? (ar ? "سنة" : "year") : (ar ? "شهر" : "month");
    return plan.interval_count > 1
      ? (ar ? `كل ${plan.interval_count} ${unit}` : `every ${plan.interval_count} ${unit}s`)
      : (ar ? `شهرياً` : `per ${unit}`);
  };

  const money = (plan: Plan) => {
    const amount = Number(plan.amount);
    if (!Number.isFinite(amount)) return "—";
    try {
      return new Intl.NumberFormat(ar ? "ar" : "en", {
        style: "currency", currency: plan.currency, maximumFractionDigits: 2,
      }).format(amount);
    } catch { return `${amount.toFixed(2)} ${plan.currency}`; }
  };

  return <main dir={ar ? "rtl" : "ltr"} lang={locale} style={{ minHeight: "100vh", background: "#f7f4ed", color: "#263448" }}>
    <WorkspaceHeader />
    <div style={{ width: "min(1120px, calc(100% - 32px))", margin: "0 auto", padding: "34px 0 64px" }}>
      <Link href="/" style={{ color: "#9b783d", textDecoration: "none", fontWeight: 700 }}>← {ar ? "الرئيسية" : "Home"}</Link>
      <div style={{ marginTop: 26, maxWidth: 760 }}>
        <div style={{ color: "#9b783d", fontSize: 12, fontWeight: 800, letterSpacing: ".14em" }}>WASLA MEMBERSHIPS</div>
        <h1 style={{ color: "#14243a", fontSize: "clamp(30px, 5vw, 44px)", margin: "8px 0 12px" }}>{ar ? "خطط العضوية" : "Membership plans"}</h1>
        <p style={{ lineHeight: 1.9, margin: 0 }}>{ar ? "تعرف على خطط العضوية التي تنشرها WASLA للشركات والمتاجر." : "Explore the membership plans published by WASLA for businesses and stores."}</p>
      </div>

      <div style={{ marginTop: 26, padding: "13px 16px", borderRadius: 12, border: "1px solid rgba(177,141,77,.4)", background: "rgba(223,197,143,.18)", color: "#765a2f", lineHeight: 1.8 }}>
        {ar ? "ملاحظة: عرض الخطط للمعاينة فقط حالياً. الاشتراك والدفع الإلكتروني غير مفعّلين بعد." : "Note: Plans are shown for preview only. Subscription enrollment and online payments are not enabled yet."}
      </div>

      {loading ? <p style={{ marginTop: 28 }}>{ar ? "جارٍ تحميل الخطط..." : "Loading plans..."}</p> :
       failed ? <p role="alert" style={{ marginTop: 28, color: "#a33d3d" }}>{ar ? "تعذر تحميل الخطط حالياً." : "Plans could not be loaded right now."}</p> :
       plans.length === 0 ? <section style={{ marginTop: 28, padding: 28, borderRadius: 16, background: "#fff", border: "1px solid rgba(115,128,146,.2)" }}>
         <h2 style={{ color: "#14243a", marginTop: 0 }}>{ar ? "لا توجد خطط منشورة حالياً" : "No plans published yet"}</h2>
         <p style={{ lineHeight: 1.8, marginBottom: 0 }}>{ar ? "سيتم عرض الخطط هنا بعد اعتمادها ونشرها من إدارة المنصة. لن نعرض أسعاراً أو تجارب غير معتمدة." : "Plans will appear here once approved and published by platform management. We will not show unapproved prices or trials."}</p>
       </section> :
       <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 270px), 1fr))", gap: 16, marginTop: 28 }}>
         {plans.map(plan => <article key={plan.id} style={{ background: "#fff", border: "1px solid rgba(115,128,146,.22)", borderRadius: 16, padding: 22, boxShadow: "0 8px 26px rgba(16,30,48,.05)" }}>
           <h2 style={{ color: "#14243a", margin: "0 0 8px" }}>{ar ? plan.name_ar : plan.name_en}</h2>
           <div style={{ color: "#9b783d", fontSize: 28, fontWeight: 800 }}>{money(plan)}</div>
           <div style={{ color: "#738092", marginTop: 3 }}>{interval(plan)}</div>
           {(ar ? plan.description_ar : plan.description_en) && <p style={{ lineHeight: 1.8 }}>{ar ? plan.description_ar : plan.description_en}</p>}
           {plan.trial_days > 0 && <p style={{ color: "#26734a" }}>{ar ? `فترة تجريبية: ${plan.trial_days} يوم` : `${plan.trial_days}-day trial`}</p>}
         </article>)}
       </div>}
      <p style={{ marginTop: 34, color: "#738092", fontSize: 13, lineHeight: 1.8 }}>{ar ? "ستُعلن آلية الاشتراك وشروطه بعد اعتماد مزود الدفع والسياسات القانونية للأسواق المستهدفة." : "Enrollment terms will be announced after the payment provider and legal policies for target markets are approved."}</p>
    </div>
  </main>;
}
