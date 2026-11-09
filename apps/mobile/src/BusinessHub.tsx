import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createBusinessAccount, getMyBusinessAccounts, getMyStores, createMyStore, type BusinessAccount, type MemberStore, type BusinessAccountType } from "./business";
import { createStoreProduct, getStoreProducts, updateStoreProductStatus, type MemberStoreProduct, type StoreProductStatus } from "./store-products";

type Props = { rtl: boolean };
export default function BusinessHub({ rtl }: Props) {
  const [accounts, setAccounts] = useState<BusinessAccount[]>([]);
  const [stores, setStores] = useState<MemberStore[]>([]);
  const [products, setProducts] = useState<MemberStoreProduct[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<BusinessAccountType>("company");
  const [legal, setLegal] = useState("");
  const [display, setDisplay] = useState("");
  const [country, setCountry] = useState("TR");
  const [description, setDescription] = useState("");
  const [storeName, setStoreName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productCurrency, setProductCurrency] = useState("USD");
  const [productStock, setProductStock] = useState("1");
  const ar = rtl;
  const label = (a: string, b: string) => ar ? a : b;
  const load = async () => {
    setBusy(true); setMessage("");
    try {
      const values = await Promise.all([getMyBusinessAccounts(), getMyStores()]);
      setAccounts(values[0]); setStores(values[1]);
      if (!accountId && values[0].length) setAccountId(values[0][0].id);
      if (!storeSlug && values[1].length) setStoreSlug(values[1][0].slug);
    } catch { setMessage(label("تعذر تحميل البيانات التجارية.", "Could not load business data.")); }
    finally { setBusy(false); }
  };
  const addAccount = async () => {
    if (busy || legal.trim().length < 2 || display.trim().length < 2) return;
    setBusy(true); setMessage("");
    try {
      const item = await createBusinessAccount({ accountType: kind, legalName: legal.trim(), displayName: display.trim(), countryCode: country.trim().toUpperCase(), description: description.trim() });
      setAccounts(v => [item, ...v]); setAccountId(item.id); setLegal(""); setDisplay(""); setDescription("");
      setMessage(label("تم إنشاء الحساب التجاري.", "Business account created."));
    } catch { setMessage(label("تعذر إنشاء الحساب. تحقق من البيانات والصلاحيات.", "Could not create account. Check details and permissions.")); }
    finally { setBusy(false); }
  };
  const addStore = async () => {
    if (busy || !accountId || storeName.trim().length < 2) return;
    setBusy(true); setMessage("");
    try {
      const item = await createMyStore({ accountId, name: storeName.trim() });
      setStores(v => [item, ...v]); setStoreSlug(item.slug); setStoreName("");
      setMessage(label("تم إنشاء المتجر.", "Store created."));
    } catch { setMessage(label("تعذر إنشاء المتجر. تحقق من صلاحيات الحساب.", "Could not create store. Check account permissions.")); }
    finally { setBusy(false); }
  };
  const loadProducts = async () => {
    if (busy || !storeSlug) return;
    setBusy(true); setMessage("");
    try { setProducts(await getStoreProducts(storeSlug)); }
    catch { setMessage(label("تعذر تحميل منتجات المتجر.", "Could not load store products.")); }
    finally { setBusy(false); }
  };
  const addProduct = async () => {
    const stock = Number(productStock);
    if (busy || !storeSlug || productTitle.trim().length < 2 || !/^\\d{1,10}(\\.\\d{1,2})?$/.test(productPrice.trim()) || !Number.isSafeInteger(stock) || stock < 0 || !/^[A-Za-z]{3}$/.test(productCurrency)) {
      setMessage(label("تحقق من اسم المنتج والسعر والعملة والكمية.", "Check product name, price, currency, and stock."));
      return;
    }
    setBusy(true); setMessage("");
    try {
      const item = await createStoreProduct(storeSlug, { title: productTitle.trim(), description: productDescription.trim(), price: productPrice.trim(), currency: productCurrency.toUpperCase(), stockQuantity: stock, status: "draft" });
      setProducts(v => [item, ...v]); setProductTitle(""); setProductDescription(""); setProductPrice("");
      setMessage(label("تم حفظ المنتج كمسودة. راجعه ثم فعّله عند الجاهزية.", "Product saved as a draft. Review it before activating."));
    } catch { setMessage(label("تعذر حفظ المنتج. تأكد من صلاحيات المتجر.", "Could not save product. Check store permissions.")); }
    finally { setBusy(false); }
  };
  const changeStatus = async (item: MemberStoreProduct) => {
    if (busy || !storeSlug) return;
    const next: StoreProductStatus = item.status === "active" ? "draft" : "active";
    setBusy(true); setMessage("");
    try {
      const updated = await updateStoreProductStatus(storeSlug, item.id, next);
      setProducts(v => v.map(p => p.id === updated.id ? updated : p));
    } catch { setMessage(label("تعذر تحديث حالة المنتج.", "Could not update product status.")); }
    finally { setBusy(false); }
  };
  const types: BusinessAccountType[] = ["company", "supplier", "manufacturer", "trader", "brand"];
  const typeName = (v: BusinessAccountType) => ({ company: label("شركة", "Company"), supplier: label("مورد", "Supplier"), manufacturer: label("مصنع", "Manufacturer"), trader: label("تاجر", "Trader"), brand: label("علامة", "Brand") })[v];
  const statusName = (v: StoreProductStatus) => ({ draft: label("مسودة", "Draft"), active: label("نشط", "Active"), archived: label("مؤرشف", "Archived") })[v];
  return <View style={s.panel}>
    <Text style={[s.heading, rtl && s.right]}>{label("حساباتي التجارية ومتاجري", "My business accounts & stores")}</Text>
    <Pressable style={s.outline} onPress={() => void load()} disabled={busy}>{busy ? <ActivityIndicator /> : <Text style={s.dark}>{label("تحميل حساباتي", "Load my accounts")}</Text>}</Pressable>
    <Text style={[s.subheading, rtl && s.right]}>{label("إنشاء حساب تجاري", "Create business account")}</Text>
    <View style={s.types}>{types.map(v => <Pressable key={v} onPress={() => setKind(v)} style={[s.chip, kind === v && s.selected]}><Text style={[s.chipText, kind === v && s.selectedText]}>{typeName(v)}</Text></Pressable>)}</View>
    <TextInput value={legal} onChangeText={setLegal} placeholder={label("الاسم القانوني", "Legal name")} style={[s.input, rtl && s.right]} />
    <TextInput value={display} onChangeText={setDisplay} placeholder={label("اسم النشاط", "Business name")} style={[s.input, rtl && s.right]} />
    <TextInput value={country} onChangeText={setCountry} maxLength={2} autoCapitalize="characters" placeholder="Country code" style={s.input} />
    <TextInput value={description} onChangeText={setDescription} multiline maxLength={5000} placeholder={label("وصف النشاط", "Business description")} style={[s.input, s.multi, rtl && s.right]} />
    <Pressable style={s.primary} onPress={() => void addAccount()} disabled={busy}><Text style={s.white}>{label("إنشاء الحساب", "Create account")}</Text></Pressable>
    <Text style={[s.subheading, rtl && s.right]}>{label("الحسابات التجارية", "Business accounts")}</Text>
    {accounts.length === 0 ? <Text style={s.note}>{label("حمّل الحسابات لعرضها هنا.", "Load accounts to see them here.")}</Text> : accounts.map(a => <Pressable key={a.id} onPress={() => setAccountId(a.id)} style={[s.item, accountId === a.id && s.active]}><Text style={s.dark}>{a.display_name}</Text><Text style={s.note}>{typeName(a.account_type)} · {a.status}</Text></Pressable>)}
    <Text style={[s.subheading, rtl && s.right]}>{label("إنشاء متجر", "Create a store")}</Text>
    <TextInput value={storeName} onChangeText={setStoreName} placeholder={label("اسم المتجر", "Store name")} style={[s.input, rtl && s.right]} />
    <Pressable style={s.primary} onPress={() => void addStore()} disabled={busy || !accountId}><Text style={s.white}>{label("إنشاء متجر", "Create store")}</Text></Pressable>
    {stores.map(v => <Pressable key={v.id} onPress={() => { setStoreSlug(v.slug); setProducts([]); }} style={[s.item, storeSlug === v.slug && s.active]}><Text style={s.dark}>{v.name}</Text><Text style={s.note}>{v.slug} · {v.status}</Text></Pressable>)}
    <Text style={[s.subheading, rtl && s.right]}>{label("منتجات المتجر المحدد", "Selected store products")}</Text>
    <Pressable style={s.outline} onPress={() => void loadProducts()} disabled={busy || !storeSlug}><Text style={s.dark}>{label("تحميل المنتجات", "Load products")}</Text></Pressable>
    <TextInput value={productTitle} onChangeText={setProductTitle} placeholder={label("اسم المنتج", "Product title")} style={[s.input, rtl && s.right]} />
    <TextInput value={productDescription} onChangeText={setProductDescription} multiline maxLength={5000} placeholder={label("وصف المنتج", "Product description")} style={[s.input, s.multi, rtl && s.right]} />
    <View style={s.types}>
      <TextInput value={productPrice} onChangeText={setProductPrice} keyboardType="decimal-pad" placeholder={label("السعر", "Price")} style={[s.input, s.short]} />
      <TextInput value={productCurrency} onChangeText={setProductCurrency} autoCapitalize="characters" maxLength={3} placeholder="USD" style={[s.input, s.short]} />
      <TextInput value={productStock} onChangeText={setProductStock} keyboardType="number-pad" placeholder={label("الكمية", "Stock")} style={[s.input, s.short]} />
    </View>
    <Pressable style={s.primary} onPress={() => void addProduct()} disabled={busy || !storeSlug}><Text style={s.white}>{label("حفظ المنتج كمسودة", "Save product as draft")}</Text></Pressable>
    {products.map(p => <View key={p.id} style={s.item}><Text style={s.dark}>{p.title}</Text><Text style={s.note}>{p.price} {p.currency} · {label("الكمية", "Stock")}: {p.stockQuantity} · {statusName(p.status)}</Text><Pressable onPress={() => void changeStatus(p)} disabled={busy || p.status === "archived"}><Text style={s.action}>{p.status === "active" ? label("إيقاف المنتج", "Move to draft") : label("تفعيل المنتج", "Activate product")}</Text></Pressable></View>)}
    {!!message && <Text style={s.note}>{message}</Text>}
  </View>;
}
const s = StyleSheet.create({
  panel: { marginTop: 16, gap: 11, padding: 14, borderRadius: 14, backgroundColor: "#F7F4EC", borderWidth: 1, borderColor: "#ECE6D9" },
  heading: { color: "#14283F", fontSize: 18, fontWeight: "900" },
  subheading: { color: "#14283F", fontSize: 14, fontWeight: "800", marginTop: 5 },
  right: { textAlign: "right", writingDirection: "rtl" },
  input: { borderWidth: 1, borderColor: "#D8D1C2", borderRadius: 10, padding: 11, color: "#14283F", backgroundColor: "#FFFFFF" },
  short: { flex: 1, minWidth: 70 },
  multi: { minHeight: 70, textAlignVertical: "top" },
  types: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1, borderColor: "#D8D1C2", borderRadius: 18, paddingHorizontal: 9, paddingVertical: 7 },
  selected: { backgroundColor: "#14283F", borderColor: "#14283F" },
  chipText: { color: "#14283F", fontSize: 12, fontWeight: "700" },
  selectedText: { color: "#FFFFFF" },
  primary: { backgroundColor: "#14283F", padding: 13, borderRadius: 10, alignItems: "center" },
  white: { color: "#FFFFFF", fontWeight: "800" },
  outline: { borderWidth: 1, borderColor: "#D8D1C2", padding: 11, borderRadius: 10, alignItems: "center" },
  dark: { color: "#14283F", fontWeight: "800" },
  item: { padding: 11, borderWidth: 1, borderColor: "#ECE6D9", borderRadius: 10, gap: 4, backgroundColor: "#FFFFFF" },
  active: { borderColor: "#C9A45D", backgroundColor: "#FBF8F0" },
  action: { color: "#8A642A", fontSize: 12, fontWeight: "800", marginTop: 5 },
  note: { color: "#626A72", fontSize: 12 }
});
