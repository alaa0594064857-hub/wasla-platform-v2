"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "@/components/locale-provider";

type Product = { id: string; title: string; status: string; stockQuantity: number; price: string; currency: string };
type Program = { id: string; name: string; description: string | null; commissionBps: number; status: string; productCount: number; pendingApplications: number };
type Application = { id: string; status: string; message: string | null; programId: string; programName: string; affiliateStoreName: string; affiliateStoreSlug: string };
type Earning = { currency: string; netPending: string };
type Membership = { id: string; status: string; programId: string; programName: string; description: string | null; commissionBps: number; programStatus: string; merchantStoreName: string; merchantStoreSlug: string; hasActiveLink: boolean };

export default function StoreAffiliateManagementPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [products, setProducts] = useState<Product[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [totals, setTotals] = useState<Earning[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [commission, setCommission] = useState("10");
  const [selected, setSelected] = useState<string[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const t = ar ? {
    title: "التسويق بالعمولة بين المتاجر", subtitle: "أنشئ برنامجاً لمتجرك، واسمح للمتاجر الأخرى بالترويج لمنتجاتك مقابل عمولة واضحة.",
    back: "العودة للمتجر", create: "إنشاء برنامج", name: "اسم البرنامج", description: "الوصف والشروط المختصرة",
    rate: "نسبة العمولة %", products: "المنتجات المؤهلة", noProducts: "لا توجد منتجات منشورة ومتوفرة حالياً.",
    draft: "مسودة", active: "نشط", paused: "متوقف", closed: "مغلق", save: "حفظ كمسودة", loading: "جارٍ تحميل بيانات العمولة...",
    programs: "برامج متجرك", noPrograms: "لم تنشئ أي برنامج بعد.", activate: "تفعيل البرنامج", pause: "إيقاف مؤقت",
    applications: "طلبات الانضمام إلى متجرك", noApplications: "لا توجد طلبات انضمام حالياً.", approve: "موافقة", reject: "رفض",
    joinedPrograms: "البرامج التي انضم إليها متجرك", noMemberships: "لم تنضم إلى أي برنامج بعد.", merchantProgram: "برنامج التاجر",
    affiliateStore: "المتجر المسوّق", copyLink: "إنشاء ونسخ رابط التسويق", linkCopied: "تم إنشاء الرابط. انسخه وشاركه.",
    earnings: "سجل العمولات", noEarnings: "لا توجد عمولات مسجلة بعد.", pending: "مبالغ معلّقة حسب الطلبات",
    safety: "العمولات هنا سجلات داخلية تقديرية مرتبطة بالطلبات. لا تحتفظ وصلة بأموال البيع ولا توفر سحباً آلياً في هذه المرحلة. تُعكس العمولة عند رفض الطلب أو إلغائه أو استلام المرتجع.",
    terms: "عند التفعيل، أؤكد أن نسبة العمولة والمنتجات والشروط المعروضة صحيحة وواضحة.",
    error: "تعذر تحميل البيانات أو حفظ التغيير. تحقق من صلاحية إدارة المتجر ثم حاول مجدداً."
  } : {
    title: "Store-to-store affiliate marketing", subtitle: "Create a program for your store and let other stores promote eligible products for a clear commission.",
    back: "Back to store", create: "Create program", name: "Program name", description: "Short description and terms",
    rate: "Commission rate %", products: "Eligible products", noProducts: "No published, in-stock products are available yet.",
    draft: "Draft", active: "Active", paused: "Paused", closed: "Closed", save: "Save as draft", loading: "Loading affiliate data...",
    programs: "Your programs", noPrograms: "You have not created a program yet.", activate: "Activate program", pause: "Pause",
    applications: "Applications to your store", noApplications: "No applications yet.", approve: "Approve", reject: "Reject",
    joinedPrograms: "Programs your store joined", noMemberships: "Your store has not joined any programs yet.", merchantProgram: "Merchant program",
    affiliateStore: "Affiliate store", copyLink: "Generate and copy referral link", linkCopied: "Referral link generated. Copy and share it.",
    earnings: "Commission activity", noEarnings: "No commission records yet.", pending: "Pending amounts by currency",
    safety: "These are internal estimated commission records tied to orders. WASLA does not hold sale funds or offer automatic withdrawals in this phase. Commission is reversed for rejected/cancelled orders or received returns.",
    terms: "I confirm the commission rate, eligible products and displayed terms are accurate and clear.",
    error: "Could not load data or save the change. Check store permissions and try again."
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productResponse, programResponse, applicationResponse, earningResponse, membershipResponse] = await Promise.all([
        fetch("/api/stores/" + encodeURIComponent(slug) + "/products", { credentials: "include", cache: "no-store" }),
        fetch("/api/stores/" + encodeURIComponent(slug) + "/affiliate-programs", { credentials: "include", cache: "no-store" }),
        fetch("/api/stores/" + encodeURIComponent(slug) + "/affiliate-applications", { credentials: "include", cache: "no-store" }),
        fetch("/api/stores/" + encodeURIComponent(slug) + "/affiliate-earnings", { credentials: "include", cache: "no-store" }),
        fetch("/api/stores/" + encodeURIComponent(slug) + "/affiliate-memberships", { credentials: "include", cache: "no-store" })
      ]);
      const [pd, pg, ap, er, ms] = await Promise.all([productResponse.json(), programResponse.json(), applicationResponse.json(), earningResponse.json(), membershipResponse.json()]);
      if (!productResponse.ok || !programResponse.ok || !applicationResponse.ok || !earningResponse.ok || !membershipResponse.ok ||
          !pd.success || !pg.success || !ap.success || !er.success || !ms.success) throw new Error("load");
      setProducts((Array.isArray(pd.products) ? pd.products : []).filter((p: Product) => p.status === "active" && Number(p.stockQuantity) > 0));
      setPrograms(Array.isArray(pg.programs) ? pg.programs : []);
      setApplications(Array.isArray(ap.applications) ? ap.applications : []);
      setTotals(Array.isArray(er.totals) ? er.totals : []);
      setMemberships(Array.isArray(ms.memberships) ? ms.memberships : []);
    } catch {
      setMessage(t.error);
    } finally { setLoading(false); }
  }, [slug, t.error]);

  useEffect(() => { void load(); }, [load]);

  async function createProgram() {
    const bps = Math.round(Number(commission) * 100);
    if (name.trim().length < 3 || !Number.isFinite(bps) || bps < 1 || bps > 5000 || selected.length < 1) {
      setMessage(ar ? "أدخل اسماً صحيحاً، ونسبة من 0.01% إلى 50%، واختر منتجاً واحداً على الأقل." : "Enter a name, a rate from 0.01% to 50%, and select at least one product.");
      return;
    }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/stores/" + encodeURIComponent(slug) + "/affiliate-programs", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), commissionBps: bps, productIds: selected })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("create");
      setName(""); setDescription(""); setCommission("10"); setSelected([]);
      setMessage(ar ? "تم حفظ البرنامج كمسودة. راجعه ثم فعّله." : "Program saved as a draft. Review it, then activate it.");
      await load();
    } catch { setMessage(t.error); } finally { setBusy(false); }
  }

  async function changeProgram(id: string, status: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/stores/" + encodeURIComponent(slug) + "/affiliate-programs/" + id, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, termsConfirmed: true })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("status");
      await load();
    } catch { setMessage(t.error); } finally { setBusy(false); }
  }

  async function reviewApplication(id: string, decision: "approve" | "reject") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/stores/" + encodeURIComponent(slug) + "/affiliate-applications/" + id, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("review");
      await load();
    } catch { setMessage(t.error); } finally { setBusy(false); }
  }

  async function issueLink(applicationId: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/affiliate-applications/" + applicationId + "/link", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}"
      });
      const data = await response.json();
      if (!response.ok || !data.success || typeof data.link?.relativeUrl !== "string") throw new Error("link");
      const absolute = window.location.origin + data.link.relativeUrl;
      setLinks(current => ({ ...current, [applicationId]: absolute }));
      try { await navigator.clipboard.writeText(absolute); } catch { /* The link remains visible for manual copying. */ }
      setMessage(t.linkCopied);
    } catch { setMessage(t.error); } finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#14233b]" dir={ar ? "rtl" : "ltr"}>
    <div className="mx-auto max-w-5xl space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#a47e37]">WASLA · وصلة</p><h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{t.title}</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{t.subtitle}</p></div>
        <Link href={"/business/store-preview/" + encodeURIComponent(slug)} className="rounded-xl border border-[#d8c69f] bg-white px-4 py-2 text-sm font-bold">{t.back}</Link>
      </header>
      <div className="rounded-2xl border border-[#d8c69f] bg-[#fffaf0] p-4 text-sm leading-7">{t.safety}</div>
      {message && <p role="status" className="rounded-xl bg-white p-3 text-sm">{message}</p>}
      <section className="rounded-2xl border border-[#e5dfd1] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold">{t.create}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">{t.name}<input value={name} onChange={e=>setName(e.target.value)} maxLength={120} className="mt-2 w-full rounded-lg border border-[#ddd5c4] px-3 py-2 font-normal" /></label>
          <label className="text-sm font-semibold">{t.rate}<input type="number" min="0.01" max="50" step="0.01" value={commission} onChange={e=>setCommission(e.target.value)} className="mt-2 w-full rounded-lg border border-[#ddd5c4] px-3 py-2 font-normal" /></label>
        </div>
        <label className="mt-4 block text-sm font-semibold">{t.description}<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={1200} rows={3} className="mt-2 w-full rounded-lg border border-[#ddd5c4] px-3 py-2 font-normal" /></label>
        <div className="mt-5"><h3 className="font-bold">{t.products}</h3>
          {products.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t.noProducts}</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {products.map(product=><label key={product.id} className="flex items-center gap-3 rounded-xl border border-[#eee8dc] p-3 text-sm">
              <input type="checkbox" checked={selected.includes(product.id)} onChange={e=>setSelected(current=>e.target.checked?[...current,product.id]:current.filter(id=>id!==product.id))} />
              <span className="min-w-0 flex-1"><span className="block font-semibold">{product.title}</span><span className="text-xs text-slate-500">{product.price} {product.currency} · {product.stockQuantity}</span></span>
            </label>)}
          </div>}
        </div>
        <button type="button" disabled={busy || products.length===0} onClick={()=>void createProgram()} className="mt-5 rounded-xl bg-[#14233b] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{t.save}</button>
      </section>
      <section className="rounded-2xl border border-[#e5dfd1] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold">{t.programs}</h2>
        {loading ? <p className="mt-4 text-sm text-slate-500">{t.loading}</p> : programs.length===0 ? <p className="mt-4 text-sm text-slate-500">{t.noPrograms}</p> : <div className="mt-4 space-y-3">
          {programs.map(program=><article key={program.id} className="rounded-xl border border-[#eee8dc] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{program.name}</h3><p className="mt-1 text-sm text-slate-600">{program.description}</p><p className="mt-2 text-xs text-slate-500">{(program.commissionBps/100).toFixed(2)}% · {program.productCount} {t.products} · {program.pendingApplications} {t.applications}</p></div><span className="rounded-full bg-[#f4efe3] px-3 py-1 text-xs font-bold">{t[program.status as keyof typeof t] ?? program.status}</span></div>
            <div className="mt-3 flex flex-wrap gap-2">
              {program.status==="draft" && <button disabled={busy} onClick={()=>void changeProgram(program.id,"active")} className="rounded-lg bg-[#14233b] px-3 py-2 text-xs font-bold text-white">{t.activate}</button>}
              {program.status==="active" && <button disabled={busy} onClick={()=>void changeProgram(program.id,"paused")} className="rounded-lg border border-[#d8c69f] px-3 py-2 text-xs font-bold">{t.pause}</button>}
              {program.status==="paused" && <button disabled={busy} onClick={()=>void changeProgram(program.id,"active")} className="rounded-lg bg-[#14233b] px-3 py-2 text-xs font-bold text-white">{t.activate}</button>}
            </div>
          </article>)}
        </div>}
      </section>
      <section className="rounded-2xl border border-[#e5dfd1] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold">{t.applications}</h2>
        {applications.length===0 ? <p className="mt-4 text-sm text-slate-500">{t.noApplications}</p> : <div className="mt-4 space-y-3">
          {applications.map(application=><article key={application.id} className="rounded-xl border border-[#eee8dc] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{application.affiliateStoreName}</h3><p className="text-sm text-slate-500">{application.programName} · {application.status}</p>{application.message && <p className="mt-2 text-sm">{application.message}</p>}</div>
              {application.status==="pending" && <div className="flex gap-2"><button disabled={busy} onClick={()=>void reviewApplication(application.id,"approve")} className="rounded-lg bg-[#14233b] px-3 py-2 text-xs font-bold text-white">{t.approve}</button><button disabled={busy} onClick={()=>void reviewApplication(application.id,"reject")} className="rounded-lg border px-3 py-2 text-xs font-bold">{t.reject}</button></div>}
            </div>
          </article>)}
        </div>}
      </section>
      <section className="rounded-2xl border border-[#e5dfd1] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold">{t.joinedPrograms}</h2>
        {memberships.length===0 ? <p className="mt-4 text-sm text-slate-500">{t.noMemberships}</p> : <div className="mt-4 space-y-3">
          {memberships.map(membership=><article key={membership.id} className="rounded-xl border border-[#eee8dc] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{membership.programName}</h3><p className="mt-1 text-sm text-slate-500">{t.merchantProgram}: {membership.merchantStoreName}</p><p className="mt-1 text-xs text-slate-500">{(membership.commissionBps/100).toFixed(2)}% · {membership.status} · {membership.programStatus}</p></div>
              {membership.status==="approved" && membership.programStatus==="active" && <button disabled={busy} onClick={()=>void issueLink(membership.id)} className="rounded-lg border border-[#d8c69f] px-3 py-2 text-xs font-bold">{t.copyLink}</button>}
            </div>
            {links[membership.id] && <input readOnly value={links[membership.id]} onFocus={e=>e.currentTarget.select()} className="mt-3 block w-full rounded-lg border border-[#ddd5c4] px-3 py-2 text-xs" />}
          </article>)}
        </div>}
      </section>
      <section className="rounded-2xl border border-[#e5dfd1] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold">{t.earnings}</h2><p className="mt-1 text-xs text-slate-500">{t.pending}</p>
        {totals.length===0 ? <p className="mt-4 text-sm text-slate-500">{t.noEarnings}</p> : <div className="mt-4 flex flex-wrap gap-3">{totals.map(item=><div key={item.currency} className="rounded-xl bg-[#f7f4ec] px-4 py-3"><p className="text-xs text-slate-500">{item.currency}</p><p className="mt-1 text-xl font-extrabold">{item.netPending}</p></div>)}</div>}
      </section>
    </div>
  </main>;
}
