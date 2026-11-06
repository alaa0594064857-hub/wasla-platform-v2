"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import WorkspaceHeader from "../../../components/workspace-header";

type Product = {
  id: string; title: string; description: string | null; sku: string | null;
  price: string; currency: string; stockQuantity: number; imageUrl: string | null; videoUrl: string | null;
};
type Store = { id: string; name: string; slug: string; businessName: string; countryCode: string | null; businessDescription: string | null; website: string | null };
type CartLine = { productId: string; quantity: number };
type Order = { id: string; orderNumber: string; grandTotal: string; currency: string };

const copy = {
  ar: {
    eyebrow: "WASLA STOREFRONT", loading: "جارٍ تحميل المتجر...", unavailable: "تعذر العثور على المتجر أو تحميل منتجاته.",
    retry: "إعادة المحاولة", products: "منتجات المتجر", empty: "لا توجد منتجات منشورة في هذا المتجر حالياً.",
    add: "أضف إلى السلة", added: "أضيف إلى السلة", out: "نفد المخزون", stock: "المتاح",
    cart: "سلة المشتريات", noCart: "سلتك فارغة. اختر المنتجات التي تريد شراءها.",
    remove: "حذف", quantity: "الكمية", subtotal: "المجموع", address: "عنوان التوصيل",
    fullName: "الاسم الكامل", phone: "رقم الهاتف", line1: "العنوان بالتفصيل", line2: "العنوان الإضافي (اختياري)",
    city: "المدينة", region: "المنطقة / الولاية", postal: "الرمز البريدي", country: "رمز الدولة (مثل US أو TR)",
    note: "ملاحظة للمتجر (اختياري)", place: "تأكيد الطلب", placing: "جارٍ تأكيد الطلب...",
    login: "سجّل الدخول لإتمام الشراء", success: "تم تسجيل طلبك بنجاح", order: "رقم الطلب",
    viewOrders: "عرض طلباتي", continue: "متابعة التسوق", error: "تعذر إتمام الطلب. تحقق من المخزون وتسجيل الدخول ثم حاول مجدداً.",
    mixedCurrency: "لا يمكن جمع منتجات بعملات مختلفة في طلب واحد.", secure: "السعر النهائي والمخزون يتم التحقق منهما عند تأكيد الطلب.",
    business: "من", emptyName: "المتجر", currency: "العملة",
  },
  en: {
    eyebrow: "WASLA STOREFRONT", loading: "Loading shop...", unavailable: "This shop could not be found or its products could not be loaded.",
    retry: "Try again", products: "Shop products", empty: "This shop has no published products yet.",
    add: "Add to cart", added: "Added to cart", out: "Out of stock", stock: "Available",
    cart: "Shopping cart", noCart: "Your cart is empty. Choose products you would like to buy.",
    remove: "Remove", quantity: "Quantity", subtotal: "Subtotal", address: "Delivery address",
    fullName: "Full name", phone: "Phone number", line1: "Street address", line2: "Address line 2 (optional)",
    city: "City", region: "State / region", postal: "Postal code", country: "Country code (e.g. US or TR)",
    note: "Note to the shop (optional)", place: "Place order", placing: "Placing order...",
    login: "Sign in to checkout", success: "Your order was placed successfully", order: "Order number",
    viewOrders: "View my orders", continue: "Continue shopping", error: "Could not place your order. Check stock and sign-in, then try again.",
    mixedCurrency: "A single order cannot contain products in different currencies.", secure: "Final prices and stock are verified when you place the order.",
    business: "By", emptyName: "Shop", currency: "Currency",
  },
};

