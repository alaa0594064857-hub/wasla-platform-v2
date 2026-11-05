"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

type Locale = "ar" | "en";
type Account = { id: string; display_name: string; legal_name: string; role: string };
type Store = {
  id: string; account_id: string; name: string; slug: string; status: string;
  account_name: string; account_role: string; store_role: string | null;
};
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

const copy = {
  ar: {
    title: "متاجري الخاصة", subtitle: "أنشئ متجرك وأدر متاجرك المرتبطة بحساباتك التجارية من مكان واحد.",
    home: "الرئيسية", business: "إدارة الأعمال", create: "إنشاء متجر جديد", storeName: "اسم المتجر",
    account: "الحساب التجاري المالك", choose: "اختر الحساب", submit: "إنشاء المتجر", creating: "جارٍ الإنشاء...",
    empty: "لا تملك متاجر حتى الآن. ابدأ بإنشاء متجرك الأول.", loading: "جارٍ تحميل متاجرك...",
    noAccounts: "تحتاج أولاً إلى إنشاء حساب تجاري تملكه أو تملك صلاحية إدارته.",
    retry: "إعادة المحاولة", error: "تعذر إكمال الطلب. تحقق من تسجيل الدخول وصلاحيات الحساب.",
    active: "نشط", suspended: "موقوف", slug: "رابط المتجر", owner: "حساب النشاط",
    success: "تم إنشاء المتجر بنجاح.", intro: "مساحة عمل التاجر",
  },
  en: {
    title: "My private shops", subtitle: "Create and manage the shops connected to your business accounts in one place.",
    home: "Home", business: "Business management", create: "Create a new shop", storeName: "Shop name",
    account: "Owning business account", choose: "Choose an account", submit: "Create shop", creating: "Creating...",
    empty: "You do not have any shops yet. Create your first shop to get started.", loading: "Loading your shops...",
    noAccounts: "First create a business account that you own or are authorized to manage.",
    retry: "Try again", error: "Could not complete the request. Check your sign-in and account permissions.",
    active: "Active", suspended: "Suspended", slug: "Shop address", owner: "Business account",
    success: "Your shop was created successfully.", intro: "Seller workspace",
  },
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options, credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  let data: Record<string, unknown>;
  try {
    data = await response.json() as Record<string, unknown>;
  } catch {
    throw new Error(`${path}: server returned a non-JSON response (HTTP ${response.status})`);
  }
  if (!response.ok || data.success !== true) {
    const detail = typeof data.error === "string" ? data.error : "Request failed";
    throw new Error(`${path}: HTTP ${response.status} — ${detail}`);
  }
  return data as T;
}

export default function ShopsPage() {
  const [locale, setLocale] = useState<Locale>("ar");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const t = copy[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [accountData, storeData] = await Promise.all([
        request<{ accounts: Account[] }>("/api/accounts"),
        request<{ stores: Store[] }>("/api/stores"),
      ]);
      setAccounts(accountData.accounts);
      setStores(storeData.stores);
      setAccountId(current => current && accountData.accounts.some(a => a.id === current)
        ? current : accountData.accounts[0]?.id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally { setLoading(false); }
  }, [t.error]);

  useEffect(() => { void load(); }, [load]);

  async function createStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCreating(true); setError(""); setMessage("");
    try {
      await request("/api/stores", {
        method: "POST", body: JSON.stringify({ accountId, name: name.trim() }),
      });
      setName(""); setMessage(t.success); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally { setCreating(false); }
  }

  return (
    <main className="shops-page" lang={locale} dir={dir}>
      <header className="shops-header">
        <Link href="/" className="shops-brand"><span className="shops-mark">W</span><span>WASLA <small>وصلة</small></span></Link>
        <nav><Link href="/">{t.home}</Link><Link href="/business">{t.business}</Link></nav>
        <button type="button" className="shops-language" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "English" : "العربية"}</button>
      </header>

      <section className="shops-main">
        <div className="shops-heading">
          <div><span className="shops-eyebrow">{t.intro}</span><h1>{t.title}</h1><p>{t.subtitle}</p></div>
          <div className="shops-heading-icon" aria-hidden="true">W</div>
        </div>

        {error && <div className="shops-alert" role="alert">{error} <button type="button" onClick={() => void load()}>{t.retry}</button></div>}
        {message && <div className="shops-success" role="status">{message}</div>}

        <div className="shops-layout">
          <section className="shops-list-section">
            <div className="shops-section-title"><div><span>01 / WASLA SHOPS</span><h2>{t.title}</h2></div><b>{stores.length}</b></div>
            {loading ? <div className="shops-empty">{t.loading}</div> : stores.length === 0 ? (
              <div className="shops-empty"><span className="shops-empty-mark">W</span><p>{t.empty}</p></div>
            ) : (
              <div className="shops-grid">
                {stores.map(store => (
                  <article className="shops-card" key={store.id}>
                    <div className="shops-card-top"><span className="shops-card-mark">W</span><span className={`shops-status ${store.status === "active" ? "is-active" : ""}`}>{store.status === "active" ? t.active : t.suspended}</span></div>
                    <h3><Link href={`/shops/${store.slug}`}>{store.name}</Link></h3><p>{t.owner}: {store.account_name}</p>
                    <div className="shops-slug"><small>{t.slug}</small><strong dir="ltr">/shops/{store.slug}</strong></div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="shops-create-card">
            <span className="shops-eyebrow">02 / CREATE</span><h2>{t.create}</h2>
            <form onSubmit={createStore}>
              <label>{t.storeName}<input value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={120} required placeholder={locale === "ar" ? "مثال: متجر الأناقة" : "e.g. Elegance Store"} /></label>
              <label>{t.account}<select value={accountId} onChange={e => setAccountId(e.target.value)} required>
                <option value="">{t.choose}</option>
                {accounts.map(account => <option key={account.id} value={account.id}>{account.display_name}</option>)}
              </select></label>
              {accounts.length === 0 && !loading && <p className="shops-note">{t.noAccounts}</p>}
              <button type="submit" disabled={creating || !accountId}>{creating ? t.creating : t.submit}<span>↗</span></button>
            </form>
          </aside>
        </div>
        <footer className="shops-footer">WASLA · A global platform for commerce and business</footer>
      </section>
    </main>
  );
}
