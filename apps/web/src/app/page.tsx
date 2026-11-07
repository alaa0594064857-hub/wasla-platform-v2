"use client";

import { useLocale } from "../components/locale-provider";
import WorkspaceHeader from "../components/workspace-header";

const worlds = [
  {
    number: "01",
    name: "WASLA Store",
    ar: "عالم التسوق",
    en: "The shopping universe",
    descriptionAr: "اكتشف منتجات وعلامات تجارية من أسواق متعددة حول العالم.",
    descriptionEn: "Discover products and brands across markets around the world.",
    category: "COMMERCE", categoryAr: "التجارة والتسوق", nameAr: "وصلة للتسوق",
    href: "/official-store",
    statusAr: "قيد التجهيز",
    statusEn: "Preparing",
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
    category: "SELLER STUDIO", categoryAr: "مساحة المتاجر", nameAr: "وصلة للمتاجر",
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
    category: "ENTERPRISE", categoryAr: "عالم الشركات", nameAr: "وصلة للأعمال",
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
    category: "GLOBAL TRADE", categoryAr: "التجارة العالمية", nameAr: "وصلة للتجارة",
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
    category: "CONNECT", categoryAr: "التواصل", nameAr: "وصلة للرسائل",
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
    category: "INTELLIGENCE", categoryAr: "الذكاء", nameAr: "وصلة للذكاء",
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
    headline: "ست تجارب.",
    highlight: "منظومة واحدة.",
    intro: "وصلة منظومة عالمية تجمع التسوق والمتاجر والشركات والتجارة والتواصل والذكاء في مكان واحد؛ لكل تجربة عالمها وأدواتها، وحساب واحد يربطها جميعًا.",
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
    headline: "Six experiences.",
    highlight: "One ecosystem.",
    intro: "WASLA brings shopping, storefronts, businesses, trade, communication and intelligence together. Each experience has its own tools, connected through one account.",
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
  const { locale } = useLocale();
  const t = copy[locale];
  const direction = locale === "ar" ? "rtl" : "ltr";

  return (
    <main className="worlds-page" lang={locale} dir={direction}>
      <WorkspaceHeader section="account" />
      <header className="worlds-header" style={{ display: "none" }}>
        <a className="worlds-brand" href="/" aria-label="WASLA home">
          <span className="worlds-brand-symbol">W</span>
          <span className="worlds-brand-word">{locale === "ar" ? "وصلة" : "WASLA"}<small>{locale === "ar" ? "منظومة عالمية" : "GLOBAL ECOSYSTEM"}</small></span>
        </a>
        <div className="worlds-header-actions">
          
          
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
          <span className="orbit-caption caption-a">{locale === "ar" ? "التجارة" : "COMMERCE"}</span>
          <span className="orbit-caption caption-b">{locale === "ar" ? "الأعمال" : "BUSINESS"}</span>
          <span className="orbit-caption caption-c">{locale === "ar" ? "عالمي" : "GLOBAL"}</span>
        </div>
      </section>

      <section className="wasla-hero-join" id="create-account">
        <div className="wasla-hero-about">
          <span>{locale === "ar" ? "منصة واحدة لفرص بلا حدود" : "ONE PLATFORM. MORE POSSIBILITIES."}</span>
          <h2>{locale === "ar" ? "ما هي وصلة؟" : "What is WASLA?"}</h2>
          <p>{locale === "ar" ? "وصلة منظومة رقمية عالمية تربط الأفراد والمتاجر والشركات والموردين. تجمع التسوق وبناء العلامات التجارية والأعمال والصفقات والتواصل والأدوات الذكية ضمن تجربة مترابطة، مع مساحة مستقلة لكل احتياج." : "WASLA is a global digital ecosystem connecting people, shops, companies and suppliers. It brings shopping, brand building, business, trade, communication and intelligent tools into one connected experience, with a dedicated space for every need."}</p>
          <div className="wasla-about-points">
            <span>01 · {locale === "ar" ? "ست تجارب متخصصة" : "Six dedicated experiences"}</span>
            <span>02 · {locale === "ar" ? "حساب وهوية موحدة" : "One account and identity"}</span>
            <span>03 · {locale === "ar" ? "من الأفراد إلى المؤسسات" : "From individuals to enterprises"}</span>
          </div>
        </div>
        <div className="wasla-hero-signup">
          <div className="wasla-signup-mark">W</div>
          <span>{locale === "ar" ? "ابدأ رحلتك مع وصلة" : "YOUR JOURNEY STARTS HERE"}</span>
          <h2>{locale === "ar" ? "أنشئ حسابك الآن" : "Create your account"}</h2>
          <p>{locale === "ar" ? "حساب واحد يفتح لك أبواب العوالم الستة. انضم مجانًا وابدأ باختيار المساحة المناسبة لك." : "One account opens the door to all six experiences. Join for free and choose the space that fits you."}</p>
          <a className="wasla-signup-primary" href="/register">{locale === "ar" ? "إنشاء حساب جديد" : "Create a new account"} <b>↗</b></a>
          <a className="wasla-signup-login" href="/login">{locale === "ar" ? "لديك حساب بالفعل؟ تسجيل الدخول" : "Already have an account? Sign in"}</a>
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
            const status = locale === "ar" ? world.statusAr : world.statusEn;
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
                  <div className="world-card-meta"><span>{locale === "ar" ? world.categoryAr : world.category}</span><b>{status}</b></div>
                  <h3>{locale === "ar" ? world.nameAr : world.name}</h3>
                  <h4>{title}</h4>
                  <p>{description}</p>
                  {world.href ? (
                    <a className="world-enter" href={world.href}>{world.theme === "store" ? (locale === "ar" ? "استكشف المتجر الرسمي" : "Explore official store") : t.enter}<span>↗</span></a>
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

      <section className="wasla-entry-paths" id="join">
        <div className="wasla-entry-heading">
          <span>{locale === "ar" ? "ابدأ من هنا" : "START HERE"}</span>
          <h2>{locale === "ar" ? "وصلة تبدأ من احتياجك" : "WASLA starts with your ambition"}</h2>
          <p>{locale === "ar" ? "اختر صفتك، وسنرشدك إلى المساحة المناسبة لك. حساب واحد يفتح لك أبواب المنظومة." : "Choose your role and find the right space. One identity opens the entire ecosystem."}</p>
        </div>
        <div className="wasla-entry-grid">
          <article className="wasla-entry-card buyer">
            <div className="wasla-entry-art"><span>01</span><b>◈</b><i>✦</i></div>
            <div><small>{locale === "ar" ? "للمتسوقين والأفراد" : "FOR PEOPLE & SHOPPERS"}</small><h3>{locale === "ar" ? "أنا مشتري" : "I’m a buyer"}</h3><p>{locale === "ar" ? "اكتشف المنتجات والمتاجر، تابع علاماتك المفضلة، وابنِ شبكة علاقاتك." : "Discover products and shops, follow your favorite brands and grow your network."}</p><a href="/register">{locale === "ar" ? "أنشئ حسابك المجاني" : "Create a free account"} ↗</a></div>
          </article>
          <article className="wasla-entry-card seller">
            <div className="wasla-entry-art"><span>02</span><b>✳</b><i>◌</i></div>
            <div><small>{locale === "ar" ? "لأصحاب المتاجر والعلامات" : "FOR SELLERS & BRANDS"}</small><h3>{locale === "ar" ? "أريد إنشاء متجر" : "I want to open a shop"}</h3><p>{locale === "ar" ? "أنشئ حضور علامتك، اعرض منتجاتك، وابدأ الوصول إلى عملاء جدد." : "Build your brand presence, showcase products and reach new customers."}</p><a href="/register">{locale === "ar" ? "ابدأ كصاحب متجر" : "Join as a seller"} ↗</a></div>
          </article>
          <article className="wasla-entry-card company">
            <div className="wasla-entry-art"><span>03</span><b>▦</b><i>✧</i></div>
            <div><small>{locale === "ar" ? "للشركات والموردين والمصانع" : "FOR COMPANIES & SUPPLIERS"}</small><h3>{locale === "ar" ? "أمثل شركة أو موردًا" : "I represent a business"}</h3><p>{locale === "ar" ? "اعرض نشاطك، وسّع شبكة شركائك، واكتشف فرصًا تجارية جديدة." : "Showcase your business, expand partner relationships and discover opportunities."}</p><a href="/register">{locale === "ar" ? "انضم كحساب أعمال" : "Join as a business"} ↗</a></div>
          </article>
        </div>
      </section>

      <section className="wasla-memberships" id="memberships">
        <div className="wasla-entry-heading">
          <span>{locale === "ar" ? "عضوية تناسب طموحك" : "MEMBERSHIPS THAT GROW WITH YOU"}</span>
          <h2>{locale === "ar" ? "ابدأ مجانًا. وتوسّع عندما تكون جاهزًا." : "Start free. Scale when you’re ready."}</h2>
          <p>{locale === "ar" ? "خطط العضوية قيد التصميم. سنوضح المزايا والحدود قبل إطلاق أي اشتراك مدفوع." : "Membership plans are being designed. Features and limits will be clear before any paid plan launches."}</p>
        </div>
        <div className="wasla-plan-grid">
          <article className="wasla-plan-card"><span className="wasla-plan-mark">01</span><small>FREE</small><h3>{locale === "ar" ? "الأساسية" : "Free"}</h3><p>{locale === "ar" ? "للتعرّف على وصلة والبدء بهوية موحدة." : "Explore WASLA and get started with one identity."}</p><b>{locale === "ar" ? "بداية مجانية" : "Free to start"}</b><a href="/register">{locale === "ar" ? "ابدأ الآن" : "Get started"} ↗</a></article>
          <article className="wasla-plan-card featured"><span className="wasla-plan-mark">02</span><small>PLUS</small><h3>{locale === "ar" ? "بلس" : "Plus"}</h3><p>{locale === "ar" ? "للأفراد والمتاجر الصغيرة التي تريد أدوات أوسع." : "For individuals and growing shops that need more tools."}</p><b>{locale === "ar" ? "قريبًا · المزايا قيد التحديد" : "Coming soon · Features in design"}</b><span className="wasla-plan-disabled">{locale === "ar" ? "سيُعلن لاحقًا" : "Launching later"}</span></article>
          <article className="wasla-plan-card"><span className="wasla-plan-mark">03</span><small>BUSINESS</small><h3>{locale === "ar" ? "الأعمال" : "Business"}</h3><p>{locale === "ar" ? "للشركات والفرق والشبكات التجارية." : "For companies, teams and business networks."}</p><b>{locale === "ar" ? "قريبًا · المزايا قيد التحديد" : "Coming soon · Features in design"}</b><span className="wasla-plan-disabled">{locale === "ar" ? "سيُعلن لاحقًا" : "Launching later"}</span></article>
          <article className="wasla-plan-card"><span className="wasla-plan-mark">04</span><small>ENTERPRISE</small><h3>{locale === "ar" ? "المؤسسات" : "Enterprise"}</h3><p>{locale === "ar" ? "للمؤسسات الكبيرة والاحتياجات المتقدمة." : "For large organizations and advanced needs."}</p><b>{locale === "ar" ? "حسب الاحتياج" : "Tailored needs"}</b><span className="wasla-plan-disabled">{locale === "ar" ? "سيُعلن لاحقًا" : "Launching later"}</span></article>
        </div>
        <p className="wasla-membership-note">{locale === "ar" ? "لن تُفرض ترقية مدفوعة على الحساب الأساسي، وستظهر حدود كل باقة بوضوح قبل الاشتراك." : "The basic account won’t require a paid upgrade. Every plan limit will be clear before subscribing."}</p>
      </section>

      <footer className="worlds-footer">
        <a className="worlds-footer-brand" href="/">{locale === "ar" ? "وصلة" : "WASLA"}<span>®</span></a>
        <p>{t.footer}</p>
        <a href="/register">{t.join} ↗</a>
      </footer>
    </main>
  );
}