export default function PublicStorefrontPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { locale } = useLocale();
  const t = copy[locale];
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<Order | null>(null);
  const [lastAdded, setLastAdded] = useState("");
  const [note, setNote] = useState("");
  const [address, setAddress] = useState({ fullName: "", phone: "", addressLine1: "", addressLine2: "", city: "", region: "", postalCode: "", countryCode: "" });
  const dir = locale === "ar" ? "rtl" : "ltr";
  const storageKey = `wasla-cart-v1:${slug}`;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/public/stores/${encodeURIComponent(slug)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.unavailable);
      setStore(data.store as Store);
      setProducts(data.products as Product[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.unavailable);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [slug]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCart(parsed.filter((line): line is CartLine =>
          line && typeof line.productId === "string" && Number.isSafeInteger(line.quantity) && line.quantity > 0
        ));
      }
    } catch { setCart([]); }
  }, [storageKey]);
  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(cart)); } catch { /* Storage may be unavailable. */ }
  }, [cart, storageKey]);

  useEffect(() => {
    if (products.length === 0) return;
    setCart(current => current
      .map(line => {
        const product = products.find(item => item.id === line.productId);
        return product ? { ...line, quantity: Math.min(line.quantity, product.stockQuantity) } : null;
      })
      .filter((line): line is CartLine => Boolean(line && line.quantity > 0)));
  }, [products]);

  const cartProducts = useMemo(() => cart.map(line => ({
    line, product: products.find(product => product.id === line.productId),
  })).filter((entry): entry is { line: CartLine; product: Product } => Boolean(entry.product)), [cart, products]);
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const currencies = new Set(cartProducts.map(entry => entry.product.currency));
  const mixedCurrency = currencies.size > 1;
  const currency = cartProducts[0]?.product.currency ?? "";
  const subtotal = cartProducts.reduce((sum, entry) => sum + Number(entry.product.price) * entry.line.quantity, 0);

  function add(product: Product) {
    if (product.stockQuantity < 1) return;
    setCart(current => {
      const existing = current.find(line => line.productId === product.id);
      if (!existing) return [...current, { productId: product.id, quantity: 1 }];
      return current.map(line => line.productId === product.id
        ? { ...line, quantity: Math.min(product.stockQuantity, line.quantity + 1) } : line);
    });
    setLastAdded(product.id);
    setError("");
  }

  function changeQuantity(product: Product, quantity: number) {
    if (quantity < 1) {
      setCart(current => current.filter(line => line.productId !== product.id));
      return;
    }
    setCart(current => current.map(line => line.productId === product.id
      ? { ...line, quantity: Math.min(product.stockQuantity, quantity) } : line));
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store || cartProducts.length === 0 || mixedCurrency) return;
    setPlacing(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeSlug: store.slug,
          idempotencyKey: `web-checkout-${crypto.randomUUID()}`,
          shippingAddress: { ...address, countryCode: address.countryCode.trim().toUpperCase() },
          buyerNote: note.trim() || null,
          items: cartProducts.map(({ line }) => line),
        }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || t.error);
      setSuccess(data.order as Order);
      setCart([]);
      setNote("");
      window.localStorage.removeItem(storageKey);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally {
      setPlacing(false);
    }
  }

  const fields: { key: keyof typeof address; label: string; required?: boolean; maxLength: number }[] = [
    { key: "fullName", label: t.fullName, required: true, maxLength: 120 },
    { key: "phone", label: t.phone, required: true, maxLength: 40 },
    { key: "addressLine1", label: t.line1, required: true, maxLength: 180 },
    { key: "addressLine2", label: t.line2, maxLength: 180 },
    { key: "city", label: t.city, required: true, maxLength: 100 },
    { key: "region", label: t.region, maxLength: 100 },
    { key: "postalCode", label: t.postal, maxLength: 24 },
    { key: "countryCode", label: t.country, required: true, maxLength: 2 },
  ];

  return (
    <main className="shops-page wasla-storefront" lang={locale} dir={dir}>
      <WorkspaceHeader section="shops" />
      <section className="shops-main">
        {loading ? <div className="shops-empty">{t.loading}</div> : error && !store ? (
          <div className="shops-alert" role="alert">{error}<button type="button" onClick={() => void load()}>{t.retry}</button></div>
        ) : store && (
          <>
            <div className="shops-heading">
              <div><span className="shops-eyebrow">{t.eyebrow}</span><h1>{store.name}</h1><p>{t.business} {store.businessName}{store.countryCode ? ` · ${store.countryCode}` : ""}</p></div>
              <div className="shops-heading-icon" aria-hidden="true">W</div>
            </div>
            {store.businessDescription && <p className="wasla-store-description">{store.businessDescription}</p>}
            {success ? (
              <section className="shops-create-card wasla-order-success">
                <span className="shops-eyebrow">{t.success}</span>
                <h2>{success.orderNumber}</h2>
                <p>{success.grandTotal} {success.currency}</p>
                <Link className="shops-order-nav-link" href="/orders">{t.viewOrders} ↗</Link>
              </section>
            ) : (
              <>
                <div className="shops-section-title"><h2>{t.products}</h2><span>{products.length}</span></div>
                {products.length === 0 ? <div className="shops-empty">{t.empty}</div> : (
                  <div className="wasla-store-product-grid">
                    {products.map(product => {
                      const quantity = cart.find(line => line.productId === product.id)?.quantity ?? 0;
                      return (
                        <article className="wasla-store-product" key={product.id}>
                          {product.imageUrl ? <img src={product.imageUrl} alt={product.title} loading="lazy" /> : <div className="wasla-store-product-placeholder">W</div>}
                          <div className="wasla-store-product-content">
                            <h3>{product.title}</h3>
                            {product.description && <p>{product.description}</p>}
                            <strong>{product.price} {product.currency}</strong>
                            <small>{t.stock}: {product.stockQuantity}</small>
                            {product.stockQuantity > 0 ? (
                              <button type="button" onClick={() => add(product)}>{quantity ? `${t.added} · ${quantity}` : t.add}</button>
                            ) : <span className="wasla-store-out">{t.out}</span>}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                <section className="shops-create-card wasla-cart-panel">
                  <div className="shops-section-title"><h2>{t.cart}</h2><span>{cartCount}</span></div>
                  {cartProducts.length === 0 ? <p>{t.noCart}</p> : (
                    <>
                      {cartProducts.map(({ line, product }) => (
                        <div className="wasla-cart-line" key={product.id}>
                          <div><strong>{product.title}</strong><small>{product.price} {product.currency}</small></div>
                          <div className="wasla-cart-quantity">
                            <button type="button" aria-label="Decrease quantity" onClick={() => changeQuantity(product, line.quantity - 1)}>−</button>
                            <span>{line.quantity}</span>
                            <button type="button" aria-label="Increase quantity" disabled={line.quantity >= product.stockQuantity} onClick={() => changeQuantity(product, line.quantity + 1)}>+</button>
                            <button type="button" className="wasla-cart-remove" onClick={() => changeQuantity(product, 0)}>{t.remove}</button>
                          </div>
                        </div>
                      ))}
                      <div className="shops-info-row"><strong>{t.subtotal}</strong><strong>{subtotal.toFixed(2)} {currency}</strong></div>
                      <p className="wasla-store-security-note">{t.secure}</p>
                      {mixedCurrency && <div className="shops-alert" role="alert">{t.mixedCurrency}</div>}
                      <form className="wasla-checkout-form" onSubmit={checkout}>
                        <h3>{t.address}</h3>
                        <div className="wasla-checkout-fields">
                          {fields.map(field => (
                            <label key={field.key}>{field.label}
                              <input
                                value={address[field.key]}
                                onChange={event => setAddress(current => ({ ...current, [field.key]: event.target.value }))}
                                required={field.required}
                                maxLength={field.maxLength}
                                dir={field.key === "phone" || field.key === "countryCode" ? "ltr" : undefined}
                              />
                            </label>
                          ))}
                        </div>
                        <label>{t.note}<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={3} /></label>
                        <button type="submit" disabled={placing || mixedCurrency || cartProducts.length === 0}>{placing ? t.placing : t.place}</button>
                      </form>
                      <p><Link href="/login?next=%2Forders">{t.login} ↗</Link></p>
                    </>
                  )}
                </section>
              </>
            )}
            {error && <div className="shops-alert" role="alert">{error}</div>}
          </>
        )}
      </section>
    </main>
  );
}
