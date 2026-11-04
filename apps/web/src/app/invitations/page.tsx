"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Locale = "ar" | "en";

type Invitation = {
  membership_id: string;
  account_id: string;
  status: "invited";
  invited_at: string;
  account_type: string;
  legal_name: string;
  display_name: string;
  country_code: string | null;
  role: string;
  invited_by_name: string | null;
  invited_by_email: string | null;
};

const labels = {
  ar: {
    brand: "وصلة",
    title: "الدعوات الواردة",
    subtitle: "راجع دعوات الانضمام إلى حسابات الشركات واتخذ قرارك.",
    home: "الرئيسية",
    business: "إدارة الأعمال",
    refresh: "تحديث",
    loading: "جارٍ تحميل الدعوات...",
    error: "تعذر تحميل الدعوات. يرجى المحاولة مرة أخرى.",
    actionError: "تعذر تنفيذ العملية. حاول مرة أخرى.",
    emptyTitle: "لا توجد دعوات معلّقة",
    emptyText: "عندما تدعوك شركة للانضمام إلى فريقها ستظهر الدعوة هنا.",
    invitedBy: "أرسل الدعوة",
    invitedAt: "تاريخ الدعوة",
    accountType: "نوع الحساب",
    role: "الدور الوظيفي",
    accept: "قبول الدعوة",
    decline: "رفض الدعوة",
    accepting: "جارٍ قبول الدعوة...",
    declining: "جارٍ رفض الدعوة...",
    accepted: "تم قبول الدعوة بنجاح. أصبحت عضواً في الحساب.",
    declined: "تم رفض الدعوة بنجاح.",
    manager: "مدير",
    employee: "موظف",
    viewer: "مشاهد",
    owner: "مالك الحساب",
    admin: "مدير الحساب",
    company: "شركة",
    supplier: "مورد",
    manufacturer: "مصنّع",
    trader: "تاجر",
    brandType: "علامة تجارية",
    back: "العودة للرئيسية",
    unknown: "غير محدد",
  },
  en: {
    brand: "WASLA",
    title: "Incoming Invitations",
    subtitle: "Review invitations to join business accounts and choose how to respond.",
    home: "Home",
    business: "Business management",
    refresh: "Refresh",
    loading: "Loading invitations...",
    error: "Unable to load invitations. Please try again.",
    actionError: "The action could not be completed. Please try again.",
    emptyTitle: "No pending invitations",
    emptyText: "When a business invites you to join its team, the invitation will appear here.",
    invitedBy: "Invited by",
    invitedAt: "Invitation date",
    accountType: "Account type",
    role: "Assigned role",
    accept: "Accept invitation",
    decline: "Decline invitation",
    accepting: "Accepting...",
    declining: "Declining...",
    accepted: "Invitation accepted. You are now a member of this account.",
    declined: "Invitation declined successfully.",
    manager: "Manager",
    employee: "Employee",
    viewer: "Viewer",
    owner: "Account owner",
    admin: "Account administrator",
    company: "Company",
    supplier: "Supplier",
    manufacturer: "Manufacturer",
    trader: "Trader",
    brandType: "Brand",
    back: "Back to home",
    unknown: "Not specified",
  },
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : {};

  if (!response.ok || data.success === false) {
    throw new Error(data.error ?? "Request failed");
  }

  return data as T;
}

