"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type Inquiry = {
  id: string; productId: string; productTitle: string; storeId: string;
  storeName: string; senderUserId: string; senderName: string; body: string;
  status: "new" | "replied" | "closed"; createdAt: string;
};
type Reply = { id: string; senderUserId: string; senderName?: string; body: string; createdAt: string };

export default function ProductInquiriesPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [items, setItems] = useState<Inquiry[]>([]);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const t = {
    title: ar ? "استفسارات المنتجات" : "Product inquiries",
    subtitle: ar ? "استقبل أسئلة المشترين ورد عليها بشكل منفصل عن الرسائل الخاصة." : "Receive and answer buyer questions separately from private messages.",
    empty: ar ? "لا توجد استفسارات حتى الآن." : "No product inquiries yet.",
    loading: ar ? "جارٍ تحميل الاستفسارات..." : "Loading inquiries...",
    refresh: ar ? "تحديث" : "Refresh",
    reply: ar ? "إرسال الرد" : "Send reply",
    placeholder: ar ? "اكتب ردك على الاستفسار..." : "Write your reply...",
    new: ar ? "جديد" : "New",
    replied: ar ? "تم الرد" : "Replied",
    closed: ar ? "مغلق" : "Closed",
    close: ar ? "إغلاق الاستفسار" : "Close inquiry",
    reopen: ar ? "إعادة فتح" : "Reopen",
    choose: ar ? "اختر استفساراً لعرض التفاصيل والردود." : "Choose an inquiry to view its details and replies.",
    sent: ar ? "تم إرسال الرد." : "Reply sent.",
    failed: ar ? "تعذر تنفيذ الطلب. حاول مرة أخرى." : "The request failed. Please try again.",
    product: ar ? "المنتج" : "Product",
    from: ar ? "من" : "From",
    conversation: ar ? "سجل الردود" : "Reply history",
  };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/product-inquiries", { credentials: "include", cache: "no-store" });
      if (res.status === 401) { router.replace("/login"); return; }
      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.inquiries)) throw new Error("load");
      setItems(data.inquiries as Inquiry[]);
    } catch { setError(t.failed); }
    finally { setLoading(false); }
  }, [router, t.failed]);

  const loadReplies = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/product-inquiries/${encodeURIComponent(id)}/replies`, { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.replies)) throw new Error("replies");
      setReplies(data.replies as Reply[]);
    } catch { setError(t.failed); }
  }, [t.failed]);

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) { router.replace("/login"); return; }
    void load();
  }, [isPending, session?.user?.id, router, load]);

  useEffect(() => {
    if (selected) void loadReplies(selected.id);
    else setReplies([]);
  }, [selected?.id, loadReplies]);

  async function sendReply() {
    if (!selected || draft.trim().length < 1 || busy || selected.status === "closed") return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/product-inquiries/${encodeURIComponent(selected.id)}/replies`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("reply");
      setDraft(""); setSelected({ ...selected, status: "replied" });
      await Promise.all([loadReplies(selected.id), load()]);
    } catch { setError(t.failed); }
    finally { setBusy(false); }
  }

  async function updateStatus(status: "new" | "replied" | "closed") {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/product-inquiries/${encodeURIComponent(selected.id)}/status`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("status");
      setSelected({ ...selected, status });
      await load();
    } catch { setError(t.failed); }
    finally { setBusy(false); }
  }

  const statusLabel = (status: Inquiry["status"]) => status === "new" ? t.new : status === "replied" ? t.replied : t.closed;

  return (
    <main className="min-h-screen bg-[#f7f4ec] text-[#14233b]" dir={ar ? "rtl" : "ltr"}>
      <WorkspaceHeader />
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-bold">{t.title}</h1><p className="mt-1 text-sm text-slate-600">{t.subtitle}</p></div>
          <button onClick={() => void load()} className="rounded-xl border border-[#d7c69a] px-4 py-2 text-sm font-semibold">{t.refresh}</button>
        </div>
        {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)]">
          <section className="overflow-hidden rounded-2xl border border-[#e5dfd1] bg-white">
            <div className="border-b border-[#eee8dc] px-4 py-3 font-semibold">{ar ? "الوارد" : "Inbox"} <span className="text-xs text-slate-500">({items.length})</span></div>
            {loading ? <p className="p-5 text-sm text-slate-500">{t.loading}</p> : items.length === 0 ? <p className="p-5 text-sm text-slate-500">{t.empty}</p> : (
              <div className="divide-y divide-[#eee8dc]">
                {items.map(item => <button key={item.id} onClick={() => setSelected(item)} className={`block w-full p-4 text-start transition hover:bg-[#faf8f2] ${selected?.id === item.id ? "bg-[#f8f3e6]" : ""}`}>
                  <div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{item.senderName || (ar ? "مشتري" : "Buyer")}</strong><span className="shrink-0 rounded-full bg-[#f2eee4] px-2 py-1 text-xs">{statusLabel(item.status)}</span></div>
                  <p className="mt-1 truncate text-sm text-slate-700">{item.productTitle}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.body}</p>
                  <p className="mt-2 text-[11px] text-slate-400">{new Date(item.createdAt).toLocaleString(ar ? "ar" : "en")}</p>
                </button>)}
              </div>
            )}
          </section>
          <section className="min-h-[420px] rounded-2xl border border-[#e5dfd1] bg-white p-4 sm:p-6">
            {!selected ? <div className="flex min-h-[380px] items-center justify-center text-center text-sm text-slate-500">{t.choose}</div> : <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eee8dc] pb-4">
                <div><h2 className="text-lg font-bold">{selected.productTitle}</h2><p className="mt-1 text-sm text-slate-500">{t.from}: {selected.senderName} · {selected.storeName}</p><p className="mt-1 text-xs text-slate-400">{new Date(selected.createdAt).toLocaleString(ar ? "ar" : "en")}</p></div>
                <span className="rounded-full bg-[#f2eee4] px-3 py-1 text-xs">{statusLabel(selected.status)}</span>
              </div>
              <div className="my-4 rounded-xl bg-[#faf8f2] p-4"><p className="mb-2 text-xs font-semibold text-slate-500">{t.product}</p><p className="whitespace-pre-wrap text-sm leading-7">{selected.body}</p></div>
              <h3 className="mb-3 text-sm font-bold">{t.conversation}</h3>
              <div className="mb-4 max-h-64 space-y-3 overflow-y-auto">
                {replies.length === 0 ? <p className="text-sm text-slate-400">{ar ? "لا توجد ردود بعد." : "No replies yet."}</p> : replies.map(reply => <div key={reply.id} className="rounded-xl border border-[#eee8dc] p-3"><p className="mb-1 text-xs font-semibold text-slate-500">{reply.senderName || (reply.senderUserId === session?.user?.id ? (ar ? "أنت" : "You") : selected.senderName)}</p><p className="whitespace-pre-wrap text-sm">{reply.body}</p><p className="mt-2 text-[11px] text-slate-400">{new Date(reply.createdAt).toLocaleString(ar ? "ar" : "en")}</p></div>)}
              </div>
              {selected.status !== "closed" && <div className="space-y-2"><textarea value={draft} onChange={e => setDraft(e.target.value)} maxLength={3000} rows={3} placeholder={t.placeholder} className="w-full rounded-xl border border-[#ddd5c5] p-3 text-sm outline-none focus:border-[#b89545]" /><button disabled={busy || !draft.trim()} onClick={() => void sendReply()} className="rounded-xl bg-[#14233b] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "..." : t.reply}</button></div>}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[#eee8dc] pt-4">
                {selected.status !== "closed" ? <button disabled={busy} onClick={() => void updateStatus("closed")} className="rounded-xl border border-[#d7c69a] px-4 py-2 text-xs font-semibold disabled:opacity-50">{t.close}</button> : <button disabled={busy} onClick={() => void updateStatus("new")} className="rounded-xl border border-[#d7c69a] px-4 py-2 text-xs font-semibold disabled:opacity-50">{t.reopen}</button>}
              </div>
            </>}
          </section>
        </div>
      </div>
    </main>
  );
}
