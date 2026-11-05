"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale } from "../../components/locale-provider";
import WorkspaceHeader from "../../components/workspace-header";

type Person = { user_id: string; display_name: string; avatar_reference: string | null; relationship?: "none" | "friend" | "incoming" | "outgoing"; created_at?: string };
type Business = { account_id: string; display_name: string; account_type: string; country_code: string | null; is_following?: boolean };
type NetworkData = {
  friends: Person[];
  incomingRequests: Person[];
  outgoingRequests: Person[];
  followingAccounts: Business[];
  people: Person[];
  businesses: Business[];
};

const empty: NetworkData = { friends: [], incomingRequests: [], outgoingRequests: [], followingAccounts: [], people: [], businesses: [] };
const words = {
  ar: {
    eyebrow: "WASLA NETWORK", title: "شبكتك في وصلة", subtitle: "أشخاص تعرفهم، وشركات تتعامل معها، ومتاجر تتابعها — كلها في مكان واحد.",
    friends: "أصدقائي", incoming: "طلبات الصداقة", outgoing: "طلبات أرسلتها", following: "شركات في شبكتي",
    discover: "اكتشف الشبكة", search: "ابحث عن شخص أو شركة", searchButton: "بحث", people: "أشخاص قد تعرفهم",
    businesses: "شركات وأعمال", add: "إضافة صديق", friend: "صديق", sent: "تم إرسال الطلب", accept: "قبول", decline: "رفض",
    remove: "إزالة", follow: "إضافة إلى شبكتي", unfollow: "إلغاء المتابعة", emptyFriends: "لم تضف أصدقاء بعد. ابحث عن أشخاص وابدأ بتوسيع شبكتك.",
    emptyIncoming: "لا توجد طلبات جديدة.", emptyOutgoing: "لا توجد طلبات معلقة أرسلتها.", emptyFollowing: "لم تضف شركات إلى شبكتك بعد.",
    emptyPeople: "لا توجد نتائج مطابقة. جرّب اسمًا آخر.", emptyBusinesses: "لا توجد شركات مطابقة حاليًا.",
    loading: "جارٍ تحميل شبكتك...", error: "تعذر تحميل الشبكة. حاول مرة أخرى.", retry: "إعادة المحاولة",
    types: { company: "شركة", supplier: "مورد", manufacturer: "مصنّع", trader: "تاجر", brand: "علامة تجارية" },
    searchHint: "اكتب اسم شخص أو شركة ثم اضغط بحث.", privacy: "الصداقة لا تمنح صلاحية الوصول إلى بيانات أو حسابات الطرف الآخر. متابعة الشركة ليست شراكة تجارية.",
    removeConfirm: "هل تريد إزالة هذا الصديق؟"
  },
  en: {
    eyebrow: "WASLA NETWORK", title: "Your network on WASLA", subtitle: "People you know, businesses you work with and shops you follow — all in one place.",
    friends: "My friends", incoming: "Friend requests", outgoing: "Requests sent", following: "Businesses in my network",
    discover: "Discover the network", search: "Search for a person or business", searchButton: "Search", people: "People you may know",
    businesses: "Businesses", add: "Add friend", friend: "Friend", sent: "Request sent", accept: "Accept", decline: "Decline",
    remove: "Remove", follow: "Add to my network", unfollow: "Unfollow", emptyFriends: "No friends yet. Find people and start growing your network.",
    emptyIncoming: "No new requests.", emptyOutgoing: "No pending requests sent by you.", emptyFollowing: "You have not added businesses yet.",
    emptyPeople: "No matching people. Try another name.", emptyBusinesses: "No matching businesses right now.",
    loading: "Loading your network...", error: "Could not load your network. Please try again.", retry: "Retry",
    types: { company: "Company", supplier: "Supplier", manufacturer: "Manufacturer", trader: "Trader", brand: "Brand" },
    searchHint: "Enter a person or business name, then search.", privacy: "Friendship does not grant access to another member’s private data or business account. Following a business is not a partnership.",
    removeConfirm: "Remove this friend?"
  }
};

