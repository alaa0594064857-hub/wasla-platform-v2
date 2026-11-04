"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Locale = "ar" | "en";

type Account = {
  id: string;
  account_type: string;
  legal_name: string;
  display_name: string;
  status: string;
  role: string;
};

type Member = {
  membership_id: string;
  user_id: string;
  name: string;
  email: string;
  status: "invited" | "active" | "suspended" | "revoked";
  role: string;
};

const labels = {
  ar: {
    brand: "وصلة",
    title: "إدارة الأعمال",
    subtitle: "إدارة حسابات الشركات وأعضاء فريقك من مكان واحد.",
    home: "الرئيسية",
    refresh: "تحديث",
    accounts: "حساباتي التجارية",
    members: "أعضاء الفريق",
    choose: "اختر حساباً تجارياً",
    noAccounts: "لا توجد حسابات تجارية مرتبطة بحسابك.",
    noMembers: "لا يوجد أعضاء في هذا الحساب حتى الآن.",
    loading: "جارٍ تحميل البيانات...",
    error: "تعذر تحميل البيانات. يرجى المحاولة مرة أخرى.",
    invite: "دعوة عضو جديد",
    email: "البريد الإلكتروني للعضو",
    role: "الدور الوظيفي",
    send: "إرسال الدعوة",
    sending: "جارٍ الإرسال...",
    manager: "مدير",
    employee: "موظف",
    viewer: "مشاهد",
    owner: "مالك الحساب",
    admin: "مدير الحساب",
    invited: "بانتظار القبول",
    active: "نشط",
    suspended: "موقوف",
    revoked: "ملغاة",
    changeRole: "تغيير الدور",
    suspend: "إيقاف",
    activate: "تفعيل",
    inviteSuccess: "تم إنشاء الدعوة بنجاح.",
    updateSuccess: "تم تحديث العضوية بنجاح.",
    actionError: "تعذر تنفيذ العملية. تحقق من الصلاحيات والبيانات.",
    accountType: "نوع الحساب",
    company: "شركة",
    supplier: "مورد",
    manufacturer: "مصنّع",
    trader: "تاجر",
    brandType: "علامة تجارية",
    accessDenied: "ليس لديك صلاحية لإدارة هذا العضو.",
    back: "العودة للرئيسية",
  },
  en: {
    brand: "WASLA",
    title: "Business Management",
    subtitle: "Manage your business accounts and team members in one place.",
    home: "Home",
    refresh: "Refresh",
    accounts: "My business accounts",
    members: "Team members",
    choose: "Choose a business account",
    noAccounts: "No business accounts are linked to your account.",
    noMembers: "There are no members in this account yet.",
    loading: "Loading data...",
    error: "Unable to load data. Please try again.",
    invite: "Invite a new member",
    email: "Member email address",
    role: "Member role",
    send: "Send invitation",
    sending: "Sending...",
    manager: "Manager",
    employee: "Employee",
    viewer: "Viewer",
    owner: "Account owner",
    admin: "Account administrator",
    invited: "Invitation pending",
    active: "Active",
    suspended: "Suspended",
    revoked: "Revoked",
    changeRole: "Change role",
    suspend: "Suspend",
    activate: "Activate",
    inviteSuccess: "Invitation created successfully.",
    updateSuccess: "Membership updated successfully.",
    actionError: "Action failed. Check permissions and details.",
    accountType: "Account type",
    company: "Company",
    supplier: "Supplier",
    manufacturer: "Manufacturer",
    trader: "Trader",
    brandType: "Brand",
    accessDenied: "You do not have permission to manage this member.",
    back: "Back to home",
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

  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(data.error ?? "Request failed");
  }

  return data as T;
}

