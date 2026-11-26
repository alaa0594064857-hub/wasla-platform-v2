"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../../components/locale-provider";

type BusinessAccount = {
  id: string; account_type: string; legal_name: string; display_name: string;
  status: string; country_code: string | null; created_at: string;
  verification_status: string | null; store_count: number; active_owner_count: number;
  description: string | null; website: string | null;
  contact_information: Record<string, unknown> | null;
};

export default function BusinessAccountReviewPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const ar = locale === "ar";
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [accounts, setAccounts] = useState<BusinessAccount[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setError("");
    const response = await fetch("/api/platform/business-accounts", {
      credentials: "include", cache: "no-store", signal,
    });
    const data = await response.json();
    if (!response.ok || !data.success || !Array.isArray(data.accounts)) throw new Error(data.error || "load-failed");
    if (!signal?.aborted) setAccounts(data.accounts);
  }, []);

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) { router.replace("/login"); return; }
    let active = true;
    const controller = new AbortController();
    fetch("/api/platform/security", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("restricted");
        return response.json();
      })
      .then(data => {
        if (!active) return;
        const ok = data?.success && data.platformAccess?.roles?.includes("platform_owner") &&
          data.platformAccess?.permissions?.includes("platform.manage");
        setAllowed(Boolean(ok));
        if (!ok) return;
        return load(controller.signal);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setError(ar ? "تعذر التحقق من صلاحيات المالك أو تحميل الحسابات." : "Could not verify owner access or load business accounts.");
        }
      })
      .finally(() => { if (active && !controller.signal.aborted) setChecking(false); });
    return () => { active = false; controller.abort(); };
  }, [isPending, session?.user?.id, router, ar, load]);

  async function decide(account: BusinessAccount, decision: "approve" | "reject") {
    const note = (notes[account.id] || "").trim();
    if (note.length < 20 || !confirmations[account.id]) {
      setError(ar ? "اكتب ملاحظة مراجعة من 20 حرفاً على الأقل وأكد أنك راجعت أدلة النشاط التجاري." : "Enter a review note of at least 20 characters and confirm that you reviewed the business evidence.");
      return;
    }
    setBusy(account.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/platform/business-accounts", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, decision, reviewNote: note, confirmReviewed: true }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "review-failed");
      setMessage(ar ? (decision === "approve" ? "تم اعتماد الحساب وتفعيله." : "تم تسجيل رفض التحقق.") : (decision === "approve" ? "Business account verified and activated." : "Verification rejection recorded."));
      await load();
      setNotes(v => ({ ...v, [account.id]: "" }));
      setConfirmations(v => ({ ...v, [account.id]: false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذر حفظ القرار." : "Could not save the decision."));
    } finally { setBusy(null); }
  }

  const pending = accounts.filter(a => a.status === "pending_verification");
  const active = accounts.filter(a => a.status === "active");
  const rejected = accounts.filter(a => a.verification_status === "rejected");
  const label = (value: string) => ({
    company: ar ? "شركة" : "Company", supplier: ar ? "مورد" : "Supplier",
    manufacturer: ar ? "مصنع" : "Manufacturer", trader: ar ? "تاجر" : "Trader",
    brand: ar ? "علامة تجارية" : "Brand", pending_verification: ar ? "بانتظار التحقق" : "Pending verification",
    active: ar ? "نشط" : "Active", suspended: ar ? "موقوف" : "Suspended",
    unverified: ar ? "غير موثّق" : "Unverified", verified: ar ? "موثّق" : "Verified",
    rejected: ar ? "مرفوض" : "Rejected", pending: ar ? "قيد المراجعة" : "Pending",
  } as Record<string, string>)[value] || value;

  if (isPending || checking) return <main style={styles.page}>{ar ? "جارٍ التحقق..." : "Checking access..."}</main>;
  if (!allowed) return <main style={styles.page}><h1>{ar ? "هذه الصفحة لمالك المنصة فقط" : "Platform owner access required"}</h1><Link href="/owner">{ar ? "العودة لمكتب المالك" : "Back to owner office"}</Link></main>;

  return <main dir={ar ? "rtl" : "ltr"} lang={locale} style={styles.page}>
    <div style={styles.wrap}>
      <Link href="/owner" style={styles.back}>← {ar ? "مكتب المالك" : "Owner office"}</Link>
      <div style={styles.kicker}>WASLA · OWNER REVIEW</div>
      <h1 style={styles.heading}>{ar ? "مراجعة حسابات الأعمال" : "Business account verification"}</h1>
      <p style={styles.intro}>{ar ? "راجع مستندات وهوية النشاط التجاري خارج المنصة أولاً. لا تعتمد حساباً إلا بعد التحقق الفعلي من البيانات والأدلة. كل قرار يُسجّل في سجل التدقيق." : "Review the business identity and supporting evidence outside the platform first. Approve only after validating the evidence. Every decision is recorded in the audit log."}</p>
      <div style={styles.stats}><div style={styles.stat}><strong>{pending.length}</strong><span>{ar ? "بانتظار المراجعة" : "Awaiting review"}</span></div><div style={styles.stat}><strong>{active.length}</strong><span>{ar ? "حسابات نشطة" : "Active accounts"}</span></div><div style={styles.stat}><strong>{accounts.length}</strong><span>{ar ? "إجمالي الحسابات" : "Total accounts"}</span></div></div>
      {error && <p role="alert" style={styles.error}>{error}</p>}
      {message && <p role="status" style={styles.success}>{message}</p>}
      <div style={styles.sectionHead}><h2>{ar ? "طلبات التحقق" : "Verification queue"}</h2><button style={styles.reload} onClick={() => void load().catch(() => setError(ar ? "تعذر تحديث قائمة الحسابات." : "Could not refresh the business account list."))}>{ar ? "تحديث" : "Refresh"}</button></div>
      {pending.length === 0 && <p style={styles.empty}>{ar ? "لا توجد حسابات بانتظار التحقق حالياً." : "No business accounts are waiting for verification."}</p>}
      {pending.map(account => <article key={account.id} style={styles.card}>
        <div style={styles.cardTop}><div><h3>{account.display_name}</h3><p>{account.legal_name}</p></div><span style={styles.pending}>{label(account.status)}</span></div>
        <div style={styles.meta}><span>{label(account.account_type)}</span><span>{account.country_code || (ar ? "الدولة غير محددة" : "Country not set")}</span><span>{ar ? "المتاجر" : "Stores"}: {account.store_count}</span><span>{ar ? "المالكون النشطون" : "Active owners"}: {account.active_owner_count}</span><span>{ar ? "التحقق" : "Verification"}: {label(account.verification_status || "unverified")}</span></div>
        <section style={styles.businessDetails} aria-label={ar ? "بيانات النشاط التجاري" : "Business details"}>
          <h4 style={styles.detailsHeading}>{ar ? "بيانات النشاط التجاري" : "Business details"}</h4>
          {account.description && <p style={styles.detailDescription}>{account.description}</p>}
          {account.website && <p style={styles.detailLine}>{ar ? "الموقع الإلكتروني" : "Website"}: <a href={account.website} target="_blank" rel="noopener noreferrer">{account.website}</a></p>}
          <div style={styles.contactGrid}>
            {typeof account.contact_information?.email === "string" && <p style={styles.contactItem}>{ar ? "البريد" : "Email"}: <a href={`mailto:${account.contact_information.email}`}>{account.contact_information.email}</a></p>}
            {typeof account.contact_information?.phone === "string" && <p style={styles.contactItem}>{ar ? "الهاتف" : "Phone"}: {account.contact_information.phone}</p>}
            {typeof account.contact_information?.whatsapp === "string" && <p style={styles.contactItem}>WhatsApp: {account.contact_information.whatsapp}</p>}
            {typeof account.contact_information?.city === "string" && <p style={styles.contactItem}>{ar ? "المدينة" : "City"}: {account.contact_information.city}</p>}
            {typeof account.contact_information?.address === "string" && <p style={styles.contactItem}>{ar ? "العنوان" : "Address"}: {account.contact_information.address}</p>}
          </div>
          {!account.description && !account.website && !Object.values(account.contact_information || {}).some(value => typeof value === "string" && value.trim()) && <p style={styles.missingDetails}>{ar ? "لم يقدّم النشاط وصفاً أو بيانات تواصل إضافية." : "No business description or additional contact details were provided."}</p>}
        </section>
        {account.active_owner_count < 1 && <p style={styles.error}>{ar ? "لا يوجد مالك نشط؛ يجب حل الملكية قبل المراجعة." : "No active account owner. Resolve ownership before review."}</p>}
        <label style={styles.fieldLabel}>{ar ? "ملاحظة المراجعة (سبب القرار والأدلة التي تم التحقق منها)" : "Review note (decision rationale and evidence checked)"}</label>
        <textarea value={notes[account.id] || ""} onChange={e => setNotes(v => ({ ...v, [account.id]: e.target.value }))} rows={3} maxLength={1000} style={styles.textarea} placeholder={ar ? "اكتب ملخصاً واضحاً للمستندات والتحقق..." : "Summarize the documents and checks performed..."} />
        <label style={styles.check}><input type="checkbox" checked={Boolean(confirmations[account.id])} onChange={e => setConfirmations(v => ({ ...v, [account.id]: e.target.checked }))} />{ar ? "أؤكد أنني راجعت هوية النشاط التجاري والأدلة الداعمة بنفسي." : "I confirm that I personally reviewed the business identity and supporting evidence."}</label>
        <div style={styles.actions}><button disabled={busy === account.id || account.active_owner_count < 1} onClick={() => void decide(account, "approve")} style={styles.approve}>{busy === account.id ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "اعتماد وتفعيل" : "Approve & activate")}</button><button disabled={busy === account.id} onClick={() => void decide(account, "reject")} style={styles.reject}>{ar ? "رفض التحقق" : "Reject verification"}</button></div>
      </article>)}
      <div style={styles.sectionHead}><h2>{ar ? "الحسابات المرفوضة" : "Rejected accounts"}</h2></div>
      {rejected.length === 0 && <p style={styles.empty}>{ar ? "لا توجد حسابات مرفوضة." : "No rejected accounts."}</p>}
      {rejected.map(account => <div key={account.id} style={styles.activeRow}><strong>{account.display_name}</strong><span>{label(account.account_type)} · {label(account.status)} · {label(account.verification_status || "unverified")}</span></div>)}
      <div style={styles.sectionHead}><h2>{ar ? "الحسابات النشطة" : "Active accounts"}</h2></div>
      {active.map(account => <div key={account.id} style={styles.activeRow}><strong>{account.display_name}</strong><span>{label(account.account_type)} · {label(account.verification_status || "unverified")}</span></div>)}
    </div>
  </main>;
}

const styles: Record<string, React.CSSProperties> = {
  page:{minHeight:"100vh",background:"#f7f4ed",color:"#263448",padding:"28px 16px 60px"},
  wrap:{width:"min(980px,100%)",margin:"0 auto"},
  back:{color:"#8b6c37",fontWeight:700,textDecoration:"none"},
  kicker:{marginTop:28,color:"#9b783d",fontSize:12,fontWeight:800,letterSpacing:".12em"},
  heading:{fontSize:"clamp(28px,5vw,42px)",color:"#14243a",margin:"8px 0"},
  intro:{lineHeight:1.8,maxWidth:800,color:"#586477"},
  stats:{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:12,margin:"24px 0"},
  sectionHead:{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:28},
  stat:{background:"#fff",border:"1px solid #e8e0d2",borderRadius:14,padding:16,display:"grid",gap:5},
  reload:{border:"1px solid #c6a15b",borderRadius:9,padding:"8px 12px",background:"#fff",color:"#14243a",fontWeight:700},
  card:{background:"#fff",border:"1px solid #e8e0d2",borderRadius:16,padding:18,marginTop:14,boxShadow:"0 8px 24px rgba(20,36,58,.05)"},
  cardTop:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"start"},
  pending:{background:"#f4ead5",color:"#765b2b",borderRadius:99,padding:"6px 10px",fontSize:12,fontWeight:800},
  meta:{display:"flex",flexWrap:"wrap",gap:8,margin:"12px 0 18px",fontSize:12,color:"#687386"},
  businessDetails:{background:"#faf8f3",border:"1px solid #eee7db",borderRadius:12,padding:14,margin:"0 0 18px"},
  detailsHeading:{margin:"0 0 8px",fontSize:14,color:"#14243a"},
  detailDescription:{margin:"0 0 8px",lineHeight:1.7,color:"#465469",whiteSpace:"pre-wrap"},
  detailLine:{margin:"6px 0",fontSize:13,overflowWrap:"anywhere"},
  contactGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:"4px 12px"},
  contactItem:{margin:"4px 0",fontSize:13,overflowWrap:"anywhere"},
  missingDetails:{margin:"6px 0 0",fontSize:12,color:"#8a6b35"},
  fieldLabel:{display:"block",fontWeight:700,marginBottom:8},
  textarea:{width:"100%",border:"1px solid #d8d1c5",borderRadius:10,padding:12,resize:"vertical",font:"inherit"},
  check:{display:"flex",gap:10,alignItems:"flex-start",margin:"14px 0",lineHeight:1.6,fontSize:13},
  actions:{display:"flex",flexWrap:"wrap",gap:10},
  approve:{background:"#14243a",color:"#fff",border:0,borderRadius:10,padding:"11px 16px",fontWeight:800},
  reject:{background:"#fff",color:"#9b3d35",border:"1px solid #d8aaa5",borderRadius:10,padding:"11px 16px",fontWeight:800},
  error:{background:"#f8e8e5",color:"#8d3028",padding:12,borderRadius:10},
  success:{background:"#e8f2e9",color:"#285b35",padding:12,borderRadius:10},
  empty:{background:"#fff",padding:18,borderRadius:12,color:"#697386"},
  activeRow:{display:"flex",justifyContent:"space-between",gap:12,background:"#fff",padding:14,borderRadius:10,marginTop:8},
};
