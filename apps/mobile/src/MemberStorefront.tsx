import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import { API_BASE_URL, WaslaApiError } from "./api";
import { cancelStoreOrder, createStoreOrder, getStoreOrders, type MemberStoreOrder } from "./store-orders";
import { authClient } from "./auth-client";

type Product = {
  id: string;
  title: string;
  description?: string | null;
  price: string;
  currency: string;
  imageUrl?: string | null;
};
type StoreData = { id: string; name: string; slug: string };
type DirectoryStore = {
  id: string; name: string; slug: string; businessName?: string | null;
  countryCode?: string | null; businessDescription?: string | null; activeProductCount: number;
};

export default function MemberStorefront({ rtl }: { rtl: boolean }) {
  const [slug, setSlug] = useState("");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryCountry, setDirectoryCountry] = useState("");
  const [directoryStores, setDirectoryStores] = useState<DirectoryStore[]>([]);
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const [store, setStore] = useState<StoreData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [myOrders, setMyOrders] = useState<MemberStoreOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const { data: session } = authClient.useSession();
  const label = (ar: string, en: string) => rtl ? ar : en;


  async function searchPublicStores() {
    if (directoryBusy) return;
    setDirectoryBusy(true);
    setMessage("");
    try {
      const query = directoryQuery.trim();
      const country = directoryCountry.trim().toUpperCase();
      if (country && !/^[A-Z]{2}$/.test(country)) {
        setMessage(label("اكتب رمز الدولة من حرفين، مثل TR أو US.", "Enter a two-letter country code, such as TR or US."));
        return;
      }
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (country) params.set("country", country);
      const suffix = params.toString();
      const response = await fetch(
        `${API_BASE_URL}/api/public/stores${suffix ? `?${suffix}` : ""}`,
        { headers: { Accept: "application/json" } },
      );
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.stores)) {
        throw new WaslaApiError("STORE_DIRECTORY_UNAVAILABLE", response.status);
      }
      setDirectoryStores(data.stores);
    } catch {
      setMessage(label("تعذر تحميل دليل المتاجر حالياً.", "Could not load the store directory right now."));
    } finally {
      setDirectoryBusy(false);
    }
  }

  async function loadStoreBySlug(rawSlug: string) {
    const value = rawSlug.trim().toLowerCase();
    if (!value || busy) return;
    setBusy(true); setMessage(""); setStore(null); setProducts([]); setMyOrders([]); setQuantities({}); setNote("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/public/stores/${encodeURIComponent(value)}`, {
        headers: { Accept: "application/json" },
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.store || !Array.isArray(data.products)) {
        throw new WaslaApiError("STORE_NOT_FOUND", response.status);
      }
      setStore(data.store);
      setProducts(data.products);
      setSlug(data.store.slug);
    } catch {
      setMessage(label("تعذر تحميل المتجر. تحقق من رابط/رمز المتجر.", "Could not load this store. Check its store slug."));
    } finally { setBusy(false); }
  }

  async function loadStore() { await loadStoreBySlug(slug); }

  async function loadMyOrders() {
    if (!store || !session?.user || ordersLoading) return;
    setOrdersLoading(true);
    setMessage("");
    try {
      const orders = await getStoreOrders(store.slug);
      setMyOrders(orders.filter(order => order.buyerUserId === session.user.id));
    } catch {
      setMessage(label("تعذر تحميل طلباتك حالياً.", "Could not load your requests right now."));
    } finally {
      setOrdersLoading(false);
    }
  }

  async function cancelMyOrder(order: MemberStoreOrder) {
    if (!store || busy || order.status !== "pending_merchant_review") return;
    setBusy(true);
    setMessage("");
    try {
      await cancelStoreOrder(store.slug, order.id);
      await loadMyOrders();
      setMessage(label("تم إلغاء الطلب.", "Your request was cancelled."));
    } catch {
      setMessage(label("تعذر إلغاء الطلب. ربما تمت مراجعته بالفعل.", "Could not cancel the request. It may already have been reviewed."));
    } finally {
      setBusy(false);
    }
  }

  function orderStatus(status: MemberStoreOrder["status"]) {
    const labels = {
      pending_merchant_review: ["بانتظار مراجعة المتجر", "Awaiting merchant review"],
      accepted: ["مقبول من المتجر", "Accepted by the store"],
      rejected: ["لم يقبله المتجر", "Declined by the store"],
      cancelled: ["ملغي", "Cancelled"],
    } as const;
    const pair = labels[status];
    return label(pair[0], pair[1]);
  }

  async function requestProduct(product: Product) {
    if (!session?.user) {
      setMessage(label("سجّل الدخول أولاً لإرسال طلب.", "Please sign in before sending a request."));
      return;
    }
    const quantity = Number(quantities[product.id] ?? "1");
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000 || busy || !store) {
      setMessage(label("أدخل كمية صحيحة.", "Enter a valid quantity."));
      return;
    }
    setBusy(true); setMessage("");
    try {
      const key = `wasla-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
      const order = await createStoreOrder(store.slug, [{ productId: product.id, quantity }], note.trim() || undefined, key);
      setNote("");
      await loadMyOrders();
      setMessage(label(
        `تم إرسال الطلب ${order.orderNumber} إلى المتجر للمراجعة. لم يتم تحصيل أي مبلغ.`,
        `Request ${order.orderNumber} was sent for merchant review. No payment was collected.`,
      ));
    } catch (error) {
      setMessage(error instanceof WaslaApiError && error.status === 401
        ? label("انتهت الجلسة. سجّل الدخول مجدداً.", "Your session expired. Please sign in again.")
        : label("تعذر إرسال الطلب. حاول مرة أخرى.", "Could not send the request. Please try again."));
    } finally { setBusy(false); }
  }

  return <View style={{ marginTop: 20, padding: 16, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5DFD1", gap: 10 }}>
    <Text style={{ color: "#14283F", fontSize: 19, fontWeight: "700", textAlign: rtl ? "right" : "left" }}>{label("تصفح متاجر الأعضاء", "Browse member stores")}</Text>
    <Text style={{ color: "#64748B", textAlign: rtl ? "right" : "left" }}>{label("ابحث عن متجر أو شركة، ثم افتح المتجر لعرض المنتجات وإرسال طلب.", "Search for a store or business, then open it to browse products and send a request.")}</Text>
    <TextInput value={directoryQuery} onChangeText={setDirectoryQuery} placeholder={label("ابحث عن متجر أو شركة", "Search stores or businesses")} style={{ borderWidth: 1, borderColor: "#E5DFD1", borderRadius: 9, padding: 12, color: "#14283F", textAlign: rtl ? "right" : "left" }} />
    <TextInput value={directoryCountry} onChangeText={setDirectoryCountry} autoCapitalize="characters" maxLength={2} placeholder={label("رمز الدولة (اختياري: TR)", "Country code (optional: TR)")} style={{ borderWidth: 1, borderColor: "#E5DFD1", borderRadius: 9, padding: 12, color: "#14283F", textAlign: rtl ? "right" : "left" }} />
    <Pressable onPress={() => void searchPublicStores()} disabled={directoryBusy} style={{ borderWidth: 1, borderColor: "#B89545", borderRadius: 9, padding: 11, alignItems: "center" }}>
      {directoryBusy ? <ActivityIndicator color="#14283F" /> : <Text style={{ color: "#14283F", fontWeight: "700" }}>{label("بحث في المتاجر", "Search stores")}</Text>}
    </Pressable>
    {directoryStores.length === 0 && !directoryBusy ? <Text style={{ color: "#64748B", textAlign: rtl ? "right" : "left" }}>{label("ابحث عن متجر أو اترك البحث فارغاً لعرض المتاجر المتاحة.", "Search for a store or leave the search empty to browse available stores.")}</Text> : null}
    {directoryStores.map(item => <Pressable key={item.id} onPress={() => { setSlug(item.slug); setMessage(""); void loadStoreBySlug(item.slug); }} style={{ padding: 11, borderRadius: 9, backgroundColor: "#F8F6F1", gap: 3 }}>
      <Text style={{ color: "#14283F", fontWeight: "700", textAlign: rtl ? "right" : "left" }}>{item.name}</Text>
      {!!item.businessName && <Text style={{ color: "#64748B", textAlign: rtl ? "right" : "left" }}>{item.businessName}</Text>}
      {!!item.businessDescription && <Text style={{ color: "#64748B", textAlign: rtl ? "right" : "left" }} numberOfLines={2}>{item.businessDescription}</Text>}
      <Text style={{ color: "#9B792F", textAlign: rtl ? "right" : "left" }}>{item.activeProductCount} {label("منتج نشط", "active products")}{item.countryCode ? ` · ${item.countryCode}` : ""}</Text>
    </Pressable>)}
    <TextInput value={slug} onChangeText={setSlug} autoCapitalize="none" placeholder={label("رمز المتجر", "Store slug")} style={{ borderWidth: 1, borderColor: "#E5DFD1", borderRadius: 9, padding: 12, color: "#14283F", textAlign: rtl ? "right" : "left" }} />
    <Pressable onPress={() => void loadStore()} disabled={busy} style={{ backgroundColor: "#14283F", borderRadius: 9, padding: 13, alignItems: "center" }}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{label("عرض المتجر", "Load store")}</Text>}
    </Pressable>
    {store ? <Text style={{ color: "#B89545", fontSize: 17, fontWeight: "700", textAlign: rtl ? "right" : "left" }}>{store.name}</Text> : null}
    {store && session?.user ? <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: "#EEE8DC", paddingTop: 12 }}>
      <Pressable onPress={() => void loadMyOrders()} disabled={ordersLoading || busy} style={{ borderWidth: 1, borderColor: "#B89545", borderRadius: 8, padding: 10, alignItems: "center" }}>
        {ordersLoading ? <ActivityIndicator color="#14283F" /> : <Text style={{ color: "#14283F", fontWeight: "700" }}>{label("طلباتي من هذا المتجر", "My requests from this store")}</Text>}
      </Pressable>
      {myOrders.map(order => <View key={order.id} style={{ padding: 10, borderRadius: 8, backgroundColor: "#F8F6F1", gap: 5 }}>
        <Text style={{ color: "#14283F", fontWeight: "700", textAlign: rtl ? "right" : "left" }}>{order.orderNumber}</Text>
        <Text style={{ color: "#64748B", textAlign: rtl ? "right" : "left" }}>{orderStatus(order.status)}</Text>
        <Text style={{ color: "#9B792F", textAlign: rtl ? "right" : "left" }}>{order.subtotal} {order.currency}</Text>
        {order.status === "pending_merchant_review" ? <Pressable disabled={busy} onPress={() => void cancelMyOrder(order)} style={{ alignSelf: rtl ? "flex-end" : "flex-start", paddingVertical: 7, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: "#B45309" }}>
          <Text style={{ color: "#92400E", fontWeight: "700" }}>{label("إلغاء الطلب", "Cancel request")}</Text>
        </Pressable> : null}
      </View>)}
      {myOrders.length === 0 && !ordersLoading ? <Text style={{ color: "#64748B", textAlign: rtl ? "right" : "left" }}>{label("لا توجد طلبات سابقة من هذا المتجر.", "No previous requests from this store.")}</Text> : null}
    </View> : null}
    {products.map(product => <View key={product.id} style={{ borderTopWidth: 1, borderTopColor: "#EEE8DC", paddingTop: 12, gap: 7 }}>
      {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={{ width: "100%", height: 150, borderRadius: 9 }} resizeMode="cover" /> : null}
      <Text style={{ color: "#14283F", fontWeight: "700", textAlign: rtl ? "right" : "left" }}>{product.title}</Text>
      {!!product.description && <Text style={{ color: "#64748B", textAlign: rtl ? "right" : "left" }}>{product.description}</Text>}
      <Text style={{ color: "#9B792F", fontWeight: "700", textAlign: rtl ? "right" : "left" }}>{product.price} {product.currency}</Text>
      <View style={{ flexDirection: rtl ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
        <TextInput value={quantities[product.id] ?? "1"} onChangeText={value => setQuantities(current => ({ ...current, [product.id]: value }))} keyboardType="number-pad" placeholder="1" style={{ width: 65, borderWidth: 1, borderColor: "#E5DFD1", borderRadius: 8, padding: 9, color: "#14283F" }} />
        <Pressable disabled={busy} onPress={() => void requestProduct(product)} style={{ flex: 1, backgroundColor: "#B89545", borderRadius: 8, padding: 11, alignItems: "center" }}>
          <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{label("إرسال طلب", "Request product")}</Text>
        </Pressable>
      </View>
    </View>)}
    {store && products.length === 0 ? <Text style={{ color: "#64748B", textAlign: rtl ? "right" : "left" }}>{label("لا توجد منتجات منشورة.", "No published products.")}</Text> : null}
    {store && products.length > 0 ? <TextInput value={note} onChangeText={setNote} maxLength={2000} multiline placeholder={label("ملاحظة للمتجر (اختياري)", "Note to merchant (optional)")} style={{ borderWidth: 1, borderColor: "#E5DFD1", borderRadius: 9, padding: 12, minHeight: 65, color: "#14283F", textAlign: rtl ? "right" : "left" }} /> : null}
    {!!message && <Text accessibilityRole="alert" style={{ color: "#765A2F", textAlign: rtl ? "right" : "left" }}>{message}</Text>}
    <Text style={{ color: "#64748B", fontSize: 11, textAlign: rtl ? "right" : "left" }}>{label("الطلب يحتاج موافقة المتجر. لا يتم الدفع أو حجز المخزون عبر هذه الخطوة.", "Requests require merchant approval. This step does not collect payment or reserve stock.")}</Text>
  </View>;
}
