"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const content = {
  ar: {
    direction: "rtl" as const,
    language: "EN",
    nav: [
      "الرئيسية",
      "المتاجر",
      "الأعمال",
      "التجارة",
      "عن وصلة",
      "الدعوات",
      "الملف الشخصي",
    ],
    signIn: "تسجيل الدخول",
    myAccount: "حسابي",
    eyebrow: "منصة واحدة. فرص بلا حدود.",
    title: "العالم التجاري",
    highlight: "أصبح أقرب.",
    description:
      "وصلة تجمع التجار والشركات والمصنّعين والموردين والمشترين في منصة عالمية واحدة، لتبني علاقات تجارية وتنمّي أعمالك بثقة.",
    explore: "اكتشف المنصة",
    join: "ابدأ رحلتك",
    stats: [
      ["01", "هوية موحدة"],
      ["02", "تجارة عالمية"],
      ["03", "أعمال مترابطة"],
    ],
    sectionLabel: "منظومة وصلة",
    sectionTitle: "كل ما تحتاجه تجارتك، في مكان واحد.",
    sectionDescription:
      "من اكتشاف المنتجات إلى بناء الشراكات وإدارة عملياتك التجارية.",
    modules: [
      ["01", "WASLA Store", "اكتشف المنتجات وتسوق من المتاجر."],
      ["02", "WASLA Shops", "أنشئ متجرك وأدر منتجاتك ومبيعاتك."],
      ["03", "WASLA Business", "اعرض شركتك وابنِ شبكة أعمالك."],
      ["04", "WASLA Trade", "اكتشف الفرص والصفقات التجارية."],
      ["05", "WASLA Messages", "تواصل مباشرة مع شركائك وعملائك."],
      ["06", "WASLA AI", "أدوات ذكية تساعدك على تطوير أعمالك."],
    ],
    bannerTitle: "فرصتك التجارية القادمة تبدأ من هنا.",
    bannerText: "انضم إلى منظومة تربط التجارة والأعمال حول العالم.",
    footer: "منصة عالمية للتجارة والأعمال.",
    rights: "جميع الحقوق محفوظة.",
  },
  en: {
    direction: "ltr" as const,
    language: "عربي",
    nav: [
      "Home",
      "Stores",
      "Business",
      "Trade",
      "About",
      "Invitations",
      "Profile",
    ],
    signIn: "Sign in",
    myAccount: "My account",
    eyebrow: "One platform. Limitless possibilities.",
    title: "Global commerce",
    highlight: "closer than ever.",
    description:
      "WASLA brings businesses, manufacturers, suppliers, traders and buyers together in one global platform to build relationships and grow with confidence.",
    explore: "Explore platform",
    join: "Get started",
    stats: [
      ["01", "One identity"],
      ["02", "Global commerce"],
      ["03", "Connected business"],
    ],
    sectionLabel: "THE WASLA ECOSYSTEM",
    sectionTitle: "Everything your business needs. All in one place.",
    sectionDescription:
      "From discovering products to building partnerships and managing commerce.",
    modules: [
      ["01", "WASLA Store", "Discover products and shop across stores."],
      ["02", "WASLA Shops", "Create your store and manage products and sales."],
      ["03", "WASLA Business", "Showcase your company and build your network."],
      ["04", "WASLA Trade", "Discover opportunities and trade deals."],
      ["05", "WASLA Messages", "Connect directly with customers and partners."],
      ["06", "WASLA AI", "Intelligent tools to help grow your business."],
    ],
    bannerTitle: "Your next business opportunity starts here.",
    bannerText: "Join an ecosystem connecting commerce around the world.",
    footer: "A global platform for commerce and business.",
    rights: "All rights reserved.",
  },
};

export default function HomePage() {
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  const { data: session, isPending } = authClient.useSession();
  const isSignedIn = Boolean(session?.user);
  const t = content[locale];

  return (
    <main className="wasla-page" lang={locale} dir={t.direction}>
      <header className="site-header">
        <a className="brand" href="/" aria-label="WASLA home">
          <span className="brand-symbol">W</span>
          <span className="brand-name">
            WASLA
            <small>وصلة</small>
          </span>
        </a>

        <nav className="main-nav" aria-label="Main navigation">
          {t.nav.map((item, index) => (
            <a
              key={item}
              href={
                index === 0
                  ? "/"
                  : index === 5
                    ? "/invitations"
                    : index === 6
                      ? "/profile"
                      : "#modules"
              }
            >
              {item}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <button
            className="language-button"
            onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
            type="button"
          >
            {t.language}
          </button>
          <a className="sign-in-button" href={isSignedIn ? "/profile" : "/login"}>
            {isPending ? t.signIn : isSignedIn ? t.myAccount : t.signIn}
          </a>
        </div>
      </header>

      <section className="hero-section">
        <div className="hero-content">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            {t.eyebrow}
          </div>

          <h1>
            {t.title}
            <br />
            <span>{t.highlight}</span>
          </h1>

          <p className="hero-description">{t.description}</p>

          <div className="hero-actions">
            <a className="primary-button" href="#modules">
              {t.explore}
              <span aria-hidden="true">↗</span>
            </a>
            <a className="secondary-button" href="/register">
              {t.join}
            </a>
          </div>

          <div className="hero-stats">
            {t.stats.map(([number, label]) => (
              <div className="stat-item" key={number}>
                <strong>{number}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="visual-core">
            <span>W</span>
            <small>WASLA</small>
          </div>
          <div className="visual-node node-top">BUSINESS</div>
          <div className="visual-node node-right">TRADE</div>
          <div className="visual-node node-bottom">STORE</div>
          <div className="visual-node node-left">GLOBAL</div>
          <div className="visual-cross">✦</div>
        </div>
      </section>

      <section className="modules-section" id="modules">
        <div className="section-heading">
          <span className="section-label">{t.sectionLabel}</span>
          <h2>{t.sectionTitle}</h2>
          <p>{t.sectionDescription}</p>
        </div>

        <div className="modules-grid">
          {t.modules.map(([number, name, description]) => (
            <article className="module-card" key={number}>
              <div className="module-card-top">
                <span className="module-number">{number}</span>
                <span className="module-arrow">↗</span>
              </div>
              <h3>{name}</h3>
              <p>{description}</p>
              <div className="module-line" />
            </article>
          ))}
        </div>
      </section>

      <section className="start-section" id="get-started">
        <div>
          <span className="section-label">WASLA</span>
          <h2>{t.bannerTitle}</h2>
          <p>{t.bannerText}</p>
        </div>
        <a className="primary-button" href="/register">
          {t.join}
          <span aria-hidden="true">↗</span>
        </a>
      </section>

      <footer className="site-footer">
        <a className="footer-brand" href="/">
          WASLA <span>وصلة</span>
        </a>
        <p>{t.footer}</p>
        <small>© 2026 WASLA. {t.rights}</small>
      </footer>
    </main>
  );
}