export default function BusinessManagementPage() {
  const [locale, setLocale] = useState<Locale>("ar");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("account_employee");
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const t = labels[locale];
  const direction = locale === "ar" ? "rtl" : "ltr";

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await apiRequest<{
        accounts: Account[];
      }>("/api/accounts");

      setAccounts(result.accounts);

      setSelectedAccount((current) => {
        if (
          current &&
          result.accounts.some((account) => account.id === current)
        ) {
          return current;
        }

        return result.accounts[0]?.id ?? "";
      });
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }, [t.error]);

  const loadMembers = useCallback(async () => {
    if (!selectedAccount) {
      setMembers([]);
      return;
    }

    setMembersLoading(true);
    setError("");

    try {
      const result = await apiRequest<{
        members: Member[];
      }>(`/api/accounts/${selectedAccount}/members`);

      setMembers(result.members);
    } catch {
      setError(t.error);
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [selectedAccount, t.error]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccount) return;

    setSending(true);
    setError("");
    setMessage("");

    try {
      await apiRequest(
        `/api/accounts/${selectedAccount}/members`,
        {
          method: "POST",
          body: JSON.stringify({
            email: email.trim(),
            role,
          }),
        },
      );

      setEmail("");
      setMessage(t.inviteSuccess);
      await loadMembers();
    } catch {
      setError(t.actionError);
    } finally {
      setSending(false);
    }
  }

  async function updateMember(
    member: Member,
    data: { role: string } | { status: string },
  ) {
    setError("");
    setMessage("");

    try {
      await apiRequest(
        `/api/accounts/${selectedAccount}/members/${member.membership_id}`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
      );

      setMessage(t.updateSuccess);
      await loadMembers();
    } catch {
      setError(t.actionError);
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

  function statusLabel(value: string) {
    const map: Record<string, string> = {
      invited: t.invited,
      active: t.active,
      suspended: t.suspended,
      revoked: t.revoked,
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

  const selected = accounts.find(
    (account) => account.id === selectedAccount,
  );

  const manageableRoles = [
    "account_manager",
    "account_employee",
    "account_viewer",
  ];

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
              WASLA BUSINESS
            </span>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>

          <button
            type="button"
            className="business-refresh"
            onClick={() => void loadAccounts()}
            disabled={loading}
          >
            ↻ {t.refresh}
          </button>
        </div>

        {error && (
          <div className="business-alert business-alert-error" role="alert">
            {error}
          </div>
        )}

        {message && (
          <div className="business-alert business-alert-success" role="status">
            {message}
          </div>
        )}

        {loading ? (
          <div className="business-loading">{t.loading}</div>
        ) : accounts.length === 0 ? (
          <section className="business-empty">
            <div className="business-empty-icon">⌂</div>
            <h2>{t.accounts}</h2>
            <p>{t.noAccounts}</p>
            <Link href="/" className="business-primary-link">
              {t.back}
            </Link>
          </section>
        ) : (
          <>
            <section className="business-account-section">
              <div className="business-section-heading">
                <div>
                  <span className="business-section-label">
                    01 / WASLA ACCOUNTS
                  </span>
                  <h2>{t.accounts}</h2>
                </div>
              </div>

              <label className="business-select-label">
                {t.choose}
                <select
                  value={selectedAccount}
                  onChange={(event) =>
                    setSelectedAccount(event.target.value)
                  }
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.display_name}
                    </option>
                  ))}
                </select>
              </label>

              {selected && (
                <article className="business-account-card">
                  <div className="business-account-symbol">W</div>
                  <div className="business-account-info">
                    <span>{accountTypeLabel(selected.account_type)}</span>
                    <h3>{selected.display_name}</h3>
                    <p>{selected.legal_name}</p>
                  </div>
                  <div className="business-account-role">
                    {roleLabel(selected.role)}
                  </div>
                </article>
              )}
            </section>

            {selected && (
              <section className="business-team-section">
                <div className="business-section-heading">
                  <div>
                    <span className="business-section-label">
                      02 / TEAM MANAGEMENT
                    </span>
                    <h2>{t.members}</h2>
                  </div>
                  <span className="business-count">
                    {members.length}
                  </span>
                </div>

                <div className="business-members-card">
                  {membersLoading ? (
                    <div className="business-loading">
                      {t.loading}
                    </div>
                  ) : members.length === 0 ? (
                    <div className="business-no-members">
                      {t.noMembers}
                    </div>
                  ) : (
                    <div className="business-table-wrap">
                      <table className="business-table">
                        <thead>
                          <tr>
                            <th>{t.email}</th>
                            <th>{t.role}</th>
                            <th>{t.members}</th>
                            <th>{t.changeRole}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {members.map((member) => {
                            const manageable =
                              manageableRoles.includes(member.role) &&
                              ["active", "suspended"].includes(member.status);

                            return (
                              <tr key={member.membership_id}>
                                <td>
                                  <div className="business-member-name">
                                    <strong>{member.name}</strong>
                                    <small>{member.email}</small>
                                  </div>
                                </td>
                                <td>{roleLabel(member.role)}</td>
                                <td>
                                  <span
                                    className={`business-status status-${member.status}`}
                                  >
                                    {statusLabel(member.status)}
                                  </span>
                                </td>
                                <td>
                                  {manageable ? (
                                    <div className="business-member-actions">
                                      <select
                                        aria-label={t.changeRole}
                                        value={member.role}
                                        onChange={(event) =>
                                          void updateMember(member, {
                                            role: event.target.value,
                                          })
                                        }
                                      >
                                        {manageableRoles.map((item) => (
                                          <option key={item} value={item}>
                                            {roleLabel(item)}
                                          </option>
                                        ))}
                                      </select>

                                      <button
                                        type="button"
                                        className="business-status-button"
                                        onClick={() =>
                                          void updateMember(member, {
                                            status:
                                              member.status === "active"
                                                ? "suspended"
                                                : "active",
                                          })
                                        }
                                      >
                                        {member.status === "active"
                                          ? t.suspend
                                          : t.activate}
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="business-protected">
                                      {roleLabel(member.role)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            )}

            {selected && (
              <section className="business-invite-section">
                <div className="business-section-heading">
                  <div>
                    <span className="business-section-label">
                      03 / GROW YOUR TEAM
                    </span>
                    <h2>{t.invite}</h2>
                  </div>
                </div>

                <form
                  className="business-invite-form"
                  onSubmit={inviteMember}
                >
                  <label>
                    <span>{t.email}</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) =>
                        setEmail(event.target.value)
                      }
                      placeholder="name@example.com"
                      maxLength={320}
                      required
                    />
                  </label>

                  <label>
                    <span>{t.role}</span>
                    <select
                      value={role}
                      onChange={(event) =>
                        setRole(event.target.value)
                      }
                    >
                      <option value="account_manager">
                        {t.manager}
                      </option>
                      <option value="account_employee">
                        {t.employee}
                      </option>
                      <option value="account_viewer">
                        {t.viewer}
                      </option>
                    </select>
                  </label>

                  <button
                    type="submit"
                    disabled={sending}
                    className="business-invite-button"
                  >
                    {sending ? t.sending : t.send}
                    <span>↗</span>
                  </button>
                </form>
              </section>
            )}
          </>
        )}

        <footer className="business-footer">
          WASLA · A global platform for commerce and business
        </footer>
      </section>
    </main>
  );
}
