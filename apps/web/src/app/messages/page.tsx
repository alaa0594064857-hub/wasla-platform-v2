"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type Conversation = {
  id: string;
  other_user_id: string;
  other_user_name: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
};
type Message = {
  id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
};

export default function MessagesPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");

  const t = {
    title: ar ? "الرسائل" : "Messages",
    subtitle: ar ? "تواصل مباشرة مع المشترين والموردين وجهات الاتصال." : "Message buyers, suppliers and your contacts directly.",
    conversations: ar ? "المحادثات" : "Conversations",
    newChat: ar ? "محادثة جديدة" : "New conversation",
    email: ar ? "البريد الإلكتروني للطرف الآخر" : "Recipient email address",
    start: ar ? "بدء المحادثة" : "Start chat",
    empty: ar ? "لا توجد محادثات بعد. ابدأ محادثة جديدة بالبريد الإلكتروني." : "No conversations yet. Start one using an email address.",
    choose: ar ? "اختر محادثة أو ابدأ واحدة جديدة" : "Choose a conversation or start a new one",
    placeholder: ar ? "اكتب رسالتك..." : "Write a message...",
    send: ar ? "إرسال" : "Send",
    loading: ar ? "جارٍ تحميل المحادثات..." : "Loading conversations...",
    failed: ar ? "تعذر تحميل الرسائل. تأكد من تسجيل الدخول وحاول مجدداً." : "Could not load messages. Sign in and try again.",
    emailRequired: ar ? "أدخل بريداً إلكترونياً صحيحاً لحساب نشط." : "Enter a valid email address for an active account.",
    sendFailed: ar ? "تعذر إرسال الرسالة." : "Message could not be sent.",
    sending: ar ? "جارٍ الإرسال..." : "Sending..."
  };

  const loadConversations = useCallback(async () => {
    const response = await fetch("/api/messages", { credentials: "include", cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error("load");
    setConversations(result.conversations || []);
  }, []);

  const loadMessages = useCallback(async (conversation: Conversation) => {
    const response = await fetch(`/api/messages/${conversation.id}`, { credentials: "include", cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error("messages");
    setMessages(result.messages || []);
    setConversations(current => current.map(item => item.id === conversation.id ? { ...item, unread_count: 0 } : item));
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/profile", { credentials: "include", cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error("profile");
        if (active) setUserId(result.profile.userId);
        await loadConversations();
      } catch {
        if (active) setError(t.failed);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadConversations, t.failed]);

  async function chooseConversation(conversation: Conversation) {
    setSelected(conversation);
    setError("");
    try { await loadMessages(conversation); }
    catch { setError(t.failed); }
  }

  async function startConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: email.trim() })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("recipient");
      await loadConversations();
      const item = (await (async () => {
        const listResponse = await fetch("/api/messages", { credentials: "include", cache: "no-store" });
        const list = await listResponse.json();
        return (list.conversations || []).find((entry: Conversation) => entry.id === result.conversation.id) as Conversation | undefined;
      })());
      if (item) await chooseConversation(item);
      setEmail("");
    } catch { setError(t.emailRequired); }
    finally { setBusy(false); }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !draft.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/messages/${selected.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim() })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("send");
      setMessages(current => [...current, result.message]);
      setDraft("");
      await loadConversations();
    } catch { setError(t.sendFailed); }
    finally { setBusy(false); }
  }

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
        <div className="wasla-messages-workspace">
          <aside className="wasla-conversations-panel">
            <div className="wasla-conversations-title"><h2>{t.conversations}</h2><span>{conversations.length}</span></div>
            <form onSubmit={startConversation} style={{display:"grid",gap:8,padding:"12px 16px"}}>
              <label htmlFor="message-recipient-email">{t.newChat}</label>
              <input id="message-recipient-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder={t.email} style={{minWidth:0,width:"100%",padding:11,borderRadius:9,border:"1px solid var(--border, #d8d8d8)",background:"var(--surface, #fff)",color:"inherit"}} />
              <button type="submit" disabled={busy || !email.trim()}>{t.start}</button>
            </form>
            {loading ? <p style={{padding:16}}>{t.loading}</p> : conversations.length === 0 ? (
              <div className="wasla-conversations-empty"><span>✉</span><strong>{t.empty}</strong></div>
            ) : conversations.map(item => (
              <button key={item.id} type="button" onClick={()=>void chooseConversation(item)} aria-pressed={selected?.id === item.id}
                style={{display:"grid",width:"100%",textAlign:"start",gap:5,padding:"14px 16px",border:0,borderTop:"1px solid var(--border, #e5e5e5)",background:selected?.id===item.id?"var(--surface-secondary, #f5f2eb)":"transparent",color:"inherit",cursor:"pointer"}}>
                <strong>{item.other_user_name || (ar ? "مستخدم وصلة" : "WASLA user")}</strong>
                <span style={{fontSize:13,opacity:.75,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.last_message || (ar ? "ابدأ المحادثة" : "Start the conversation")}</span>
                {item.unread_count > 0 && <small>{item.unread_count} {ar ? "رسائل جديدة" : "unread"}</small>}
              </button>
            ))}
          </aside>
          <section className="wasla-chat-panel" style={{display:"flex",flexDirection:"column",minHeight:420}}>
            {selected ? <>
              <header style={{padding:16,borderBottom:"1px solid var(--border, #e5e5e5)"}}><strong>{selected.other_user_name || (ar ? "مستخدم وصلة" : "WASLA user")}</strong></header>
              <div style={{display:"flex",flex:1,flexDirection:"column",gap:10,padding:16,overflowY:"auto"}}>
                {messages.map(message => <div key={message.id} style={{alignSelf:message.sender_user_id===userId?(ar?"flex-start":"flex-end"):(ar?"flex-end":"flex-start"),maxWidth:"82%",padding:"10px 13px",borderRadius:12,background:message.sender_user_id===userId?"var(--surface-secondary, #f3eee4)":"var(--surface, #fff)",border:"1px solid var(--border, #e5e5e5)"}}>
                  <p style={{margin:0,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{message.body}</p>
                  <small style={{opacity:.6}}>{new Date(message.created_at).toLocaleString(locale)}</small>
                </div>)}
              </div>
              <form onSubmit={sendMessage} style={{display:"flex",gap:8,padding:14,borderTop:"1px solid var(--border, #e5e5e5)"}}>
                <input value={draft} onChange={e=>setDraft(e.target.value)} maxLength={5000} placeholder={t.placeholder} aria-label={t.placeholder} style={{flex:1,minWidth:0,padding:12,borderRadius:9,border:"1px solid var(--border, #d8d8d8)",background:"var(--surface, #fff)",color:"inherit"}} />
                <button type="submit" disabled={busy || !draft.trim()}>{busy?t.sending:t.send}</button>
              </form>
            </> : <div className="wasla-chat-empty"><span className="wasla-chat-symbol">W</span><h2>{t.choose}</h2></div>}
          </section>
        </div>
        {error && <p role="alert" style={{color:"crimson",padding:10}}>{error}</p>}
      </section>
    </main>
  );
}
