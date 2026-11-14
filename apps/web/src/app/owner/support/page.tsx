"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../../components/locale-provider";

type Ticket = {
  id: string;
  ticketNumber: string;
  category: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  assignedToUserId: string | null;
  requesterName: string;
  requesterEmail: string;
  createdAt: string;
};
type Message = {
  id: string;
  authorUserId: string | null;
  body: string;
  visibility: string;
  createdAt: string;
};

const statuses = ["open", "in_progress", "waiting_for_user", "resolved", "closed"];
const priorities = ["low", "normal", "high", "urgent"];

export default function OwnerSupportPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState("normal");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [canAssign, setCanAssign] = useState(false);

  const copy = ar
    ? {
        title: "مكتب دعم وصلة",
        queue: "قائمة التذاكر",
        loading: "جارٍ التحميل...",
        reply: "اكتب ردًا أو ملاحظة داخلية",
        send: "إرسال",
        save: "حفظ التغييرات",
        status: "الحالة",
        priority: "الأولوية",
        assignee: "معرّف الموظف المسؤول (اختياري)",
        public: "رد ظاهر للعميل",
        internal: "ملاحظة داخلية",
        requester: "صاحب الطلب",
        no: "لا توجد تذاكر مفتوحة",
        denied: "ليس لديك صلاحية الوصول إلى مكتب الدعم",
        failed: "تعذر تنفيذ العملية",
      }
    : {
        title: "WASLA Support Desk",
        queue: "Ticket queue",
        loading: "Loading...",
        reply: "Write a reply or internal note",
        send: "Send",
        save: "Save changes",
        status: "Status",
        priority: "Priority",
        assignee: "Assignee user ID (optional)",
        public: "Public reply",
        internal: "Internal note",
        requester: "Requester",
        no: "No open tickets",
        denied: "You do not have access to the support desk",
        failed: "The operation failed",
      };

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) {
      router.replace("/login");
      return;
    }

    let active = true;
    fetch("/api/platform/security", { credentials: "include", cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        const permissions: string[] = data.platformAccess?.permissions || [];
        if (!data.success || !permissions.includes("platform.support.queue.read")) {
          setError(copy.denied);
          return;
        }
        setAllowed(true);
        setCanAssign(permissions.includes("platform.support.case.assign"));
        return fetch("/api/platform/support/tickets", {
          credentials: "include",
          cache: "no-store",
        })
          .then((response) => response.json())
          .then((queue) => {
            if (!active) return;
            if (queue.success) setTickets(queue.tickets || []);
            else setError(copy.failed);
          });
      })
      .catch(() => {
        if (active) setError(copy.failed);
      });

    return () => {
      active = false;
    };
  }, [isPending, session?.user?.id, router]);

  async function openTicket(ticket: Ticket) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/platform/support/tickets/" + ticket.id, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("ticket-load-failed");
      setSelected(data.ticket);
      setMessages(data.messages || []);
      setStatus(data.ticket.status);
      setPriority(data.ticket.priority);
      setAssignee(data.ticket.assignedToUserId || "");
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  async function saveTicket() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        status,
        priority,
        ...(canAssign ? { assignedToUserId: assignee || null } : {}),
      };
      const response = await fetch("/api/platform/support/tickets/" + selected.id, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("ticket-save-failed");
      setSelected({ ...selected, ...data.ticket });
      setTickets((current) =>
        current.map((ticket) =>
          ticket.id === selected.id ? { ...ticket, ...data.ticket } : ticket,
        ),
      );
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if (!selected || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        "/api/platform/support/tickets/" + selected.id + "/messages",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, visibility }),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("message-send-failed");
      setMessages((current) => [
        ...current,
        {
          ...data.message,
          body,
          visibility,
          authorUserId: session?.user?.id || null,
        },
      ]);
      setBody("");
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  const field: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: 11,
    border: "1px solid #d8dee7",
    borderRadius: 8,
    background: "#fff",
    color: "#17283d",
    marginTop: 6,
  };

  return (
    <main
      dir={ar ? "rtl" : "ltr"}
      style={{
        minHeight: "100vh",
        background: "#f6f4ee",
        padding: 28,
        color: "#17283d",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header
          style={{
            background: "#17283d",
            color: "#fff",
            padding: 24,
            borderRadius: 16,
          }}
        >
          <small style={{ color: "#d9bd80" }}>WASLA OPERATIONS</small>
          <h1>{copy.title}</h1>
        </header>

        {error ? <p role="alert" style={{ color: "#a22" }}>{error}</p> : null}

        {!allowed ? (
          <p>{copy.loading}</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
              gap: 16,
              marginTop: 18,
            }}
          >
            <section style={panel}>
              <h2>{copy.queue}</h2>
              {!tickets.length ? (
                <p>{copy.no}</p>
              ) : (
                tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => openTicket(ticket)}
                    style={ticketButton}
                  >
                    <b>{ticket.ticketNumber}</b>
                    <div>{ticket.subject}</div>
                    <small>{ticket.priority} · {ticket.status}</small>
                  </button>
                ))
              )}
            </section>

            {selected ? (
              <section style={panel}>
                <h2>{selected.ticketNumber} · {selected.subject}</h2>
                <p>{copy.requester}: {selected.requesterName} ({selected.requesterEmail})</p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 10,
                  }}
                >
                  <label>
                    {copy.status}
                    <select value={status} onChange={(event) => setStatus(event.target.value)} style={field}>
                      {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>
                    {copy.priority}
                    <select value={priority} onChange={(event) => setPriority(event.target.value)} style={field}>
                      {priorities.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                </div>

                {canAssign ? (
                  <label style={{ display: "block", marginTop: 12 }}>
                    {copy.assignee}
                    <input value={assignee} onChange={(event) => setAssignee(event.target.value)} style={field} />
                  </label>
                ) : null}

                <button type="button" onClick={saveTicket} disabled={busy} style={primary}>
                  {copy.save}
                </button>

                <div style={{ display: "grid", gap: 9, margin: "20px 0" }}>
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      style={{
                        background: message.visibility === "internal" ? "#fff3d8" : "#f0f4f8",
                        padding: 12,
                        borderRadius: 10,
                      }}
                    >
                      <small>{message.visibility === "internal" ? copy.internal : copy.public}</small>
                      <p style={{ whiteSpace: "pre-wrap" }}>{message.body}</p>
                      <small>{new Date(message.createdAt).toLocaleString(ar ? "ar" : "en")}</small>
                    </article>
                  ))}
                </div>

                <select value={visibility} onChange={(event) => setVisibility(event.target.value)} style={field}>
                  <option value="public">{copy.public}</option>
                  <option value="internal">{copy.internal}</option>
                </select>
                <textarea
                  rows={4}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder={copy.reply}
                  style={{ ...field, marginTop: 10 }}
                />
                <button type="button" onClick={sendMessage} disabled={busy || !body.trim()} style={primary}>
                  {copy.send}
                </button>
              </section>
            ) : (
              <section style={panel}><p>{busy ? copy.loading : copy.queue}</p></section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

const panel: CSSProperties = {
  background: "#fff",
  padding: 20,
  borderRadius: 14,
  border: "1px solid #e5e0d5",
  minWidth: 0,
};
const ticketButton: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "start",
  padding: 13,
  marginBottom: 8,
  border: "1px solid #dce1e8",
  borderRadius: 9,
  background: "#fff",
  color: "#17283d",
  cursor: "pointer",
};
const primary: CSSProperties = {
  border: 0,
  background: "#17283d",
  color: "#e5cb91",
  padding: "11px 15px",
  borderRadius: 8,
  marginTop: 10,
  cursor: "pointer",
};
