import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import { API_BASE_URL, WaslaApiError } from "./api";
import { createStoreOrder } from "./store-orders";
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

export default function MemberStorefront({ rtl }: { rtl: boolean }) {
  const [slug, setSlug] = useState("");
  const [store, setStore] = useState<StoreData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { data: session } = authClient.useSession();
  const label = (ar: string, en: string) => rtl ? ar : en;

  async function loadStore() {
    const value = slug.trim().toLowerCase();
    if (!value || busy) return;
    setBusy(true); setMessage(""); setStore(null); setProducts([]);
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
      setMessage(label(
        `تم إرسال الطلب ${order.orderNumber} إلى المتجر للمراجعة. لم يتم تحصيل أي مبلغ.`,
        `Request ${order.orderNumber} was sent for merchant review. No payment was collected.`,
      ));
      setNote("");
    } catch (error) {
      setMessage(error instanceof WaslaApiError && error.status === 401
        ? label("انتهت الجلسة. سجّل الدخول مجدداً.", "Your session expired. Please sign in again.")
        : label("تعذر إرسال الطلب. حاول مرة أخرى.", "Could not send the request. Please try again."));
    } finally { setBusy(false); }
  }

  return <View style={{ marginTop: 20, padding: 16, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5DFD1", gap: 10 }}>
    <Text style={{ color: "#14283F", fontSize: 19, fontWeight: "700", textAlign: rtl ? "right" : "left" }}>{label("تصفح متاجر الأعضاء", "Browse member stores")}</Text>
    <Text style={{ color: "#64748B", textAlign: rtl ? "right" : "left" }}>{label("أدخل رمز المتجر لعرض المنتجات وإرسال طلب للمتجر.", "Enter a store slug to browse products and send a request to the merchant.")}</Text>
    <TextInput value={slug} onChangeText={setSlug} autoCapitalize="none" placeholder={label("رمز المتجر", "Store slug")} style={{ borderWidth: 1, borderColor: "#E5DFD1", borderRadius: 9, padding: 12, color: "#14283F", textAlign: rtl ? "right" : "left" }} />
    <Pressable onPress={() => void loadStore()} disabled={busy} style={{ backgroundColor: "#14283F", borderRadius: 9, padding: 13, alignItems: "center" }}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{label("عرض المتجر", "Load store")}</Text>}
    </Pressable>
    {store ? <Text style={{ color: "#B89545", fontSize: 17, fontWeight: "700", textAlign: rtl ? "right" : "left" }}>{store.name}</Text> : null}
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
