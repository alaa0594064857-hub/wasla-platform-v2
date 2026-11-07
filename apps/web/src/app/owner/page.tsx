"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLocale } from "../../components/locale-provider";

type Access = { roles: string[]; permissions: string[] };
type PlatformUser = { id: string; name: string; email: string; email_verified: boolean; status: string; registration_type: string | null; preferred_locale: string; created_at: string; is_platform_owner: boolean };
type OwnerProfile = { name?: string | null; email?: string | null; image?: string | null };
type Overview = { totals: { accounts: number; stores: number; users: number }; accountsByType: { account_type: string; status: string; total: number }[]; storesByStatus: { status: string; total: number }[]; businessVerification: { account_type: string; verification_status: string | null; total: number }[]; availableModules: Record<string, boolean>; notes: { stores: string; unavailable: string } };

export default function PlatformOwnerPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [usersTotal, setUsersTotal] = useState<number | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [usersError, setUsersError] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState("overview");
  const ar = locale === "ar";
  const profile = (session?.user || {}) as OwnerProfile;
  const ownerName = profile.name || (ar ? "مالك المنصة" : "Platform Owner");
  const ownerEmail = profile.email || "";
  const initials = ownerName.trim().split(/\\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "W";

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) { router.replace("/login"); return; }
    let active = true;
    fetch("/api/platform/security", { credentials: "include", cache: "no-store" })
      .then(async response => {
        if (response.status === 401) { router.replace("/login"); return null; }
        if (response.status === 403) { if (active) setDenied(true); return null; }
        if (!response.ok) throw new Error("security-check-failed");
        return response.json();
      })
      .then(data => {
        if (!active || !data) return;
        if (data.success && Array.isArray(data.platformAccess?.roles) && data.platformAccess.roles.includes("platform_owner")) {
          setAccess({ roles: data.platformAccess.roles, permissions: data.platformAccess.permissions || [] });
        } else setDenied(true);
      })
      .catch(() => { if (active) setDenied(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isPending, session?.user?.id, router]);

  useEffect(() => {
    if (!access?.permissions.includes("platform.users.read")) return;
    let active = true;
    setUsersLoading(true);
    setUsersError(false);
    const params = new URLSearchParams({ page: "1", limit: "25" });
    if (userSearch.trim()) params.set("search", userSearch.trim());
    fetch(`/api/platform/users?${params.toString()}`, { credentials: "include", cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("users-load-failed");
        return response.json();
      })
      .then(data => { if (active && data?.success && Array.isArray(data.users)) { setUsers(data.users); setUsersTotal(Number(data.pagination?.total ?? data.users.length)); } })
      .catch(() => { if (active) setUsersError(true); })
      .finally(() => { if (active) setUsersLoading(false); });
    return () => { active = false; };
  }, [access, userSearch]);

  useEffect(() => {
    if (!access?.permissions.includes("platform.reports.read")) return;
    let active = true;
    fetch("/api/platform/overview", { credentials: "include", cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("overview-load-failed");
        return response.json();
      })
      .then(data => { if (active && data?.success) setOverview(data); })
      .catch(() => { if (active) setOverviewError(true); });
    return () => { active = false; };
  }, [access]);

  const copy = ar ? {
    title: "مركز قيادة المنصة", subtitle: "المكتب التنفيذي الخاص بإدارة WASLA",
    overview: "نظرة عامة", users: "المستخدمون", roles: "الأدوار والصلاحيات",
    security: "الأمان والتدقيق", settings: "إعدادات المنصة", account: "حسابي",
    owner: "المالك والمؤسس", verified: "دخول موثّق", welcome: "مرحباً بعودتك",
    description: "من هنا تدير المنصة على المستوى الأعلى، وتتابع الحسابات والصلاحيات وأمن النظام.",
    access: "مستوى الوصول", role: "مالك المنصة الأعلى", permissions: "الصلاحيات الفعلية",
    userCount: "إجمالي المستخدمين", storeCount: "المتاجر", businessCount: "حسابات الأعمال", directory: "دليل المستخدمين والحسابات",
    directoryNote: "عرض آمن للقراءة فقط. لن تتاح إجراءات التعديل قبل استكمال ضوابط الحماية والتدقيق.",
    search: "ابحث بالاسم أو البريد الإلكتروني", name: "الاسم", email: "البريد الإلكتروني",
    status: "الحالة", verifiedCol: "تأكيد البريد", type: "نوع الحساب", yes: "مؤكد",
    no: "غير مؤكد", loadingUsers: "جارٍ تحميل المستخدمين...", failed: "تعذر تحميل قائمة المستخدمين.",
    empty: "لا توجد نتائج مطابقة.", securityTitle: "حالة الحماية والصلاحيات",
    securityNote: "التحقق من صلاحيات المالك يتم على الخادم، وليس اعتماداً على عناصر الواجهة.",
    openAccount: "إعدادات الحساب", signOut: "تسجيل الخروج", restricted: "هذه المساحة مخصصة لمالك المنصة",
    restrictedNote: "لم يتم منح هذا الحساب صلاحية الدخول. لم يتم عرض أي بيانات إدارية.",
    back: "العودة إلى حسابي", loading: "جارٍ التحقق من هوية المالك وصلاحياته..."
  } : {
    title: "Platform Command Center", subtitle: "WASLA executive administration office",
    overview: "Overview", users: "Users", roles: "Roles & permissions",
    security: "Security & audit", settings: "Platform settings", account: "My account",
    owner: "Owner & founder", verified: "Verified access", welcome: "Welcome back",
    description: "Manage WASLA at the highest level, and oversee accounts, permissions, and platform security.",
    access: "Access level", role: "Platform Super Admin", permissions: "Effective permissions",
    userCount: "Total users", storeCount: "Stores", businessCount: "Business accounts", directory: "Users & accounts directory",
    directoryNote: "Secure read-only view. Management actions remain disabled until their safeguards and audit controls are complete.",
    search: "Search by name or email", name: "Name", email: "Email",
    status: "Status", verifiedCol: "Email verified", type: "Account type", yes: "Verified",
    no: "Unverified", loadingUsers: "Loading users...", failed: "Could not load users.",
    empty: "No matching users.", securityTitle: "Security & access status",
    securityNote: "Owner permissions are verified on the server, not trusted from the interface.",
    openAccount: "Account settings", signOut: "Sign out", restricted: "This area is restricted to the platform owner",
    restrictedNote: "This account has not been granted access. No administrative data was disclosed.",
    back: "Back to my account", loading: "Verifying owner identity and permissions..."
  };

  if (isPending || loading) return <main dir={ar ? "rtl" : "ltr"} style={styles.loading}><div style={styles.loaderMark}>W</div><p>{copy.loading}</p></main>;
  if (!access || denied) return <main dir={ar ? "rtl" : "ltr"} style={styles.loading}><section style={styles.denied}><h1>{copy.restricted}</h1><p>{copy.restrictedNote}</p><Link href="/account" style={styles.actionLink}>{copy.back}</Link></section></main>;

  const nav = [
    { id: "overview", label: copy.overview, icon: "⌂", href: "#overview" },
    { id: "users", label: copy.users, icon: "♙", href: "#users" },
    { id: "roles", label: copy.roles, icon: "◇", href: "#roles" },
    { id: "security", label: copy.security, icon: "◈", href: "#security" },
    { id: "settings", label: copy.settings, icon: "⚙", href: "#settings" },
    { id: "subscriptions", label: ar ? "خطط الاشتراك" : "Subscription plans", icon: "＄", href: "/owner/subscriptions" },
    { id: "official-store", label: ar ? "متجر WASLA الرسمي" : "Official WASLA Store", icon: "▣", href: "/owner/official-store" }
  ];

  const roomDefs = [
    { id: "stores", icon: "▣", ar: "المتاجر المشتركة", en: "Member stores", count: overview?.totals.stores, available: true },
    { id: "company", icon: "▦", ar: "الشركات", en: "Companies", count: countType("company"), available: true },
    { id: "manufacturer", icon: "⚙", ar: "المصانع", en: "Manufacturers", count: countType("manufacturer"), available: true },
    { id: "supplier", icon: "⇄", ar: "الموردون", en: "Suppliers", count: countType("supplier"), available: true },
    { id: "brand", icon: "✧", ar: "العلامات التجارية", en: "Brands", count: countType("brand"), available: true },
    { id: "trader", icon: "◇", ar: "التجار", en: "Traders", count: countType("trader"), available: true },
    { id: "ai", icon: "✳", ar: "غرفة الذكاء الاصطناعي", en: "AI operations room", available: true },
    { id: "orders", icon: "▤", ar: "الطلبات والمبيعات", en: "Orders & sales", available: false },
    { id: "ratings", icon: "☆", ar: "التقييمات", en: "Ratings & reviews", available: false },
    { id: "inquiries", icon: "✉", ar: "الاستفسارات", en: "Inquiries", available: false },
    { id: "complaints", icon: "⚑", ar: "الشكاوى والنزاعات", en: "Complaints & disputes", available: false }
  ];
  function countType(type: string): number {
    return overview?.accountsByType.filter(row => row.account_type === type).reduce((total, row) => total + Number(row.total), 0) || 0;
  }
  function countTypeStatus(type: string, status: string): number {
    return overview?.accountsByType.filter(row => row.account_type === type && row.status === status).reduce((total, row) => total + Number(row.total), 0) || 0;
  }
  const selectedRoomDef = roomDefs.find(room => room.id === selectedRoom);

  return <main dir={ar ? "rtl" : "ltr"} lang={locale} style={styles.shell}>
    <aside style={styles.sidebar}>
      <Link href="/owner" style={styles.brand}><span style={styles.brandMark}>W</span><span><strong>WASLA</strong><small>OWNER OFFICE</small></span></Link>
      <div style={styles.navLabel}>{ar ? "الإدارة العليا" : "EXECUTIVE"}</div>
      <nav style={styles.nav}>{nav.map((item, index) => <a key={item.id} href={item.href} style={{ ...styles.navItem, ...(index === 0 ? styles.navActive : {}) }}><span style={styles.navIcon}>{item.icon}</span>{item.label}</a>)}</nav>
      <div style={styles.sidebarBottom}>
        <div style={styles.sideStatus}><span style={styles.onlineDot}/><span>{copy.verified}</span></div>
        <Link href="/account" style={styles.sideAccount}>{copy.account} ↗</Link>
      </div>
    </aside>

    <div style={styles.main}>
      <header style={styles.topbar}>
        <div><div style={styles.breadcrumb}>WASLA <span>/</span> OWNER OFFICE</div><div style={styles.topTitle}>{copy.title}</div></div>
        <div style={styles.topProfile}>
          {profile.image ? <img src={profile.image} alt={ownerName} style={styles.avatar}/> : <div style={styles.avatarFallback}>{initials}</div>}
          <div style={styles.profileText}><strong>{ownerName}</strong><small>{copy.owner}</small></div>
          <Link href="/account" style={styles.profileAction} aria-label={copy.openAccount}>⚙</Link>
        </div>
      </header>

      <section id="overview" style={styles.content}>
        <div style={styles.welcomeRow}>
          <div><div style={styles.eyebrow}>{copy.welcome}</div><h1>{copy.title}</h1><p>{copy.description}</p></div>
          <div style={styles.ownerBadge}><span style={styles.badgeCrown}>♛</span><span><strong>{copy.role}</strong><small>{copy.verified}</small></span></div>
        </div>

        <div style={styles.metrics}>
          <article style={styles.metric}><span style={styles.metricIcon}>♙</span><small>{copy.userCount}</small><strong>{overview ? overview.totals.users : (usersLoading ? "—" : (usersTotal ?? users.length))}</strong><span style={styles.metricFoot}>{ar ? "عدد الحسابات المسجلة فعلياً" : "Actual registered accounts"}</span></article>
          <article style={styles.metric}><span style={styles.metricIcon}>▣</span><small>{copy.storeCount}</small><strong>{overview ? overview.totals.stores : "—"}</strong><span style={styles.metricFoot}>{ar ? "المتاجر المسجلة في المنصة" : "Stores registered on the platform"}</span></article>
          <article style={styles.metric}><span style={styles.metricIcon}>▦</span><small>{copy.businessCount}</small><strong>{overview ? overview.totals.accounts : "—"}</strong><span style={styles.metricFoot}>{ar ? "حسابات الأعمال المسجلة" : "Registered business accounts"}</span></article>
        </div>

        <section style={styles.roomSection}>
          <div style={styles.roomHeading}><div><span style={styles.panelEyebrow}>PLATFORM DEPARTMENTS</span><h2>{ar ? "غرف إدارة المنصة" : "Platform management rooms"}</h2><p>{ar ? "كل قسم له غرفة مستقلة لعرض أرقامه ومتابعة أعماله." : "Each department has its own room for metrics and operational oversight."}</p></div><span style={styles.readOnly}>{ar ? "مركز المالك" : "OWNER CONTROL"}</span></div>
          {overviewError ? <p style={styles.notice}>{ar ? "تعذر تحميل الإحصاءات المباشرة." : "Could not load live platform metrics."}</p> : null}
          <div style={styles.roomGrid}>{roomDefs.map(room => <button key={room.id} type="button" onClick={() => room.id === "ai" ? router.push("/owner/ai") : setSelectedRoom(room.id)} style={{ ...styles.roomCard, ...(selectedRoom === room.id ? styles.roomCardSelected : {}) }}>
            <span style={styles.roomIcon}>{room.icon}</span><strong>{ar ? room.ar : room.en}</strong><span style={styles.roomCount}>{room.available ? (room.count ?? "—") : (ar ? "قريباً" : "PLANNED")}</span><small>{room.available ? (room.id === "ai" ? (ar ? "افتح مدير WASLA الذكي" : "Open WASLA AI Manager") : (ar ? "بيانات من قاعدة البيانات" : "Live database records")) : (ar ? "بانتظار بناء وربط الوحدة" : "Module integration pending")}</small>
          </button>)}</div>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelHead}><div><span style={styles.panelEyebrow}>ROOM / {selectedRoom.toUpperCase()}</span><h2>{selectedRoomDef ? (ar ? selectedRoomDef.ar : selectedRoomDef.en) : copy.overview}</h2></div><span style={styles.readOnly}>{selectedRoomDef?.available ? (ar ? "بيانات متاحة" : "DATA CONNECTED") : (ar ? "قيد التطوير" : "IN DEVELOPMENT")}</span></div>
          {selectedRoom === "stores" ? <><p>{ar ? "عدد المتاجر التابعة للتجار والشركات، وليس المتجر الرسمي المستقل لـ WASLA." : "Member-owned stores only; this does not include the separate official WASLA Store."}</p><div style={styles.roomStats}>{(overview?.storesByStatus || []).map(row => <div key={row.status}><small>{row.status}</small><strong>{row.total}</strong></div>)}</div></> :
          ["company","manufacturer","supplier","brand","trader"].includes(selectedRoom) ? <><p>{ar ? "ملخص الحسابات حسب حالة التسجيل. ستظهر ملفات كل جهة وتفاصيلها بعد بناء شاشة القائمة التفصيلية." : "Account totals by registration status. Individual organization profiles will appear after the detailed directory is built."}</p><div style={styles.roomStats}>{["active","pending_verification","suspended","deactivated"].map(status => <div key={status}><small>{status}</small><strong>{countTypeStatus(selectedRoom,status)}</strong></div>)}</div></> :
          <div style={styles.futureRoom}><span style={styles.futureIcon}>✳</span><strong>{ar ? "هذه الغرفة لم تُربط ببيانات تشغيلية بعد" : "This room is not connected to operational data yet"}</strong><p>{ar ? "لن نعرض أرقاماً وهمية. نحتاج أولاً إلى بناء وحدة الطلبات/التقييمات/الاستفسارات أو سجل أعمال الذكاء الاصطناعي، ثم نربطها هنا." : "No fabricated metrics will be shown. The orders, reviews, inquiries, or AI activity module must be implemented before this room can show real data."}</p></div>}
          {overview?.notes?.stores && selectedRoom === "stores" ? <small style={styles.roomFootnote}>{ar ? overview.notes.stores : overview.notes.stores}</small> : null}
        </section>

        <section id="users" style={styles.panel}>
          <div style={styles.panelHead}><div><span style={styles.panelEyebrow}>01 / DIRECTORY</span><h2>{copy.directory}</h2><p>{copy.directoryNote}</p></div><span style={styles.readOnly}>{ar ? "قراءة فقط" : "READ ONLY"}</span></div>
          <input value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder={copy.search} aria-label={copy.search} style={styles.search}/>
          {usersLoading ? <p style={styles.notice}>{copy.loadingUsers}</p> : usersError ? <p style={styles.notice}>{copy.failed}</p> : <div style={{ overflowX: "auto" }}>
            <table style={styles.table}><thead><tr><th>{copy.name}</th><th>{copy.email}</th><th>{copy.status}</th><th>{copy.verifiedCol}</th><th>{copy.type}</th></tr></thead>
              <tbody>{users.map(user => <tr key={user.id}><td><strong>{user.name}</strong>{user.is_platform_owner ? <small style={styles.ownerTag}>{ar ? "مالك المنصة" : "PLATFORM OWNER"}</small> : null}</td><td>{user.email}</td><td><span style={styles.userStatus}>{user.status}</span></td><td>{user.email_verified ? copy.yes : copy.no}</td><td>{user.registration_type || "—"}</td></tr>)}</tbody>
            </table>
            {!users.length && <p style={styles.notice}>{copy.empty}</p>}
          </div>}
        </section>

        <div style={styles.lowerGrid}>
          <section id="security" style={styles.panel}><span style={styles.panelEyebrow}>02 / SECURITY</span><h2>{copy.securityTitle}</h2><p>{copy.securityNote}</p><div style={styles.securityLine}><span style={styles.onlineDot}/>{copy.verified}</div><div style={styles.permissionCount}>{access.permissions.length} <small>{copy.permissions}</small></div><Link href="/owner/audit" style={styles.actionLink}>{ar ? "فتح سجل التدقيق" : "Open audit log"} ↗</Link></section>
          <section id="roles" style={styles.panel}><span style={styles.panelEyebrow}>03 / AUTHORIZATION</span><h2>{copy.roles}</h2><p>{ar ? "الصلاحيات الحالية المرتبطة بدور مالك المنصة." : "Current permissions attached to the platform owner role."}</p><div style={styles.permissionList}>{access.permissions.map(permission => <span key={permission}>{permission}</span>)}</div></section>
        </div>
        <section id="settings" style={styles.footerPanel}><div><strong>{copy.owner}</strong><small>{ownerEmail}</small></div><Link href="/account" style={styles.actionLink}>{copy.openAccount} ↗</Link></section>
        <footer style={styles.footer}>WASLA OWNER OFFICE <span>•</span> {ar ? "مساحة إدارية خاصة" : "PRIVATE EXECUTIVE SPACE"}</footer>
      </section>
    </div>
  </main>;
}

