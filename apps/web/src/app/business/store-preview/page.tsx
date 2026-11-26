"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "../../../components/locale-provider";
import WorkspaceHeader from "../../../components/workspace-header";

type Store = {
  id: string;
  name: string;
  slug: string;
  status: string;
  verification_status?: string | null;
  account_name?: string;
  account_status?: string;
};

export default function PrivateStorePreviewIndex() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/stores", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || data.success !== true || !Array.isArray(data.stores)) {
          throw new Error(data.error || "Could not load stores");
        }
        setStores(data.stores);
      })
      .catch(error => {
        if (error instanceof Error && error.name !== "AbortError") {
          setError(ar ? "تعذر تحميل متاجرك. تأكد من تسجيل الدخول وصلاحيات الحساب." : "Could not load your stores. Check your sign-in and account permissions.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ar]);

  return (
    <main className="business-page" dir={ar ? "rtl" : "ltr"} lang={locale}>
      <WorkspaceHeader section="business" />
      <section className="business-container">
        <div className="business-heading">
          <div>
            <span className="business-eyebrow">WASLA PRIVATE WORKSPACE</span>
            <h1>{ar ? "معاينة متاجري الخاصة" : "My private store previews"}</h1>
            <p>{ar ? "هذه المعاينة لا تنشر المتجر للعامة، وتظهر فقط بعد التحقق من صلاحيات حسابك." : "These previews do not publish stores publicly and are shown only after your account permissions are checked."}</p>
          </div>
          <Link href="/business" className="business-refresh">{ar ? "العودة للأعمال" : "Back to business"}</Link>
        </div>
        <div className="business-alert" role="note" style={{ marginBottom: 20 }}>
          {ar ? "وضع معاينة خاص — لا يمكن للزوار الوصول إلى هذه الصفحة. حالة التوثيق والنشر العام لا تتغير هنا." : "Private preview mode — visitors cannot access this page. Verification and public publishing status are not changed here."}
        </div>
        {loading ? <div className="business-loading">{ar ? "جارٍ تحميل المتاجر..." : "Loading stores..."}</div> : error ? (
          <div className="business-alert business-alert-error" role="alert">{error}</div>
        ) : stores.length === 0 ? (
          <div className="business-empty"><h2>{ar ? "لا توجد متاجر متاحة للمعاينة" : "No stores available to preview"}</h2></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {stores.map(store => (
              <Link key={store.id} href={`/business/store-preview/${encodeURIComponent(store.slug)}`} className="business-account-card">
                <div className="business-account-symbol">W</div>
                <div className="business-account-info">
                  <span>{ar ? "حالة المتجر" : "Store status"}: {store.status} · {ar ? "التوثيق" : "Verification"}: {store.verification_status || "unverified"}</span>
                  <h3>{store.name}</h3>
                  <p>{store.account_name || ""}</p>
                </div>
                <div className="business-account-role">{ar ? "فتح المعاينة ↗" : "Open preview ↗"}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