export default function InvitationsPage() {
  const [locale, setLocale] = useState<Locale>("ar");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "accept" | "decline" | ""
  >("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const t = labels[locale];
  const direction = locale === "ar" ? "rtl" : "ltr";

  const loadInvitations = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await apiRequest<{
        invitations: Invitation[];
      }>("/api/invitations");

      setInvitations(result.invitations);
    } catch {
      setError(t.error);
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  }, [t.error]);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  async function handleInvitationAction(
    invitation: Invitation,
    action: "accept" | "decline",
  ) {
    setPendingId(invitation.membership_id);
    setPendingAction(action);
    setError("");
    setMessage("");

    try {
      await apiRequest(
        `/api/accounts/${invitation.account_id}/members/${invitation.membership_id}/${action}`,
        {
          method: "POST",
        },
      );

      setMessage(
        action === "accept" ? t.accepted : t.declined,
      );

      setInvitations((current) =>
        current.filter(
          (item) =>
            item.membership_id !== invitation.membership_id,
        ),
      );
    } catch {
      setError(t.actionError);
    } finally {
      setPendingId("");
      setPendingAction("");
    }
  }

  function roleLabel(value: string) {
    const map: Record<string, string> = {
      account_owner: t.owner,
      account_admin: t.admin,
      account_manager: t.manager,
      account_employee: t.employee,
      account_viewer: t.viewer,
    };

    return map[value] ?? value;
  }

  function accountTypeLabel(value: string) {
    const map: Record<string, string> = {
      company: t.company,
      supplier: t.supplier,
      manufacturer: t.manufacturer,
      trader: t.trader,
      brand: t.brandType,
    };

    return map[value] ?? value;
  }

  function formatDate(value: string) {
    if (!value) return t.unknown;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return t.unknown;
    }

    return new Intl.DateTimeFormat(
      locale === "ar" ? "ar" : "en",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    ).format(date);
  }

  return (
    <main
      className="business-page"
      lang={locale}
      dir={direction}
    >
      <header className="business-header">
        <Link href="/" className="business-brand">
          <span className="business-logo">W</span>
          <span>{t.brand}</span>
        </Link>

        <div className="business-header-actions">
          <Link href="/" className="business-home">
            {t.home}
          </Link>

          <Link href="/business" className="business-home">
            {t.business}
          </Link>

          <button
            type="button"
            className="business-language"
            onClick={() =>
              setLocale((current) =>
                current === "ar" ? "en" : "ar",
              )
            }
          >
            {locale === "ar" ? "English" : "العربية"}
          </button>
        </div>
      </header>

      <section className="business-container">
        <div className="business-heading">
          <div>
            <span className="business-eyebrow">
              WASLA MEMBERSHIP
            </span>

            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>

          <button
            type="button"
            className="business-refresh"
            onClick={() => void loadInvitations()}
            disabled={loading || Boolean(pendingId)}
          >
            ↻ {t.refresh}
          </button>
        </div>

        {error && (
          <div
            className="business-alert business-alert-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {message && (
          <div
            className="business-alert business-alert-success"
            role="status"
          >
            {message}
          </div>
        )}

        {loading ? (
          <div className="business-members-card">
            <div className="business-loading">
              {t.loading}
            </div>
          </div>
        ) : invitations.length === 0 ? (
          <section className="business-empty">
            <div className="business-empty-icon">✉</div>

            <h2>{t.emptyTitle}</h2>
            <p>{t.emptyText}</p>

            <Link
              href="/"
              className="business-primary-link"
            >
              {t.back}
            </Link>
          </section>
        ) : (
          <section className="business-team-section">
            <div className="business-section-heading">
              <div>
                <span className="business-section-label">
                  WASLA / INVITATIONS
                </span>
                <h2>{t.title}</h2>
              </div>

              <span className="business-count">
                {invitations.length}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gap: "16px",
              }}
            >
              {invitations.map((invitation) => {
                const isPending =
                  pendingId === invitation.membership_id;

                return (
                  <article
                    key={invitation.membership_id}
                    className="business-account-card"
                    style={{
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div className="business-account-symbol">
                      W
                    </div>

                    <div className="business-account-info">
                      <span>
                        {accountTypeLabel(
                          invitation.account_type,
                        )}
                      </span>

                      <h3>{invitation.display_name}</h3>

                      <p>{invitation.legal_name}</p>

                      <div
                        style={{
                          display: "grid",
                          gap: "7px",
                          marginTop: "15px",
                          color: "#738092",
                          fontSize: "12px",
                          lineHeight: 1.8,
                        }}
                      >
                        <span>
                          <strong>{t.role}: </strong>
                          {roleLabel(invitation.role)}
                        </span>

                        <span>
                          <strong>{t.invitedBy}: </strong>
                          {invitation.invited_by_name ||
                            invitation.invited_by_email ||
                            t.unknown}
                          {invitation.invited_by_name &&
                            invitation.invited_by_email
                            ? ` (${invitation.invited_by_email})`
                            : ""}
                        </span>

                        <span>
                          <strong>{t.invitedAt}: </strong>
                          {formatDate(invitation.invited_at)}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: "10px",
                        width: "min(100%, 190px)",
                      }}
                    >
                      <button
                        type="button"
                        className="business-invite-button"
                        disabled={Boolean(pendingId)}
                        onClick={() =>
                          void handleInvitationAction(
                            invitation,
                            "accept",
                          )
                        }
                      >
                        {isPending &&
                        pendingAction === "accept"
                          ? t.accepting
                          : t.accept}
                      </button>

                      <button
                        type="button"
                        className="business-status-button"
                        disabled={Boolean(pendingId)}
                        onClick={() =>
                          void handleInvitationAction(
                            invitation,
                            "decline",
                          )
                        }
                      >
                        {isPending &&
                        pendingAction === "decline"
                          ? t.declining
                          : t.decline}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <footer className="business-footer">
          WASLA · A global platform for commerce and business
        </footer>
      </section>
    </main>
  );
}
