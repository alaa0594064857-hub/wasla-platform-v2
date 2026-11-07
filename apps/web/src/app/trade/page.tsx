"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type Account = { id: string; display_name: string; role: string };
type Deal = {
  id: string;
  initiatorAccountId: string;
  counterpartyAccountId: string;
  pendingResponseAccountId: string | null;
  title: string;
  description: string | null;
  currency: string;
  proposedAmount: string | null;
  status: string;
  initiatorName: string;
  counterpartyName: string;
  createdAt: string;
};
type BusinessResult = { id: string; display_name: string; account_type: string; country_code: string | null };

const statusLabels: Record<string, [string, string]> = {
  draft: ["مسودة", "Draft"],
  proposed: ["بانتظار الرد", "Awaiting response"],
  negotiating: ["قيد التفاوض", "Negotiating"],
  accepted: ["مقبولة", "Accepted"],
  declined: ["مرفوضة", "Declined"],
  cancelled: ["ملغاة", "Cancelled"],
  completed: ["مكتملة", "Completed"],
};

export default function TradePage() {
  const { locale } = useLocale();
  const router = useRouter();
  const ar = locale === "ar";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [businessQuery, setBusinessQuery] = useState("");
  const [businessResults, setBusinessResults] = useState<BusinessResult[]>([]);
  const [selectedCounterparty, setSelectedCounterparty] = useState<BusinessResult | null>(null);
  const [initiatorAccountId, setInitiatorAccountId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [counterDrafts, setCounterDrafts] = useState<Record<string, { message: string; amount: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [accountResponse, dealResponse] = await Promise.all([
        fetch("/api/accounts", { credentials: "include", cache: "no-store" }),
        fetch("/api/trade/deals", { credentials: "include", cache: "no-store" }),
      ]);
      if (accountResponse.status === 401 || dealResponse.status === 401) {
        router.replace("/login");
        return;
      }
      const [accountData, dealData] = await Promise.all([accountResponse.json(), dealResponse.json()]);
      if (!accountResponse.ok || !accountData.success) throw new Error("accounts");
      if (!dealResponse.ok || !dealData.success) throw new Error("deals");
      setAccounts(accountData.accounts ?? []);
      setDeals(dealData.deals ?? []);
      if (accountData.accounts?.length) setInitiatorAccountId(current => current || accountData.accounts[0].id);
    } catch {
      setError(ar ? "تعذر تحميل بيانات التجارة. حاول تحديث الصفحة." : "Could not load trade workspace. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [ar, router]);

  useEffect(() => { void loadData(); }, [loadData]);

  const searchBusinesses = async () => {
    setError("");
    if (businessQuery.trim().length < 2) {
      setError(ar ? "اكتب حرفين على الأقل للبحث عن شركة." : "Enter at least two characters to search businesses.");
      return;
    }
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(businessQuery.trim())}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("search");
      setBusinessResults((data.results?.businesses ?? []).filter((business: BusinessResult) =>
        !accounts.some(account => account.id === business.id)
      ));
      setSelectedCounterparty(null);
    } catch {
      setError(ar ? "تعذر البحث عن الشركات حالياً." : "Business search is temporarily unavailable.");
    }
  };

  const createDraft = async () => {
    if (!initiatorAccountId || !selectedCounterparty || title.trim().length < 3) {
      setError(ar ? "اختر حسابك والشركة المقابلة وأدخل عنوان الصفقة." : "Choose your account, the counterparty and a deal title.");
      return;
    }
    if (amount.trim() && (!Number.isFinite(Number(amount)) || Number(amount) < 0)) {
      setError(ar ? "أدخل قيمة صحيحة غير سالبة." : "Enter a valid non-negative amount.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/trade/deals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initiatorAccountId,
          counterpartyAccountId: selectedCounterparty.id,
          title: title.trim(),
          description: description.trim(),
          currency,
          proposedAmount: amount.trim() ? Number(amount) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "create");
      setTitle("");
      setDescription("");
      setAmount("");
      setSelectedCounterparty(null);
      setBusinessQuery("");
      setBusinessResults([]);
      setNotice(ar ? "تم إنشاء مسودة الصفقة. راجعها ثم أرسل العرض عندما تكون جاهزاً." : "Draft created. Review it, then send the proposal when ready.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? "تعذر إنشاء الصفقة." : "Could not create deal."));
    } finally {
      setSaving(false);
    }
  };

  const actOnDeal = async (deal: Deal, accountId: string, action: string) => {
    const draft = counterDrafts[deal.id] ?? { message: "", amount: "" };
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/trade/deals/${deal.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          accountId,
          message: draft.message,
          ...(action === "counter" && draft.amount.trim() ? { proposedAmount: Number(draft.amount) } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "action");
      setNotice(ar ? "تم تحديث حالة الصفقة." : "Deal status updated.");
      setCounterDrafts(current => ({ ...current, [deal.id]: { message: "", amount: "" } }));
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? "تعذر تنفيذ الإجراء." : "Could not complete the action."));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: "100%", minWidth: 0, border: "1px solid rgba(115,128,146,.35)", borderRadius: 10, padding: "11px 12px", background: "transparent", color: "inherit" } as const;
  const buttonStyle = { border: "1px solid #c6a15b", borderRadius: 10, padding: "9px 13px", background: "#14243a", color: "#f7f4ed", fontWeight: 700, cursor: "pointer" } as const;

  return <main dir={ar ? "rtl" : "ltr"} lang={locale} style={{ minHeight: "100vh", background: "#f7f4ed", color: "#263448" }}>
    <WorkspaceHeader section="account" />
    <div style={{ width: "min(1120px, calc(100% - 32px))", margin: "0 auto", padding: "28px 0 56px" }}>
      <div style={{ marginBottom: 24 }}>
        <span style={{ color: "#9b783d", fontSize: 12, fontWeight: 800, letterSpacing: ".12em" }}>WASLA TRADE</span>
        <h1 style={{ color: "#14243a", fontSize: "clamp(26px, 4vw, 38px)", margin: "8px 0" }}>{ar ? "إدارة الصفقات التجارية" : "Commercial deal management"}</h1>
        <p style={{ lineHeight: 1.8, maxWidth: 760 }}>{ar ? "أنشئ مسودة، أرسل عرضاً، تفاوض مع الشركة المقابلة، وسجّل قرار الطرفين. القبول هنا لا ينفذ دفعاً أو طلب شراء تلقائياً." : "Create a draft, send a proposal, negotiate with the counterparty and record both parties’ decisions. Acceptance here does not trigger payment or a purchase order."}</p>
      </div>

      {error && <p role="alert" style={{ padding: 12, borderRadius: 10, background: "#f8e7e5", color: "#8f302d" }}>{error}</p>}
      {notice && <p role="status" style={{ padding: 12, borderRadius: 10, background: "#e8f0e9", color: "#245b3b" }}>{notice}</p>}

      <section style={{ background: "#fff", border: "1px solid rgba(115,128,146,.2)", borderRadius: 16, padding: 20, marginBottom: 26 }}>
        <h2 style={{ color: "#14243a", marginTop: 0 }}>{ar ? "إنشاء مسودة صفقة" : "Create a deal draft"}</h2>
        <p style={{ fontSize: 13, opacity: .75 }}>{ar ? "المسودة لا تُرسل للطرف الآخر إلا بعد ضغط إرسال العرض." : "A draft is private to your account until you explicitly send the proposal."}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>{ar ? "حسابك التجاري" : "Your business account"}
            <select value={initiatorAccountId} onChange={e => setInitiatorAccountId(e.target.value)} style={inputStyle}>
              <option value="">{ar ? "اختر الحساب" : "Choose account"}</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.display_name}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>{ar ? "البحث عن الشركة المقابلة" : "Find the counterparty"}
            <div style={{ display: "flex", gap: 8 }}>
              <input value={businessQuery} onChange={e => setBusinessQuery(e.target.value)} placeholder={ar ? "اسم الشركة" : "Business name"} style={inputStyle} />
              <button type="button" onClick={() => void searchBusinesses()} style={buttonStyle}>{ar ? "بحث" : "Search"}</button>
            </div>
          </label>
          <label style={{ display: "grid", gap: 6 }}>{ar ? "عنوان الصفقة" : "Deal title"}
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={180} style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>{ar ? "العملة" : "Currency"}
            <select value={currency} onChange={e => setCurrency(e.target.value)} style={inputStyle}>
              {["USD", "EUR", "TRY", "GBP", "AED", "SAR"].map(code => <option key={code}>{code}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>{ar ? "القيمة المقترحة (اختياري)" : "Proposed amount (optional)"}
            <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </label>
        </div>
        <label style={{ display: "grid", gap: 6, marginTop: 12 }}>{ar ? "وصف وشروط مبدئية" : "Description and initial terms"}
          <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={5000} rows={3} style={inputStyle} />
        </label>
        {businessResults.length > 0 && <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
          <strong>{ar ? "نتائج الشركات" : "Business results"}</strong>
          {businessResults.map(business => <button key={business.id} type="button" onClick={() => setSelectedCounterparty(business)} style={{
            textAlign: ar ? "right" : "left", padding: 12, borderRadius: 10,
            border: selectedCounterparty?.id === business.id ? "2px solid #c6a15b" : "1px solid rgba(115,128,146,.25)",
            background: selectedCounterparty?.id === business.id ? "rgba(198,161,91,.12)" : "transparent", color: "inherit",
          }}>
            <strong>{business.display_name}</strong>
            <small style={{ display: "block", opacity: .7 }}>{business.account_type}{business.country_code ? ` · ${business.country_code}` : ""}</small>
          </button>)}
        </div>}
        {selectedCounterparty && <p style={{ marginTop: 12 }}>{ar ? "الشركة المختارة:" : "Selected counterparty:"} <strong>{selectedCounterparty.display_name}</strong></p>}
        <button type="button" disabled={saving || loading} onClick={() => void createDraft()} style={{ ...buttonStyle, marginTop: 14, opacity: saving || loading ? .6 : 1 }}>
          {saving ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "إنشاء مسودة" : "Create draft")}
        </button>
      </section>

      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ color: "#14243a" }}>{ar ? "الصفقات" : "Deals"}</h2>
          <button type="button" onClick={() => void loadData()} disabled={loading} style={{ ...buttonStyle, background: "transparent", color: "#14243a" }}>{ar ? "تحديث" : "Refresh"}</button>
        </div>
        {loading ? <p>{ar ? "جارٍ تحميل الصفقات..." : "Loading deals..."}</p> :
          deals.length === 0 ? <div style={{ padding: 22, border: "1px dashed rgba(115,128,146,.4)", borderRadius: 14 }}>
            {ar ? "لا توجد صفقات بعد. أنشئ مسودة للبدء." : "No deals yet. Create a draft to get started."}
          </div> :
          <div style={{ display: "grid", gap: 12 }}>
            {deals.map(deal => {
              const accountRole = (accountId: string) => accounts.find(account => account.id === accountId)?.role ?? "";
              const hasTradePermission = (accountId: string, permission: "create" | "negotiate" | "update") =>
                ["account_owner", "account_admin", "account_manager"].includes(accountRole(accountId));
              const ownInitiator = accounts.some(account => account.id === deal.initiatorAccountId);
              const ownPending = accounts.find(account => account.id === deal.pendingResponseAccountId && hasTradePermission(account.id, "negotiate"));
              const ownParty = accounts.find(account =>
                (account.id === deal.initiatorAccountId || account.id === deal.counterpartyAccountId) &&
                hasTradePermission(account.id, "update")
              );
              const canPropose = deal.status === "draft" && ownInitiator && hasTradePermission(deal.initiatorAccountId, "create");
              const canRespond = ["proposed", "negotiating"].includes(deal.status) && Boolean(ownPending);
              const canCancel = ["draft", "proposed", "negotiating"].includes(deal.status) && ownInitiator && hasTradePermission(deal.initiatorAccountId, "update");
              const canComplete = deal.status === "accepted" && Boolean(ownParty);
              const counter = counterDrafts[deal.id] ?? { message: "", amount: "" };
              return <article key={deal.id} style={{ background: "#fff", border: "1px solid rgba(115,128,146,.2)", borderRadius: 14, padding: 16, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ margin: "0 0 6px", color: "#14243a" }}>{deal.title}</h3>
                    <small style={{ opacity: .72 }}>{deal.initiatorName} ↔ {deal.counterpartyName}</small>
                  </div>
                  <span style={{ borderRadius: 999, padding: "5px 10px", background: "#f1eadc", color: "#765a2f", fontSize: 12, fontWeight: 800 }}>
                    {(statusLabels[deal.status] ?? [deal.status, deal.status])[ar ? 0 : 1]}
                  </span>
                </div>
                {deal.description && <p style={{ margin: 0, lineHeight: 1.7 }}>{deal.description}</p>}
                <strong>{deal.proposedAmount ? `${deal.proposedAmount} ${deal.currency}` : (ar ? "القيمة غير محددة" : "Amount not set")}</strong>
                <small style={{ opacity: .65 }}>{new Date(deal.createdAt).toLocaleDateString(ar ? "ar" : "en")}</small>
                {canRespond && ownPending && <div style={{ display: "grid", gap: 8, padding: 12, background: "#f7f4ed", borderRadius: 10 }}>
                  <strong>{ar ? `الرد مطلوب من: ${ownPending.display_name}` : `Response required from: ${ownPending.display_name}`}</strong>
                  <textarea rows={2} value={counter.message} onChange={e => setCounterDrafts(current => ({ ...current, [deal.id]: { ...counter, message: e.target.value } }))} placeholder={ar ? "رسالة أو شروط التعديل" : "Message or counter terms"} style={inputStyle} />
                  <input inputMode="decimal" value={counter.amount} onChange={e => setCounterDrafts(current => ({ ...current, [deal.id]: { ...counter, amount: e.target.value } }))} placeholder={ar ? "قيمة بديلة اختيارية" : "Optional counter amount"} style={inputStyle} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" disabled={saving} onClick={() => void actOnDeal(deal, ownPending.id, "accept")} style={buttonStyle}>{ar ? "قبول" : "Accept"}</button>
                    <button type="button" disabled={saving} onClick={() => void actOnDeal(deal, ownPending.id, "decline")} style={{ ...buttonStyle, background: "#fff", color: "#a33d3d", borderColor: "#a33d3d" }}>{ar ? "رفض" : "Decline"}</button>
                    <button type="button" disabled={saving || !counter.message.trim() && !counter.amount.trim()} onClick={() => void actOnDeal(deal, ownPending.id, "counter")} style={{ ...buttonStyle, background: "#b18d4d" }}>{ar ? "إرسال تعديل" : "Send counter"}</button>
                  </div>
                </div>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {canPropose && <button type="button" disabled={saving} onClick={() => void actOnDeal(deal, deal.initiatorAccountId, "propose")} style={buttonStyle}>{ar ? "إرسال العرض" : "Send proposal"}</button>}
                  {canCancel && <button type="button" disabled={saving} onClick={() => void actOnDeal(deal, deal.initiatorAccountId, "cancel")} style={{ ...buttonStyle, background: "#fff", color: "#a33d3d", borderColor: "#a33d3d" }}>{ar ? "إلغاء" : "Cancel"}</button>}
                  {canComplete && <button type="button" disabled={saving} onClick={() => void actOnDeal(deal, ownParty!.id, "complete")} style={buttonStyle}>{ar ? "تسجيل الإتمام" : "Mark complete"}</button>}
                </div>
              </article>;
            })}
          </div>}
      </section>
    </div>
  </main>;
}