async function fetchNetwork(search = ""): Promise<NetworkData> {
  const response = await fetch(`/api/network?search=${encodeURIComponent(search)}`, { credentials: "include", cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || "Network request failed");
  return data.network as NetworkData;
}

export default function NetworkPage() {
  const { locale } = useLocale();
  const t = words[locale];
  const ar = locale === "ar";
  const [data, setData] = useState<NetworkData>(empty);
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (term = activeSearch) => {
    setLoading(true); setError("");
    try { setData(await fetchNetwork(term)); }
    catch { setError(t.error); }
    finally { setLoading(false); }
  }, [activeSearch, t.error]);

  useEffect(() => { void load(""); }, []);

  async function act(action: string, values: { userId?: string; accountId?: string }, key: string) {
    setBusy(key); setError(""); setNotice("");
    try {
      const response = await fetch("/api/network", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...values })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Action failed");
      await load(activeSearch);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally { setBusy(""); }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = search.trim();
    setActiveSearch(term);
    void load(term);
  }

  const personCard = (person: Person, mode: "friend" | "incoming" | "outgoing" | "discover") => (
    <article className="network-person-card" key={person.user_id}>
      <div className="network-person-avatar">
        {person.avatar_reference ? <img src={person.avatar_reference} alt="" referrerPolicy="no-referrer" /> : <span>{person.display_name?.trim().charAt(0) || "W"}</span>}
      </div>
      <div className="network-person-copy"><strong>{person.display_name}</strong><small>{ar ? "عضو في وصلة" : "WASLA member"}</small></div>
      <div className="network-card-actions">
        {mode === "friend" && <button className="network-button subtle" disabled={busy === person.user_id} onClick={() => { if (window.confirm(t.removeConfirm)) void act("remove_friend", { userId: person.user_id }, person.user_id); }}>{t.remove}</button>}
        {mode === "incoming" && <><button className="network-button primary" disabled={busy === person.user_id} onClick={() => void act("accept_request", { userId: person.user_id }, person.user_id)}>{t.accept}</button><button className="network-button subtle" disabled={busy === person.user_id} onClick={() => void act("decline_request", { userId: person.user_id }, person.user_id)}>{t.decline}</button></>}
        {mode === "outgoing" && <span className="network-state">{t.sent}</span>}
        {mode === "discover" && (
          person.relationship === "friend" ? <span className="network-state">{t.friend}</span> :
          person.relationship === "outgoing" ? <span className="network-state">{t.sent}</span> :
          person.relationship === "incoming" ? <button className="network-button primary" disabled={busy === person.user_id} onClick={() => void act("friend_request", { userId: person.user_id }, person.user_id)}>{t.accept}</button> :
          <button className="network-button primary" disabled={busy === person.user_id} onClick={() => void act("friend_request", { userId: person.user_id }, person.user_id)}>{t.add}</button>
        )}
      </div>
    </article>
  );

  const businessCard = (business: Business, followed = false) => (
    <article className="network-business-card" key={business.account_id}>
      <div className="network-business-mark"><span>{business.display_name?.trim().charAt(0) || "B"}</span></div>
      <div className="network-business-copy"><strong>{business.display_name}</strong><small>{t.types[business.account_type as keyof typeof t.types] || business.account_type}{business.country_code ? ` · ${business.country_code}` : ""}</small></div>
      <button className={followed ? "network-button subtle" : "network-button primary"} disabled={busy === business.account_id} onClick={() => void act(followed ? "unfollow_account" : "follow_account", { accountId: business.account_id }, business.account_id)}>{followed ? t.unfollow : t.follow}</button>
    </article>
  );

  return (
    <main className="network-page" lang={locale} dir={ar ? "rtl" : "ltr"}>
      <WorkspaceHeader section="network" />
      <div className="network-shell">
        <header className="network-hero">
          <div><span className="network-eyebrow">{t.eyebrow}</span><h1>{t.title}</h1><p>{t.subtitle}</p></div>
          <div className="network-hero-symbol"><span>W</span><i>✦</i></div>
        </header>

        <section className="network-search-panel">
          <div><span className="network-eyebrow">{t.discover}</span><h2>{t.search}</h2><p>{t.searchHint}</p></div>
          <form onSubmit={submitSearch}><input value={search} onChange={event => setSearch(event.target.value)} placeholder={t.search} maxLength={80} /><button type="submit" disabled={loading}>{t.searchButton}<span>↗</span></button></form>
        </section>

        {error && <div className="network-alert" role="alert">{error}<button onClick={() => void load(activeSearch)}>{t.retry}</button></div>}
        {notice && <div className="network-notice" role="status">{notice}</div>}

        {loading ? <div className="network-loading">{t.loading}</div> : (
          <>
            <div className="network-stats">
              <div><strong>{data.friends.length}</strong><span>{t.friends}</span></div>
              <div><strong>{data.incomingRequests.length}</strong><span>{t.incoming}</span></div>
              <div><strong>{data.followingAccounts.length}</strong><span>{t.following}</span></div>
            </div>

            <div className="network-columns">
              <section className="network-section">
                <header><div><span>01 / CONNECTIONS</span><h2>{t.friends}</h2></div><b>{data.friends.length}</b></header>
                {data.friends.length ? data.friends.map(person => personCard(person, "friend")) : <p className="network-empty">{t.emptyFriends}</p>}
              </section>
              <section className="network-section">
                <header><div><span>02 / REQUESTS</span><h2>{t.incoming}</h2></div><b>{data.incomingRequests.length}</b></header>
                {data.incomingRequests.length ? data.incomingRequests.map(person => personCard(person, "incoming")) : <p className="network-empty">{t.emptyIncoming}</p>}
                {data.outgoingRequests.length > 0 && <div className="network-subsection"><h3>{t.outgoing}</h3>{data.outgoingRequests.map(person => personCard(person, "outgoing"))}</div>}
              </section>
            </div>

            <section className="network-section network-discovery">
              <header><div><span>03 / PEOPLE</span><h2>{t.people}</h2></div><b>{data.people.length}</b></header>
              {data.people.length ? <div className="network-card-grid">{data.people.map(person => personCard(person, "discover"))}</div> : <p className="network-empty">{t.emptyPeople}</p>}
            </section>

            <div className="network-columns">
              <section className="network-section">
                <header><div><span>04 / BUSINESS DIRECTORY</span><h2>{t.businesses}</h2></div><b>{data.businesses.length}</b></header>
                {data.businesses.length ? data.businesses.map(business => businessCard(business, Boolean(business.is_following))) : <p className="network-empty">{t.emptyBusinesses}</p>}
              </section>
              <section className="network-section">
                <header><div><span>05 / YOUR BUSINESS CIRCLE</span><h2>{t.following}</h2></div><b>{data.followingAccounts.length}</b></header>
                {data.followingAccounts.length ? data.followingAccounts.map(business => businessCard(business, true)) : <p className="network-empty">{t.emptyFollowing}</p>}
              </section>
            </div>
          </>
        )}
        <footer className="network-privacy"><span>◈</span>{t.privacy}</footer>
      </div>
    </main>
  );
}
