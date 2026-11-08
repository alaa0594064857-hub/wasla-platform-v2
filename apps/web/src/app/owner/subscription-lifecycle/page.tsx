"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../../components/locale-provider";

type Plan = { id: string; code: string; name_ar: string; name_en: string; amount: string; currency: string; billing_interval: string; trial_days: number; is_active: boolean };
type User = { id: string; name: string; email: string; status: string; email_verified: boolean };
type Subscription = {
  id: string; plan_code: string; name_ar: string; name_en: string; plan_amount: string; currency: string;
  billing_interval: string; customer_user_id: string | null; customer_email: string | null;
  customer_account_id: string | null; customer_account_name: string | null;
  status: string; current_period_start: string | null; current_period_end: string | null;
  trial_end: string | null; created_at: string;
};
type AuditEvent = { id: string; event_type: string; from_status: string | null; to_status: string; reason: string; evidence_url: string | null; created_at: string };

const nextStates: Record<string, string[]> = {
  pending: ["trialing", "active", "canceled"],
  trialing: ["active", "past_due", "paused", "canceled", "expired"],
  active: ["past_due", "paused", "canceled", "expired"],
  past_due: ["active", "paused", "canceled", "expired"],
  paused: ["active", "canceled", "expired"],
  canceled: [],
  expired: [],
};

