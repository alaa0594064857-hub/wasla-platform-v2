"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type Locale = "ar" | "en";

const worlds = [
  {
    number: "01",
    name: "WASLA Store",
    ar: "عالم التسوق",
    en: "The shopping universe",
    descriptionAr: "اكتشف منتجات وعلامات تجارية من أسواق متعددة حول العالم.",
    descriptionEn: "Discover products and brands across markets around the world.",
    category: "COMMERCE",
    href: null,
    statusAr: "قريبًا",
    statusEn: "Coming soon",
    theme: "store",
    symbol: "S",
  },
  {
    number: "02",
    name: "WASLA Shops",
    ar: "عالم المتاجر",
    en: "The brand universe",
    descriptionAr: "أنشئ متجرك، اعرض منتجاتك، وامتلك تجربة بيع تحمل هويتك.",
    descriptionEn: "Build your storefront, showcase products and own your brand experience.",
    category: "SELLER STUDIO",
    href: "/shops",
    statusAr: "متاح",
    statusEn: "Available",
    theme: "shops",
    symbol: "✳",
  },
  {
    number: "03",
    name: "WASLA Business",
    ar: "عالم الشركات",
    en: "The enterprise universe",
    descriptionAr: "ملفات الشركات والموردين والمصانع وشبكات الأعمال.",
    descriptionEn: "Company profiles, suppliers, manufacturers and business networks.",
    category: "ENTERPRISE",
    href: "/business",
    statusAr: "متاح",
    statusEn: "Available",
    theme: "business",
    symbol: "B",
  },
  {
    number: "04",
    name: "WASLA Trade",
    ar: "عالم الصفقات",
    en: "The trade universe",
    descriptionAr: "مساحة متخصصة للعروض والتفاوض وإدارة الصفقات التجارية.",
    descriptionEn: "A dedicated space for offers, negotiation and commercial deals.",
    category: "GLOBAL TRADE",
    href: null,
    statusAr: "قريبًا",
    statusEn: "Coming soon",
    theme: "trade",
    symbol: "↗",
  },
  {
    number: "05",
    name: "WASLA Messages",
    ar: "عالم التواصل",
    en: "The communication universe",
    descriptionAr: "محادثات الأعمال والملفات والتواصل بين أطراف التجارة.",
    descriptionEn: "Business conversations, files and communication between trading partners.",
    category: "CONNECT",
    href: null,
    statusAr: "قريبًا",
    statusEn: "Coming soon",
    theme: "messages",
    symbol: "•••",
  },
  {
    number: "06",
    name: "WASLA AI",
    ar: "عالم الذكاء",
    en: "The intelligence universe",
    descriptionAr: "مساعد ذكي لدعم القرارات وتبسيط العمليات التجارية.",
    descriptionEn: "Intelligent assistance for better decisions and simpler operations.",
    category: "INTELLIGENCE",
    href: null,
    statusAr: "قريبًا",
    statusEn: "Coming soon",
    theme: "ai",
    symbol: "✧",
  },
];

const copy = {
  ar: {
    language: "English",
    eyebrow: "منظومة عالمية متعددة العوالم",
    headline: "كل عالم له",
    highlight: "قواعده الخاصة.",
    intro: "بوابة واحدة تربط التجارة والتسوق والشركات والصفقات. اختر مساحة عملك، وانتقل إلى تجربة صُممت لمهمتك.",
    identity: "هوية واحدة",
    access: "دخول موحد",
    connected: "أنظمة مترابطة",
    worldsLabel: "استكشف عوالم WASLA",
    worldsTitle: "ست تجارب. منظومة واحدة.",
    worldsIntro: "كل عالم بهويته البصرية وأدواته ومساراته الخاصة، مع بقاء حسابك وبياناتك مترابطة.",
    available: "متاح الآن",
    soon: "قيد التطوير",
    enter: "ادخل العالم",
    account: "حسابي",
    signIn: "تسجيل الدخول",
    join: "انضم إلى WASLA",
    footer: "منظومة عالمية للتجارة والأعمال.",
    note: "يتم إطلاق العوالم تدريجيًا بعد اكتمال وظائفها واختبارها.",
  },
  en: {
    language: "العربية",
    eyebrow: "A global multi-world ecosystem",
    headline: "Every world has",
    highlight: "its own rules.",
    intro: "One gateway connecting commerce, shopping, companies and trade. Choose your workspace and enter an experience built for your mission.",
    identity: "One identity",
    access: "Unified access",
    connected: "Connected systems",
    worldsLabel: "EXPLORE WASLA WORLDS",
    worldsTitle: "Six experiences. One ecosystem.",
    worldsIntro: "Every world has its own visual identity, tools and journeys, while your account and data stay connected.",
    available: "Available now",
    soon: "In development",
    enter: "Enter world",
    account: "My account",
    signIn: "Sign in",
    join: "Join WASLA",
    footer: "A global ecosystem for commerce and business.",
    note: "Worlds are released progressively after their core features are complete and tested.",
  },
};

