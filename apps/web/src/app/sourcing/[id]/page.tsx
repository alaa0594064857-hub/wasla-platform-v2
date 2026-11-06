"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLocale } from "../../../components/locale-provider";
import WorkspaceHeader from "../../../components/workspace-header";

type Offer = {
  id: string; supplier_account_id: string; supplier_name: string; origin_country_code: string;
  offered_quantity: number; unit_price: string; currency: string; shipping_amount: string;
  lead_time_days: number | null; availability_confirmed_at: string | null;
  availability_valid_until: string | null; quote_valid_until: string | null; status: string;
};
type Request = {
  id: string; item_name: string; description: string | null; specifications: Record<string, unknown>;
  quantity: number; unit: string; destination_country_code: string; destination_city: string;
  requested_currency: string | null; status: string;
};

const words = {
  ar: { back:"العودة لطلباتي", title:"تفاصيل طلب التوريد", loading:"جارٍ تحميل الطلب...", error:"تعذر تحميل الطلب.", offers:"عروض الموردين", noOffers:"لم تصل عروض بعد. سيتم عرضها هنا عندما يؤكد الموردون توفر منتجاتهم.", item:"المنتج", quantity:"الكمية المطلوبة", destination:"مكان التسليم", status:"الحالة", supplier:"المورد", origin:"بلد المورد", price:"سعر الوحدة", shipping:"الشحن", lead:"مدة التجهيز (يوم)", total:"الإجمالي التقديري", accept:"اختيار هذا العرض", accepting:"جارٍ اعتماد العرض...", accepted:"تم اختيار العرض. الطلب بانتظار بدء الدفع.", payment:"الدفع لم يبدأ بعد؛ لن يتم تحصيل أي مبلغ الآن.", pending:"بانتظار تأكيد التوفر", available:"متوفر ومؤكد", unavailable:"غير متوفر", local:"مورد من بلد التسليم", cross:"عرض من دولة أخرى", quoteExpiry:"صلاحية السعر", availabilityExpiry:"صلاحية تأكيد التوفر" },
  en: { back:"Back to my requests", title:"Sourcing request details", loading:"Loading request...", error:"Could not load this request.", offers:"Supplier offers", noOffers:"No offers yet. Confirmed supplier offers will appear here.", item:"Product", quantity:"Requested quantity", destination:"Delivery destination", status:"Status", supplier:"Supplier", origin:"Supplier country", price:"Unit price", shipping:"Shipping", lead:"Lead time (days)", total:"Estimated total", accept:"Choose this offer", accepting:"Accepting offer...", accepted:"Offer selected. The order is awaiting payment initiation.", payment:"Payment has not started; no charge has been made.", pending:"Availability pending", available:"Available and confirmed", unavailable:"Unavailable", local:"Supplier in destination country", cross:"Cross-border offer", quoteExpiry:"Quote valid until", availabilityExpiry:"Availability valid until" },
};

export default function SourcingRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { locale } = useLocale();
  const t = words[locale];
  const [request, setRequest] = useState<Request | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dir = locale === "ar" ? "rtl" : "ltr";

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/sourcing-requests/${encodeURIComponent(id)}`, { credentials:"include", cache:"no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      setRequest(data.request as Request);
      setOffers(data.offers as Offer[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
    finally { setLoading(false); }
  }, [id, t.error]);

  useEffect(() => { void load(); }, [load]);

  async function accept(offer: Offer) {
    setAccepting(offer.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/sourcing-requests/${encodeURIComponent(id)}/accept-offer`, {
        method:"POST", credentials:"include", headers:{ "Content-Type":"application/json", "Idempotency-Key":crypto.randomUUID() },
        body:JSON.stringify({ offerId:offer.id, idempotencyKey:crypto.randomUUID() }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      setMessage(t.accepted + " " + t.payment);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
    finally { setAccepting(null); }
  }

  const date = (value: string | null) => value ? new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value)) : "—";

  return <main className="shops-page" lang={locale} dir={dir}>
    <WorkspaceHeader section="business" />
    <section className="shops-main">
      <Link href="/sourcing" className="shops-order-details-toggle">← {t.back}</Link>
      <div className="shops-heading"><div><span className="shops-eyebrow">WASLA / SOURCING</span><h1>{t.title}</h1></div><div className="shops-heading-icon">W</div></div>
      {error && <div className="shops-alert" role="alert">{error}</div>}
      {message && <div className="shops-alert" role="status">{message}</div>}
      {loading ? <div className="shops-empty">{t.loading}</div> : request ? <>
        <article className="shops-create-card">
          <div className="shops-card-top"><span className="shops-eyebrow">{request.id.slice(0,8).toUpperCase()}</span><span className="shops-status">{request.status}</span></div>
          <h2>{request.item_name}</h2>
          <div className="shops-info-row"><small>{t.quantity}</small><strong>{request.quantity} {request.unit}</strong></div>
          <div className="shops-info-row"><small>{t.destination}</small><strong>{request.destination_city}, {request.destination_country_code}</strong></div>
          {request.description && <p>{request.description}</p>}
        </article>
        <div className="shops-heading" style={{marginTop:28}}><div><h2>{t.offers}</h2></div></div>
        {offers.length === 0 ? <div className="shops-empty">{t.noOffers}</div> : <div className="shops-grid">
          {offers.map(offer => {
            const local = offer.origin_country_code === request.destination_country_code;
            const canAccept = offer.status === "available" && !!offer.availability_confirmed_at && request.status !== "buyer_selected";
            const estimated = (Number(offer.unit_price) * request.quantity + Number(offer.shipping_amount)).toFixed(2);
            return <article className="shops-create-card" key={offer.id}>
              <div className="shops-card-top"><span className="shops-eyebrow">{local ? t.local : t.cross}</span><span className="shops-status">{offer.status === "available" ? t.available : offer.status === "unavailable" ? t.unavailable : t.pending}</span></div>
              <h3>{offer.supplier_name}</h3>
              <div className="shops-info-row"><small>{t.origin}</small><strong>{offer.origin_country_code}</strong></div>
              <div className="shops-info-row"><small>{t.price}</small><strong>{offer.unit_price} {offer.currency}</strong></div>
              <div className="shops-info-row"><small>{t.shipping}</small><strong>{offer.shipping_amount} {offer.currency}</strong></div>
              <div className="shops-info-row"><small>{t.total}</small><strong>{estimated} {offer.currency}</strong></div>
              <div className="shops-info-row"><small>{t.lead}</small><strong>{offer.lead_time_days ?? "—"}</strong></div>
              <div className="shops-info-row"><small>{t.availabilityExpiry}</small><strong>{date(offer.availability_valid_until)}</strong></div>
              <div className="shops-info-row"><small>{t.quoteExpiry}</small><strong>{date(offer.quote_valid_until)}</strong></div>
              {canAccept && <button className="shops-primary-button" type="button" disabled={accepting !== null} onClick={() => void accept(offer)}>{accepting === offer.id ? t.accepting : t.accept}</button>}
            </article>;
          })}
        </div>}
      </> : null}
    </section>
  </main>;
}
