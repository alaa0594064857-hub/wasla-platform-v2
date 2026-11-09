"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/components/locale-provider";

type Policy = {
  acceptsReturns: boolean;
  acceptsExchanges: boolean;
  requestWindowDays: number;
  itemConditionsAr: string;
  itemConditionsEn: string;
  exclusionsAr: string;
  exclusionsEn: string;
  buyerInstructionsAr: string;
  buyerInstructionsEn: string;
  contactInstructionsAr: string;
  contactInstructionsEn: string;
};

const emptyPolicy: Policy = {
  acceptsReturns: true, acceptsExchanges: true, requestWindowDays: 14,
  itemConditionsAr: "", itemConditionsEn: "", exclusionsAr: "", exclusionsEn: "",
  buyerInstructionsAr: "", buyerInstructionsEn: "", contactInstructionsAr: "", contactInstructionsEn: "",
};

export default function StoreReturnPolicySettingsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [policy, setPolicy] = useState<Policy>(emptyPolicy);
  const [published, setPublished] = useState(false);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const t = {
    title: ar ? "سياسة الإرجاع والاستبدال" : "Returns & exchanges policy",
    intro: ar ? "أعدّ سياسة واضحة بالعربية والإنجليزية. تنطبق التعديلات الجديدة على الطلبات اللاحقة فقط." : "Set a clear policy in Arabic and English. New versions apply to future orders only.",
    back: ar ? "العودة إلى طلبات المتجر" : "Back to store orders",
    loading: ar ? "جارٍ تحميل إعدادات السياسة..." : "Loading policy settings...",
    denied: ar ? "هذه الصفحة متاحة لمالك المتجر أو العضو المخوّل بإدارة إعداداته." : "This page is available to the store owner or a member authorized to manage store settings.",
    returns: ar ? "قبول الإرجاع" : "Accept returns",
    exchanges: ar ? "قبول الاستبدال" : "Accept exchanges",
    days: ar ? "مهلة تقديم الطلب (بالأيام)" : "Request window (days)",
    conditions: ar ? "شروط حالة المنتج" : "Item condition requirements",
    exclusions: ar ? "الاستثناءات" : "Exclusions",
    buyer: ar ? "تعليمات المشتري" : "Buyer instructions",
    contact: ar ? "طريقة التواصل" : "Contact instructions",
    ar: "العربية", en: "English",
    save: ar ? "حفظ مسودة" : "Save draft",
    publish: ar ? "نشر السياسة" : "Publish policy",
    unpublish: ar ? "إلغاء نشر السياسة" : "Unpublish policy",
    published: ar ? "السياسة منشورة" : "Policy published",
    draft: ar ? "لم تُنشر السياسة بعد" : "Policy is not published",
    legal: ar ? "هذه السياسة لا تلغي أي حقوق إلزامية للمستهلك بموجب القانون المعمول به. طلب الإرجاع ليس استردادًا ماليًا تلقائيًا ولا يضمن الموافقة." : "This policy does not remove mandatory consumer rights under applicable law. A return request is not an automatic refund and does not guarantee approval.",
    saved: ar ? "تم حفظ المسودة." : "Draft saved.",
    publishedOk: ar ? "تم نشر السياسة." : "Policy published.",
    unpublishedOk: ar ? "تم إلغاء نشر السياسة." : "Policy unpublished.",
    required: ar ? "تعذر تحميل السياسة أو لا تملك صلاحية الإدارة." : "Could not load policy or you do not have management permission.",
  };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(slug)}/return-policy/manage`, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("access");
      const latest = Array.isArray(data.versions) ? data.versions.find((v: { publicationStatus: string }) => v.publicationStatus === "draft") : null;
      const current = latest?.policy ?? data.publishedPolicy;
      if (current) setPolicy({ ...emptyPolicy, ...current });
      setPublished(Boolean(data.publishedPolicy));
      setVersion(data.publishedVersion ?? null);
    } catch { setError(t.required); }
    finally { setLoading(false); }
  }, [slug, t.required]);

  useEffect(() => { void load(); }, [load]);

  function update<K extends keyof Policy>(key: K, value: Policy[K]) {
    setPolicy(current => ({ ...current, [key]: value }));
  }

  async function action(kind: "save" | "publish" | "unpublish") {
    if (busy) return;
    setBusy(kind); setError(""); setMessage("");
    try {
      if (kind === "save") {
        const response = await fetch(`/api/stores/${encodeURIComponent(slug)}/return-policy/manage`, {
          method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ policy }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "save");
        setMessage(t.saved);
      } else {
        const response = await fetch(`/api/stores/${encodeURIComponent(slug)}/return-policy/${kind}`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}",
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || kind);
        setMessage(kind === "publish" ? t.publishedOk : t.unpublishedOk);
      }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : t.required); }
    finally { setBusy(""); }
  }

  const textField = (key: keyof Policy, label: string, multiline = true) => (
    <label className="block text-sm font-semibold">{label}
      {multiline
        ? <textarea rows={3} maxLength={1500} value={String(policy[key])} onChange={e => update(key, e.target.value)} className="mt-1 w-full rounded-xl border border-[#e5dfd1] bg-white p-3 font-normal" />
        : <input value={String(policy[key])} onChange={e => update(key, e.target.value)} maxLength={1500} className="mt-1 w-full rounded-xl border border-[#e5dfd1] bg-white p-3 font-normal" />}
    </label>
  );

  return <main className="min-h-screen bg-[#f7f4ec] text-[#14233b]" dir={ar ? "rtl" : "ltr"} lang={locale}>
    <header className="border-b border-[#e5dfd1] bg-white px-5 py-4"><Link href="/" className="font-bold">WASLA <span className="text-[#b89545]">وصلة</span></Link></header>
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href={`/store/${encodeURIComponent(slug)}/orders`} className="text-sm font-semibold text-[#9b792f] underline">{t.back}</Link>
      <h1 className="mt-5 text-3xl font-bold">{t.title}</h1>
      <p className="mt-2 leading-7 text-slate-600">{t.intro}</p>
      {loading ? <p className="mt-6 rounded-xl bg-white p-5">{t.loading}</p> : <>
        {error && <p role="alert" className="mt-4 rounded-xl bg-white p-4 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-xl bg-white p-4 text-sm">{message}</p>}
        <div className="mt-5 rounded-xl border border-[#d8bd79] bg-[#fff9eb] p-4 text-sm leading-7 text-[#765a2f]">{published ? t.published : t.draft}{version ? ` · v${version}` : ""}<p className="mt-2">{t.legal}</p></div>
        <section className="mt-6 space-y-5 rounded-2xl border border-[#e5dfd1] bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={policy.acceptsReturns} onChange={e => update("acceptsReturns", e.target.checked)} />{t.returns}</label>
            <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={policy.acceptsExchanges} onChange={e => update("acceptsExchanges", e.target.checked)} />{t.exchanges}</label>
          </div>
          <label className="block text-sm font-semibold">{t.days}<input type="number" min={1} max={365} value={policy.requestWindowDays} onChange={e => update("requestWindowDays", Number(e.target.value))} className="mt-1 block w-full rounded-xl border border-[#e5dfd1] p-3 sm:max-w-xs" /></label>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3"><h2 className="font-bold">{t.conditions} — {t.ar}</h2>{textField("itemConditionsAr", t.conditions)}</div>
            <div className="space-y-3"><h2 className="font-bold">{t.conditions} — {t.en}</h2>{textField("itemConditionsEn", t.conditions)}</div>
            <div className="space-y-3"><h2 className="font-bold">{t.exclusions} — {t.ar}</h2>{textField("exclusionsAr", t.exclusions)}</div>
            <div className="space-y-3"><h2 className="font-bold">{t.exclusions} — {t.en}</h2>{textField("exclusionsEn", t.exclusions)}</div>
            <div className="space-y-3"><h2 className="font-bold">{t.buyer} — {t.ar}</h2>{textField("buyerInstructionsAr", t.buyer)}</div>
            <div className="space-y-3"><h2 className="font-bold">{t.buyer} — {t.en}</h2>{textField("buyerInstructionsEn", t.buyer)}</div>
            <div className="space-y-3"><h2 className="font-bold">{t.contact} — {t.ar}</h2>{textField("contactInstructionsAr", t.contact)}</div>
            <div className="space-y-3"><h2 className="font-bold">{t.contact} — {t.en}</h2>{textField("contactInstructionsEn", t.contact)}</div>
          </div>
          <div className="flex flex-wrap gap-3 border-t border-[#eee8dc] pt-5">
            <button disabled={Boolean(busy)} onClick={() => void action("save")} className="rounded-xl bg-[#14233b] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy === "save" ? "…" : t.save}</button>
            <button disabled={Boolean(busy)} onClick={() => void action("publish")} className="rounded-xl bg-[#b89545] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy === "publish" ? "…" : t.publish}</button>
            {published && <button disabled={Boolean(busy)} onClick={() => void action("unpublish")} className="rounded-xl border border-red-700 px-5 py-3 text-sm font-bold text-red-700 disabled:opacity-50">{busy === "unpublish" ? "…" : t.unpublish}</button>}
          </div>
        </section>
      </>}
    </div>
  </main>;
}