export default function HomePage() {
  const [locale, setLocale] = useState<Locale>("ar");
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const t = copy[locale];
  const direction = locale === "ar" ? "rtl" : "ltr";
  const accountName = session?.user?.name || (locale === "ar" ? "عضو وصلة" : "WASLA member");
  const accountEmail = session?.user?.email || "";
  const accountImage = session?.user?.image || "";
  const accountInitial = accountName.trim().charAt(0).toUpperCase() || "W";

  return (
    <main className="worlds-page" lang={locale} dir={direction}>
      <header className="worlds-header">
        <a className="worlds-brand" href="/" aria-label="WASLA home">
          <span className="worlds-brand-symbol">W</span>
          <span className="worlds-brand-word">{locale === "ar" ? "وصلة" : "WASLA"}<small>{locale === "ar" ? "منظومة عالمية" : "GLOBAL ECOSYSTEM"}</small></span>
        </a>
        <div className="worlds-header-actions">
          <button className="worlds-language" type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{t.language}</button>
          <a className="worlds-account" href={signedIn ? "/profile" : "/login"}>{isPending ? t.signIn : signedIn ? t.account : t.signIn}</a>
        </div>
      </header>

      <section className="worlds-hero">
        <div className="worlds-hero-copy">
          <div className="worlds-eyebrow"><span />{t.eyebrow}</div>
          <h1>{t.headline}<br /><em>{t.highlight}</em></h1>
          <p>{t.intro}</p>
          <div className="worlds-proof">
            <div><strong>01</strong><span>{t.identity}</span></div>
            <div><strong>02</strong><span>{t.access}</span></div>
            <div><strong>03</strong><span>{t.connected}</span></div>
          </div>
        </div>
        <div className="worlds-orbit" aria-hidden="true">
          <div className="worlds-orbit-ring ring-a" />
          <div className="worlds-orbit-ring ring-b" />
          <div className="worlds-orbit-ring ring-c" />
          <div className="worlds-orbit-core"><b>W</b><span>{locale === "ar" ? "وصلة" : "WASLA"}</span></div>
          <i className="orbit-point point-a" /><i className="orbit-point point-b" /><i className="orbit-point point-c" /><i className="orbit-point point-d" />
          <span className="orbit-caption caption-a">COMMERCE</span>
          <span className="orbit-caption caption-b">BUSINESS</span>
          <span className="orbit-caption caption-c">GLOBAL</span>
        </div>
      </section>

      <section className="worlds-home-panel" aria-label={locale === "ar" ? "مساحة حسابك" : "Your account space"}>
        <div className="worlds-profile-card">
          <div className="worlds-profile-avatar">
            {accountImage ? <img src={accountImage} alt="" /> : <span>{accountInitial}</span>}
          </div>
          <div className="worlds-profile-details">
            <span className="worlds-panel-kicker">{locale === "ar" ? "ملفك الشخصي" : "YOUR PROFILE"}</span>
            <strong>{signedIn ? accountName : (locale === "ar" ? "مرحباً بك في وصلة" : "Welcome to WASLA")}</strong>
            <small>{signedIn ? accountEmail : (locale === "ar" ? "سجّل الدخول لعرض بيانات حسابك" : "Sign in to view your account details")}</small>
            <a href={signedIn ? "/profile" : "/login"}>{locale === "ar" ? "عرض بيانات الحساب" : "View account details"} <span>↗</span></a>
          </div>
        </div>
        <div className="worlds-quick-card">
          <span className="worlds-quick-icon">✉</span>
          <div><strong>{locale === "ar" ? "الرسائل" : "Messages"}</strong><small>{locale === "ar" ? "مساحة محادثاتك مع المتاجر والشركات" : "Your conversations with shops and businesses"}</small></div>
          <b>{locale === "ar" ? "قريباً" : "Coming soon"}</b>
        </div>
        <div className="worlds-quick-card">
          <span className="worlds-quick-icon">♧</span>
          <div><strong>{locale === "ar" ? "الإشعارات" : "Notifications"}</strong><small>{locale === "ar" ? "تنبيهات الطلبات والأنشطة والتحديثات" : "Orders, activity and platform updates"}</small></div>
          <b>{locale === "ar" ? "قريباً" : "Coming soon"}</b>
        </div>
      </section>

      <section className="worlds-directory" id="worlds">
        <div className="worlds-section-heading">
          <div><span>{t.worldsLabel}</span><h2>{t.worldsTitle}</h2></div>
          <p>{t.worldsIntro}</p>
        </div>
        <div className="worlds-grid">
          {worlds.map((world) => {
            const title = locale === "ar" ? world.ar : world.en;
            const description = locale === "ar" ? world.descriptionAr : world.descriptionEn;
            const status = world.href ? t.available : t.soon;
            return (
              <article className={`world-card world-${world.theme} ${world.href ? "is-live" : "is-soon"}`} key={world.number}>
                <div className="world-card-art" aria-hidden="true">
                  <span className="world-card-number">{world.number}</span>
                  <span className="world-card-symbol">{world.symbol}</span>
                  <span className="world-art-orbit orbit-one" />
                  <span className="world-art-orbit orbit-two" />
                  <span className="world-art-orbit orbit-three" />
                </div>
                <div className="world-card-content">
                  <div className="world-card-meta"><span>{world.category}</span><b>{status}</b></div>
                  <h3>{world.name}</h3>
                  <h4>{title}</h4>
                  <p>{description}</p>
                  {world.href ? (
                    <a className="world-enter" href={world.href}>{t.enter}<span>↗</span></a>
                  ) : (
                    <span className="world-enter world-enter-disabled" aria-disabled="true">{status}<span>◌</span></span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <p className="worlds-release-note">{t.note}</p>
      </section>

      <footer className="worlds-footer">
        <a className="worlds-footer-brand" href="/">{locale === "ar" ? "وصلة" : "WASLA"}<span>®</span></a>
        <p>{t.footer}</p>
        <a href="/register">{t.join} ↗</a>
      </footer>
    </main>
  );
}
