"use client";

import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

export default function MessagesPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  return (
    <main className="wasla-messages-page" dir={ar ? "rtl" : "ltr"} lang={locale}>
      <WorkspaceHeader section="account" />
      <section className="wasla-messages-shell">
        <header className="wasla-messages-heading">
          <div>
            <span className="wasla-messages-eyebrow">{ar ? "وصلة للتواصل" : "WASLA COMMUNICATIONS"}</span>
            <h1>{ar ? "الرسائل" : "Messages"}</h1>
            <p>{ar ? "مساحة موحدة لمحادثاتك مع المتاجر والشركات وجهات الاتصال." : "One place for your conversations with shops, businesses and contacts."}</p>
          </div>
          <span className="wasla-messages-mark">✉</span>
        </header>
        <div className="wasla-messages-workspace">
          <aside className="wasla-conversations-panel">
            <div className="wasla-conversations-title">
              <h2>{ar ? "المحادثات" : "Conversations"}</h2>
              <span>0</span>
            </div>
            <div className="wasla-conversations-empty">
              <span>✉</span>
              <strong>{ar ? "لا توجد محادثات بعد" : "No conversations yet"}</strong>
              <p>{ar ? "ستظهر محادثاتك هنا عندما يتم تفعيل نظام المراسلة." : "Your conversations will appear here when messaging is enabled."}</p>
            </div>
          </aside>
          <section className="wasla-chat-panel">
            <div className="wasla-chat-empty">
              <span className="wasla-chat-symbol">W</span>
              <h2>{ar ? "تواصل من مكان واحد" : "Connect in one place"}</h2>
              <p>{ar ? "نعمل على تجهيز المحادثات المباشرة ومشاركة الملفات والإشعارات ضمن هوية وصلة الموحدة." : "Direct chats, file sharing and notifications are being prepared as part of your unified WASLA identity."}</p>
              <small>{ar ? "واجهة الرسائل جاهزة مبدئياً — ربط المحادثات قيد التطوير." : "Messaging interface scaffold is ready — conversation services are still in development."}</small>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}