export default function OwnerSubscriptionLifecyclePage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [planId, setPlanId] = useState("");
  const [userId, setUserId] = useState("");
  const [createReason, setCreateReason] = useState("");
  const [selectedStates, setSelectedStates] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<Record<string, AuditEvent[]>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const copy = ar ? {
    title: "إدارة الاشتراكات ودورة العضوية", subtitle: "إسناد اشتراك وإدارة حالته مع سجل تدقيق لكل إجراء.",
    back: "العودة لمركز المالك", loading: "جارٍ التحقق من الصلاحيات...",
    denied: "هذه الصفحة مخصصة لمالك المنصة.", create: "إسناد اشتراك لمستخدم",
    plan: "الخطة النشطة", user: "المستخدم", reason: "سبب الإجراء (إلزامي)",
    createButton: "إنشاء اشتراك بانتظار المراجعة", list: "الاشتراكات الحالية",
    empty: "لا توجد اشتراكات مسجلة. لا يتم إنشاء اشتراكات تلقائياً.",
    status: "الحالة", next: "الحالة الجديدة", evidence: "رابط إثبات الدفع HTTPS (للخطط المدفوعة)",
    save: "حفظ التغيير", history: "عرض سجل التدقيق", hideHistory: "إخفاء سجل التدقيق",
    noHistory: "لا توجد أحداث تدقيق.", billingOff: "تحصيل الأموال غير مفعّل. التفعيل اليدوي لا يعني أن WASLA استلمت المال؛ يلزم إثبات ومراجعة المالك.",
    noPlan: "لا توجد خطط نشطة. أنشئ خطة أولاً.", noUsers: "لا يوجد مستخدمون نشطون موثقو البريد.",
    saved: "تم حفظ التغيير.", created: "تم إنشاء الاشتراك بحالة انتظار.",
    loadError: "تعذر تحميل بيانات الاشتراكات.", saveError: "تعذر تنفيذ العملية. راجع البيانات والصلاحيات.",
    date: "التاريخ", reasonLabel: "السبب", proof: "الإثبات", from: "من", to: "إلى",
    individualOnly: "هذه الشاشة تسند اشتراكات للأفراد. دعم اشتراكات حسابات الشركات متاح عبر واجهة API ويحتاج واجهة مستقلة."
  } : {
    title: "Subscription lifecycle management", subtitle: "Assign subscriptions and manage their status with an audit trail for every action.",
    back: "Back to owner center", loading: "Checking permissions...",
    denied: "This page is restricted to the platform owner.", create: "Assign subscription to a user",
    plan: "Active plan", user: "User", reason: "Reason for action (required)",
    createButton: "Create pending subscription", list: "Current subscriptions",
    empty: "No subscriptions recorded. Subscriptions are never created automatically.",
    status: "Status", next: "New status", evidence: "HTTPS payment evidence URL (required for paid plans)",
    save: "Save change", history: "View audit history", hideHistory: "Hide audit history",
    noHistory: "No audit events.", billingOff: "Payment collection is disabled. Manual activation does not mean WASLA received money; owner review and evidence are required.",
    noPlan: "No active plans. Create a plan first.", noUsers: "No active users with verified email.",
    saved: "Change saved.", created: "Subscription created as pending.",
    loadError: "Could not load subscription data.", saveError: "Could not complete the action. Check the fields and permissions.",
    date: "Date", reasonLabel: "Reason", proof: "Evidence", from: "From", to: "To",
    individualOnly: "This screen assigns subscriptions to individual users. Business-account subscription assignment is available through the API and needs a separate interface."
  };

  async function loadAll() {
    const [p, u, s] = await Promise.all([
      fetch("/api/platform/subscription-plans", { credentials: "include", cache: "no-store" }),
      fetch("/api/platform/users?page=1&limit=100", { credentials: "include", cache: "no-store" }),
      fetch("/api/platform/subscriptions", { credentials: "include", cache: "no-store" })
    ]);
    const [pd, ud, sd] = await Promise.all([p.json(), u.json(), s.json()]);
    if (!p.ok || !pd.success || !u.ok || !ud.success || !s.ok || !sd.success) throw new Error("load");
    setPlans((pd.plans || []).filter((x: Plan) => x.is_active));
    setUsers((ud.users || []).filter((x: User) => x.status === "active" && x.email_verified));
    setSubscriptions(sd.subscriptions || []);
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
      .then(async data => {
        if (!active) return;
        const ok = Boolean(data?.success && data.platformAccess?.roles?.includes("platform_owner") && data.platformAccess?.permissions?.includes("platform.manage"));
        setAuthorized(ok);
        if (ok) await loadAll();
      })
      .catch(() => { if (active) setError(copy.loadError); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [isPending, session?.user?.id]);

  async function createSubscription(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create"); setError(""); setMessage("");
    try {
      const response = await fetch("/api/platform/subscriptions", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, customerUserId: userId, billingContactUserId: userId, reason: createReason })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "create");
      setCreateReason(""); await loadAll(); setMessage(copy.created);
    } catch { setError(copy.saveError); }
    finally { setBusy(""); }
  }

  async function updateSubscription(id: string) {
    const status = selectedStates[id];
    if (!status || !reasons[id]?.trim()) { setError(copy.saveError); return; }
    setBusy(id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/platform/subscriptions/" + id, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason: reasons[id], evidenceUrl: evidence[id] || "" })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "update");
      setReasons(v => ({ ...v, [id]: "" })); setEvidence(v => ({ ...v, [id]: "" }));
      await loadAll(); setMessage(copy.saved);
    } catch { setError(copy.saveError); }
    finally { setBusy(""); }
  }

  async function loadHistory(id: string) {
    if (events[id]) { setEvents(v => { const next = { ...v }; delete next[id]; return next; }); return; }
    try {
      const response = await fetch("/api/platform/subscriptions/" + id, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("history");
      setEvents(v => ({ ...v, [id]: data.events || [] }));
    } catch { setError(copy.loadError); }
  }

  if (isPending || checking) return <main style={styles.shell} dir={ar ? "rtl" : "ltr"}>{copy.loading}</main>;
  if (!authorized) return <main style={styles.shell} dir={ar ? "rtl" : "ltr"}><h1>{copy.denied}</h1><Link href="/owner">{copy.back}</Link></main>;

  return <main style={styles.shell} dir={ar ? "rtl" : "ltr"} lang={locale}>
    <header style={styles.header}><div><Link href="/owner" style={styles.back}>← {copy.back}</Link><h1>{copy.title}</h1><p>{copy.subtitle}</p></div><span style={styles.off}>BILLING OFF</span></header>
    <section style={styles.notice}>{copy.billingOff}</section>
    <section style={styles.notice}>{copy.individualOnly}</section>
    {error && <p role="alert" style={styles.error}>{error}</p>}
    {message && <p role="status" style={styles.success}>{message}</p>}
    <section style={styles.panel}>
      <h2>{copy.create}</h2>
      {plans.length === 0 ? <p>{copy.noPlan}</p> : users.length === 0 ? <p>{copy.noUsers}</p> : <form onSubmit={createSubscription} style={styles.form}>
        <label>{copy.plan}<select required value={planId} onChange={e => setPlanId(e.target.value)} style={styles.input}><option value="">—</option>{plans.map(p => <option key={p.id} value={p.id}>{ar ? p.name_ar : p.name_en} · {p.amount} {p.currency} · {p.billing_interval}</option>)}</select></label>
        <label>{copy.user}<select required value={userId} onChange={e => setUserId(e.target.value)} style={styles.input}><option value="">—</option>{users.map(u => <option key={u.id} value={u.id}>{u.name || u.email} · {u.email}</option>)}</select></label>
        <label style={styles.wide}>{copy.reason}<textarea required minLength={8} maxLength={2000} value={createReason} onChange={e => setCreateReason(e.target.value)} style={styles.input} rows={2}/></label>
        <button type="submit" disabled={busy === "create" || !planId || !userId} style={styles.button}>{busy === "create" ? "…" : copy.createButton}</button>
      </form>}
    </section>
    <section style={styles.panel}>
      <h2>{copy.list} ({subscriptions.length})</h2>
      {subscriptions.length === 0 ? <p>{copy.empty}</p> : <div style={styles.list}>{subscriptions.map(s => {
        const options = nextStates[s.status] || [];
        return <article key={s.id} style={styles.subscription}>
          <div style={styles.row}><strong>{ar ? s.name_ar : s.name_en} · {s.plan_amount} {s.currency}</strong><span style={styles.status}>{s.status}</span></div>
          <p>{s.customer_account_name || s.customer_email || s.customer_user_id || "—"}</p>
          <small>{s.plan_code} · {s.billing_interval} · {new Date(s.created_at).toLocaleString(locale)}</small>
          {options.length > 0 && <div style={styles.form}>
            <label>{copy.next}<select value={selectedStates[s.id] || ""} onChange={e => setSelectedStates(v => ({ ...v, [s.id]: e.target.value }))} style={styles.input}><option value="">—</option>{options.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
            <label>{copy.reason}<input value={reasons[s.id] || ""} onChange={e => setReasons(v => ({ ...v, [s.id]: e.target.value }))} minLength={8} maxLength={2000} style={styles.input}/></label>
            {selectedStates[s.id] === "active" && Number(s.plan_amount) > 0 && <label style={styles.wide}>{copy.evidence}<input type="url" value={evidence[s.id] || ""} onChange={e => setEvidence(v => ({ ...v, [s.id]: e.target.value }))} style={styles.input}/></label>}
            <button type="button" disabled={busy === s.id || !selectedStates[s.id] || (reasons[s.id] || "").trim().length < 8} onClick={() => void updateSubscription(s.id)} style={styles.button}>{busy === s.id ? "…" : copy.save}</button>
          </div>}
          <button type="button" onClick={() => void loadHistory(s.id)} style={styles.secondary}>{events[s.id] ? copy.hideHistory : copy.history}</button>
          {events[s.id] && <div style={styles.events}>{events[s.id].length === 0 ? <p>{copy.noHistory}</p> : events[s.id].map(e => <div key={e.id} style={styles.event}><strong>{e.event_type}</strong><small>{new Date(e.created_at).toLocaleString(locale)}</small><p>{copy.from}: {e.from_status || "—"} · {copy.to}: {e.to_status}</p><p>{copy.reasonLabel}: {e.reason}</p>{e.evidence_url && <p>{copy.proof}: <a href={e.evidence_url} target="_blank" rel="noreferrer">HTTPS</a></p>}</div>)}</div>}
        </article>;
      })}</div>}
    </section>
  </main>;
}

const styles: Record<string, React.CSSProperties> = {
  shell: { minHeight: "100vh", padding: "28px clamp(16px, 4vw, 56px)", background: "#f5f1e8", color: "#17253a", fontFamily: "Arial, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, marginBottom: 20, flexWrap: "wrap" },
  back: { color: "#9a742d", textDecoration: "none", fontWeight: 700 },
  off: { background: "#e8e0d1", padding: "9px 13px", borderRadius: 20, fontSize: 12, fontWeight: 800 },
  notice: { padding: 14, border: "1px solid #d8c9a8", borderRadius: 12, marginBottom: 14, background: "#fffaf0" },
  panel: { background: "#fff", border: "1px solid #e4dfd4", borderRadius: 16, padding: 20, marginBottom: 18 },
  form: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, alignItems: "end" },
  label: { display: "grid", gap: 7, fontSize: 13, fontWeight: 700 },
  wide: { gridColumn: "1 / -1" },
  input: { width: "100%", boxSizing: "border-box", padding: 10, border: "1px solid #d8d2c6", borderRadius: 8, background: "#fff", color: "#17253a" },
  button: { padding: "11px 14px", border: 0, borderRadius: 8, background: "#17253a", color: "#fff", fontWeight: 700, cursor: "pointer" },
  secondary: { padding: "9px 12px", border: "1px solid #cfc7b8", borderRadius: 8, background: "#fff", color: "#17253a", cursor: "pointer" },
  list: { display: "grid", gap: 12 },
  subscription: { display: "grid", gap: 10, padding: 16, border: "1px solid #e7e2d8", borderRadius: 12 },
  row: { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  status: { background: "#e8e0d1", padding: "4px 9px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  events: { display: "grid", gap: 8, paddingTop: 8 },
  event: { borderInlineStart: "3px solid #9a742d", padding: "8px 12px", background: "#faf8f3" },
  error: { color: "#963c36", background: "#f8e7e5", padding: 12, borderRadius: 8 },
  success: { color: "#24623c", background: "#e8f2e9", padding: 12, borderRadius: 8 }
};
