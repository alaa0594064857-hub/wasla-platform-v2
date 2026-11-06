"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type Conversation = {
  id: string; peer_id: string; peer_name: string | null; peer_image: string | null;
  last_message: string | null; last_message_at: string | null; message_count: number;
};
type Message = {
  id: string; sender_id: string; body: string; created_at: string;
  sender_name?: string | null; sender_image?: string | null;
};

export default function MessagesPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [recipientId, setRecipientId] = useState("");
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
    recipient: ar ? "معرّف حساب المستلم" : "Recipient account ID",
    startButton: ar ? "بدء" : "Start",
    idHint: ar ? "يمكنك الحصول على معرّف الحساب من صفحة الشبكة أو من مسؤول الحساب." : "Get the account ID from the network page or the account administrator.",
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
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [router, t.loadError]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setChatLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(conversationId)}`, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.messages)) throw new Error("messages");
      setMessages(data.messages);
    } catch {
      setError(t.loadError);
    } finally {
      setChatLoading(false);
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

  async function startConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipientId.trim()) return;
    setStarting(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/messages", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: recipientId.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.conversationId) throw new Error("start");
      setRecipientId("");
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
            <form onSubmit={startConversation} style={{ display: "grid", gap: 8, padding: 14, borderBottom: "1px solid rgba(160,160,160,.22)" }}>
              <strong>{t.start}</strong>
              <input value={recipientId} onChange={event => setRecipientId(event.target.value)} placeholder={t.recipient} aria-label={t.recipient} style={{ width: "100%", minWidth: 0, padding: 11, borderRadius: 9, border: "1px solid #b9b9b9", background: "transparent", color: "inherit" }} />
              <small>{t.idHint}</small>
              <button type="submit" disabled={starting || !recipientId.trim()}>{starting ? "…" : t.startButton}</button>
            </form>
            <div className="wasla-conversation-list">
              {conversations.length === 0 ? <div className="wasla-conversations-empty"><span>✉</span><strong>{t.empty}</strong></div> :
                conversations.map(item => (
                  <button key={item.id} type="button" onClick={() => setSelected(item.id)} aria-pressed={selected === item.id}
                    style={{ display: "flex", width: "100%", gap: 10, textAlign: ar ? "right" : "left", padding: 13, border: 0, borderBottom: "1px solid rgba(160,160,160,.18)", background: selected === item.id ? "rgba(190,155,80,.15)" : "transparent", color: "inherit", cursor: "pointer" }}>
                    <span style={{ width: 38, height: 38, flex: "0 0 38px", borderRadius: "50%", display: "grid", placeItems: "center", background: "#182b43", color: "#fff" }}>{(item.peer_name || "?").slice(0,1).toUpperCase()}</span>
                    <span style={{ minWidth: 0, display: "grid", flex: 1, gap: 3 }}>
                      <strong>{item.peer_name || (ar ? "مستخدم وصلة" : "WASLA user")}</strong>
                      <small style={{ opacity: .72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.last_message || (ar ? "لا توجد رسائل" : "No messages yet")}</small>
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
