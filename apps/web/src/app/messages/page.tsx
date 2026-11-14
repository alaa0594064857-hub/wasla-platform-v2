"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type Conversation = {
  id: string; peer_id: string; peer_name: string | null; peer_image: string | null;
  last_message: string | null; last_message_at: string | null; unread_count: number;
};
type Message = {
  id: string; sender_id: string; body: string; created_at: string;
  sender_name?: string | null; sender_image?: string | null;
};
type Recipient = { recipient_id: string; display_name: string; entity_type: "person" | "business" | "store"; category: string | null };

export default function MessagesPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [searchingRecipients, setSearchingRecipients] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const t = {
    title: ar ? "الرسائل" : "Messages",
    subtitle: ar ? "مساحة موحدة لمحادثاتك مع المتاجر والشركات وجهات الاتصال." : "One place for your conversations with shops, businesses and contacts.",
    conversations: ar ? "المحادثات" : "Conversations",
    empty: ar ? "لا توجد محادثات بعد" : "No conversations yet",
    choose: ar ? "اختر محادثة لعرض الرسائل" : "Choose a conversation to view messages",
    loading: ar ? "جارٍ تحميل المحادثات..." : "Loading conversations...",
    message: ar ? "اكتب رسالتك..." : "Write a message...",
    send: ar ? "إرسال" : "Send",
    start: ar ? "بدء محادثة" : "Start a conversation",
    recipient: ar ? "ابحث عن شخص أو شركة أو متجر أو مصنع أو مورد" : "Search for a person, company, shop, factory or supplier",
    search: ar ? "بحث" : "Search",
    chooseRecipient: ar ? "اختر جهة لبدء محادثة خاصة" : "Choose a result to start a private conversation",
    person: ar ? "شخص" : "Person", business: ar ? "شركة / جهة" : "Business", store: ar ? "متجر" : "Store",
    login: ar ? "يرجى تسجيل الدخول لاستخدام الرسائل." : "Please sign in to use messaging.",
    loadError: ar ? "تعذر تحميل المحادثات. حدّث الصفحة وحاول مجدداً." : "Could not load conversations. Refresh and try again.",
    sendError: ar ? "تعذر إرسال الرسالة." : "Could not send the message.",
    startError: ar ? "تعذر بدء المحادثة. تحقق من معرّف الحساب وأن الحساب نشط وموثّق." : "Could not start the conversation. Check that the account ID is valid, active and verified.",
    emptyChat: ar ? "ابدأ المحادثة بإرسال أول رسالة." : "Start the conversation by sending the first message.",
    refresh: ar ? "تحديث" : "Refresh",
  };

  const loadConversations = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/messages", { credentials: "include", cache: "no-store" });
      if (response.status === 401) { router.replace("/login"); return; }
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.conversations)) throw new Error("load");
      setConversations(data.conversations);
      window.dispatchEvent(new Event("wasla:messages-updated"));
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [router, t.loadError]);

  const loadMessages = useCallback(async (conversationId: string, silent = false) => {
    if (!silent) setChatLoading(true);
    if (!silent) setError("");
    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(conversationId)}`, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.messages)) throw new Error("messages");
      setMessages(data.messages);
      window.dispatchEvent(new Event("wasla:messages-updated"));
    } catch {
      if (!silent) setError(t.loadError);
    } finally {
      if (!silent) setChatLoading(false);
    }
  }, [t.loadError]);

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) { router.replace("/login"); return; }
    void loadConversations();
  }, [isPending, session?.user?.id, router, loadConversations]);

  useEffect(() => {
    if (selected) void loadMessages(selected);
    else setMessages([]);
  }, [selected, loadMessages]);

  // Keep the inbox fresh while it is open without interrupting the reader.
  useEffect(() => {
    if (isPending || !session?.user) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void loadConversations();
      if (selected) void loadMessages(selected, true);
    };
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [isPending, session?.user?.id, selected, loadConversations, loadMessages]);

  async function searchRecipients(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recipientSearch.trim().length < 2) return;
    setSearchingRecipients(true); setError(""); setRecipients([]);
    try {
      const response = await fetch(`/api/messages?recipients=${encodeURIComponent(recipientSearch.trim())}`, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.recipients)) throw new Error("search");
      setRecipients(data.recipients as Recipient[]);
      if (data.recipients.length === 0) setNotice(ar ? "لا توجد نتائج مطابقة." : "No matching results.");
      else setNotice(t.chooseRecipient);
    } catch {
      setError(ar ? "تعذر البحث حالياً." : "Search is temporarily unavailable.");
    } finally {
      setSearchingRecipients(false);
    }
  }

  async function startConversation(recipientId: string) {
    if (!recipientId || starting) return;
    setStarting(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/messages", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.conversationId) throw new Error("start");
      setRecipients([]); setRecipientSearch("");
      await loadConversations();
      setSelected(data.conversationId);
      setNotice(ar ? "تم فتح المحادثة." : "Conversation opened.");
    } catch {
      setError(t.startError);
    } finally {
      setStarting(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !draft.trim() || sending) return;
    setSending(true); setError("");
    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(selected)}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.message) throw new Error("send");
      setMessages(current => [...current, data.message as Message]);
      setDraft("");
      await loadConversations();
    } catch {
      setError(t.sendError);
    } finally {
      setSending(false);
    }
  }

  const selectedConversation = conversations.find(item => item.id === selected);

  if (isPending || loading) return <main className="wasla-messages-page" dir={ar ? "rtl" : "ltr"}><WorkspaceHeader section="account" /><p style={{ padding: 32 }}>{t.loading}</p></main>;
  if (!session?.user) return <main className="wasla-messages-page" dir={ar ? "rtl" : "ltr"}><WorkspaceHeader section="account" /><p style={{ padding: 32 }}>{t.login}</p></main>;

  return (
    <main className="wasla-messages-page" dir={ar ? "rtl" : "ltr"} lang={locale}>
      <WorkspaceHeader section="account" />
      <section className="wasla-messages-shell">
        <header className="wasla-messages-heading">
          <div>
            <span className="wasla-messages-eyebrow">WASLA COMMUNICATIONS</span>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
          <span className="wasla-messages-mark">✉</span>
        </header>
        {error && <p role="alert" style={{ color: "#b42318", padding: "10px 14px" }}>{error}</p>}
        {notice && <p role="status" style={{ color: "#16734a", padding: "4px 14px" }}>{notice}</p>}
        <div className="wasla-messages-workspace">
          <aside className="wasla-conversations-panel">
            <div className="wasla-conversations-title">
              <h2>{t.conversations}</h2>
              <span>{conversations.length}</span>
            </div>
            <form onSubmit={searchRecipients} style={{ display: "grid", gap: 8, padding: 14, borderBottom: "1px solid rgba(160,160,160,.22)" }}>
              <strong>{t.start}</strong>
              <input value={recipientSearch} onChange={event => setRecipientSearch(event.target.value)} placeholder={t.recipient} aria-label={t.recipient} style={{ width: "100%", minWidth: 0, padding: 11, borderRadius: 9, border: "1px solid #b9b9b9", background: "transparent", color: "inherit" }} />
              <button type="submit" disabled={searchingRecipients || recipientSearch.trim().length < 2}>{searchingRecipients ? "…" : t.search}</button>
            </form>
            {recipients.length > 0 && <div style={{ padding: "4px 10px 12px", borderBottom: "1px solid rgba(160,160,160,.22)" }}>
              {recipients.map(item => <button key={item.entity_type + item.recipient_id} type="button" disabled={starting} onClick={() => void startConversation(item.recipient_id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", padding: 10, border: 0, borderRadius: 8, background: "rgba(190,155,80,.10)", color: "inherit", textAlign: ar ? "right" : "left", marginTop: 5, cursor: "pointer" }}>
                <span><strong>{item.display_name}</strong><small style={{ display: "block", opacity: .7 }}>{item.entity_type === "person" ? t.person : item.entity_type === "store" ? t.store : (item.category ? item.category : t.business)}</small></span>
                <span>{starting ? "…" : "✉"}</span>
              </button>)}
            </div>}
            <div className="wasla-conversation-list">
              {conversations.length === 0 ? <div className="wasla-conversations-empty"><span>✉</span><strong>{t.empty}</strong></div> :
                conversations.map(item => (
                  <button key={item.id} type="button" onClick={() => setSelected(item.id)} aria-pressed={selected === item.id}
                    style={{ display: "flex", width: "100%", gap: 10, textAlign: ar ? "right" : "left", padding: 13, border: 0, borderBottom: "1px solid rgba(160,160,160,.18)", background: selected === item.id ? "rgba(190,155,80,.15)" : "transparent", color: "inherit", cursor: "pointer" }}>
                    <span style={{ width: 38, height: 38, flex: "0 0 38px", borderRadius: "50%", display: "grid", placeItems: "center", background: "#182b43", color: "#fff" }}>{(item.peer_name || "?").slice(0,1).toUpperCase()}</span>
                    <span style={{ minWidth: 0, display: "grid", flex: 1, gap: 3 }}>
                      <strong>{item.peer_name || (ar ? "مستخدم وصلة" : "WASLA user")}</strong>
                      <small style={{ opacity: .72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.last_message || (ar ? "لا توجد رسائل" : "No messages yet")}</small>
                      {item.unread_count > 0 && <span aria-label={ar ? `${item.unread_count} رسائل غير مقروءة` : `${item.unread_count} unread messages`} style={{ justifySelf: ar ? "start" : "end", minWidth: 20, padding: "2px 7px", borderRadius: 999, background: "#c6a15b", color: "#14243a", fontSize: 11, fontWeight: 700 }}>{item.unread_count}</span>}
                    </span>
                  </button>
                ))}
            </div>
            <button type="button" onClick={() => void loadConversations()} style={{ margin: 12 }}>{t.refresh}</button>
          </aside>
          <section className="wasla-chat-panel" style={{ display: "flex", flexDirection: "column", minHeight: 420 }}>
            {selected ? <>
              <div style={{ padding: 16, borderBottom: "1px solid rgba(160,160,160,.22)" }}>
                <strong>{selectedConversation?.peer_name || (ar ? "المحادثة" : "Conversation")}</strong>
              </div>
              <div aria-live="polite" style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
                {chatLoading ? <p>{t.loading}</p> : messages.length === 0 ? <p>{t.emptyChat}</p> : messages.map(message => {
                  const mine = message.sender_id === session.user.id;
                  return <div key={message.id} style={{ alignSelf: mine ? (ar ? "flex-start" : "flex-end") : (ar ? "flex-end" : "flex-start"), maxWidth: " min(82%, 520px)", padding: "10px 13px", borderRadius: 13, background: mine ? "#e8d7ad" : "rgba(130,140,150,.16)", color: "#172536", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    <div>{message.body}</div>
                    <small style={{ display: "block", opacity: .65, marginTop: 5 }}>{new Date(message.created_at).toLocaleString(locale === "ar" ? "ar" : "en")}</small>
                  </div>;
                })}
              </div>
              <form onSubmit={sendMessage} style={{ display: "flex", gap: 8, padding: 14, borderTop: "1px solid rgba(160,160,160,.22)" }}>
                <input value={draft} onChange={event => setDraft(event.target.value)} maxLength={5000} placeholder={t.message} aria-label={t.message} style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 9, border: "1px solid #b9b9b9", background: "transparent", color: "inherit" }} />
                <button type="submit" disabled={sending || !draft.trim()}>{sending ? "…" : t.send}</button>
              </form>
            </> : <div className="wasla-chat-empty"><span className="wasla-chat-symbol">W</span><h2>{ar ? "تواصل من مكان واحد" : "Connect in one place"}</h2><p>{t.choose}</p></div>}
          </section>
        </div>
      </section>
    </main>
  );
}