const styles: Record<string, React.CSSProperties> = {
  shell: { minHeight: "100vh", display: "flex", background: "#f7f4ed", color: "#14243a", fontFamily: "Arial, sans-serif" },
  sidebar: { width: 250, minWidth: 250, minHeight: "100vh", padding: "28px 18px", background: "#14243a", color: "#f7f4ed", display: "flex", flexDirection: "column", boxSizing: "border-box" },
  brand: { display: "flex", alignItems: "center", gap: 12, padding: "4px 8px 34px", color: "#fff", textDecoration: "none" },
  brandMark: { width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 13, background: "linear-gradient(135deg,#dfc58f,#b18d4d)", color: "#14243a", fontSize: 23, fontWeight: 900 },
  navLabel: { color: "#77869a", fontSize: 10, letterSpacing: 2, padding: "0 12px 12px" },
  nav: { display: "grid", gap: 7 },
  navItem: { display: "flex", alignItems: "center", gap: 12, padding: "13px 12px", borderRadius: 11, textDecoration: "none", color: "#aeb9c8", fontSize: 13 },
  navActive: { color: "#dfc58f", background: "#203b59", boxShadow: "inset 3px 0 #c6a15b" },
  navIcon: { width: 22, textAlign: "center", fontSize: 19 },
  sidebarBottom: { marginTop: "auto", display: "grid", gap: 16, padding: "20px 10px 4px", borderTop: "1px solid #2b394b" },
  sideStatus: { display: "flex", alignItems: "center", gap: 9, color: "#aab7c6", fontSize: 11 },
  onlineDot: { display: "inline-block", width: 8, height: 8, borderRadius: 20, background: "#46b88a", boxShadow: "0 0 0 4px #46b88a22" },
  sideAccount: { color: "#dfc58f", textDecoration: "none", fontSize: 12 },
  main: { flex: 1, minWidth: 0 },
  topbar: { minHeight: 82, padding: "14px clamp(18px,4vw,48px)", background: "#fff", borderBottom: "1px solid #e5e0d5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" },
  breadcrumb: { color: "#8995a4", fontSize: 9, letterSpacing: 1.8, fontWeight: 700 },
  topTitle: { marginTop: 5, fontSize: 14, fontWeight: 700 },
  topProfile: { display: "flex", alignItems: "center", gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 50, objectFit: "cover", border: "2px solid #dfc47b" },
  avatarFallback: { width: 42, height: 42, borderRadius: 50, display: "grid", placeItems: "center", background: "#17283d", color: "#f0d995", fontWeight: 800, border: "2px solid #dfc47b" },
  profileText: { display: "grid", gap: 3, fontSize: 12 },
  profileAction: { color: "#6d7887", textDecoration: "none", padding: 8, border: "1px solid #e3e7ed", borderRadius: 9 },
  content: { maxWidth: 1440, margin: "0 auto", padding: "34px clamp(18px,4vw,48px) 24px" },
  welcomeRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 25 },
  eyebrow: { color: "#9b783d", fontSize: 11, fontWeight: 700, letterSpacing: 1.5 },
  ownerBadge: { display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #e5e0d5", padding: "13px 17px", borderRadius: 14 },
  badgeCrown: { color: "#b18d4d", fontSize: 25 },
  welcomeRowTitle: { fontSize: 30 },
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 22 },
  metric: { position: "relative", display: "grid", gap: 8, padding: 19, background: "#fff", border: "1px solid #e5e0d5", borderRadius: 15, boxShadow: "0 4px 16px #17243708" },
  metricIcon: { color: "#b18d4d", fontSize: 22 },
  metricFoot: { color: "#738092", fontSize: 10 },
  metricWord: { color: "#26734a", fontSize: 19 },
  roomSection: { marginBottom: 18 },
  roomHeading: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 14 },
  roomGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 },
  roomCard: { display: "grid", justifyItems: "start", gap: 8, minHeight: 138, padding: 15, textAlign: "start", border: "1px solid #e5e0d5", borderRadius: 14, background: "#fff", color: "#14243a", cursor: "pointer" },
  roomCardSelected: { border: "1px solid #b18d4d", background: "#f7f4ed", boxShadow: "0 0 0 2px #d6b76b22" },
  roomIcon: { color: "#9b783d", fontSize: 21 },
  roomCount: { fontSize: 23, fontWeight: 800, color: "#14243a" },
  roomStats: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginTop: 18 },
  roomFootnote: { display: "block", color: "#738092", marginTop: 18 },
  futureRoom: { display: "grid", justifyItems: "start", gap: 10, padding: "24px 0", color: "#596778" },
  futureIcon: { color: "#9b783d", fontSize: 28 },
  panel: { padding: "22px clamp(16px,2.5vw,28px)", background: "#fff", border: "1px solid #e5e0d5", borderRadius: 16, marginBottom: 17, boxShadow: "0 4px 16px #17243707" },
  panelHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" },
  panelEyebrow: { color: "#9b783d", fontSize: 9, fontWeight: 800, letterSpacing: 1.8 },
  readOnly: { color: "#805f2e", background: "#f7f4ed", padding: "7px 10px", borderRadius: 20, fontSize: 9, letterSpacing: 1 },
  search: { width: "100%", maxWidth: 420, boxSizing: "border-box", padding: "12px 14px", margin: "16px 0", borderRadius: 9, border: "1px solid #dce2e9", background: "#fafbfd", color: "#14243a", fontSize: 13 },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "start", fontSize: 12 },
  ownerTag: { display: "block", color: "#9b783d", fontSize: 9, marginTop: 4 },
  userStatus: { display: "inline-block", padding: "5px 8px", borderRadius: 20, background: "#edf6f1", color: "#26734a", fontSize: 10 },
  notice: { color: "#7b8795", fontSize: 13, padding: "10px 0" },
  lowerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 17 },
  securityLine: { display: "flex", alignItems: "center", gap: 10, marginTop: 20, color: "#26734a", fontSize: 12 },
  permissionCount: { marginTop: 15, fontSize: 25, fontWeight: 800, color: "#14243a" },
  permissionList: { display: "flex", flexWrap: "wrap", gap: 7, marginTop: 15 },
  footerPanel: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, flexWrap: "wrap", padding: 18, background: "#14243a", color: "#fff", borderRadius: 14, marginTop: 2 },
  actionLink: { display: "inline-block", color: "#dfc58f", textDecoration: "none", border: "1px solid #8e7543", padding: "10px 14px", borderRadius: 9, fontSize: 12 },
  footer: { textAlign: "center", color: "#9aa4b1", fontSize: 9, letterSpacing: 2, padding: "26px 0 8px" },
  loading: { minHeight: "100vh", display: "grid", placeContent: "center", justifyItems: "center", gap: 14, background: "#14243a", color: "#f7f4ed", fontFamily: "Arial, sans-serif" },
  loaderMark: { width: 54, height: 54, display: "grid", placeItems: "center", borderRadius: 16, background: "linear-gradient(135deg,#dfc58f,#b18d4d)", color: "#14243a", fontSize: 28, fontWeight: 900 },
  denied: { maxWidth: 560, margin: 24, padding: 30, border: "1px solid #45546a", borderRadius: 18, background: "#203b59" }
};
