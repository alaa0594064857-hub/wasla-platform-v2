import React, { useEffect, useMemo, useState } from "react";
import { getOfficialStoreProducts, WaslaApiError } from "./src/api";
import type { OfficialStoreProduct } from "./src/api";
import { authClient } from "./src/auth-client";
import { getMyProfile, updateMyProfile, type WaslaProfile } from "./src/profile";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  ActivityIndicator,
  Image,
  View,
} from "react-native";

type Language = "ar" | "en";

const copy = {
  ar: {
    direction: "rtl" as const,
    language: "English",
    eyebrow: "منصة التجارة والأعمال العالمية",
    title: "كل أعمالك التجارية، في مكان واحد.",
    subtitle: "اكتشف المنتجات والمتاجر والفرص التجارية، وتواصل مع مجتمع الأعمال عبر WASLA.",
    explore: "استكشاف المنصة",
    shops: "المتاجر",
    business: "الأعمال والموردون",
    trade: "الفرص التجارية",
    messages: "الرسائل",
    account: "حساب موحد",
    footer: "وصلة تجمع عالم التجارة والأعمال.",
    setup: "كتالوج المتجر الرسمي مرتبط بواجهة WASLA API.",
    country: "رمز دولة التوصيل (مثلاً TR أو US)",
    load: "عرض المنتجات",
    loading: "جارٍ تحميل المنتجات...",
    empty: "لا توجد منتجات معتمدة لهذه الدولة حالياً.",
    error: "تعذر الاتصال بالكتالوج. حاول مرة أخرى لاحقاً.",
    price: "السعر",
    available: "متوفر",
    limited: "توفر محدود",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    signIn: "تسجيل الدخول",
    signOut: "تسجيل الخروج",
    signedIn: "تم تسجيل الدخول",
    authError: "تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.",
    profile: "الملف الشخصي",
    loadProfile: "تحميل الملف الشخصي",
    displayName: "الاسم",
    avatar: "رابط الصورة الشخصية (HTTPS)",
    bio: "نبذة عنك",
    website: "الموقع الإلكتروني",
    saveProfile: "حفظ التعديلات",
    profileSaved: "تم حفظ الملف الشخصي بنجاح.",
    profileError: "تعذر تحميل أو حفظ الملف الشخصي.",
    profileHint: "بياناتك الشخصية لا تظهر إلا بعد تسجيل الدخول."
  },
  en: {
    direction: "ltr" as const,
    language: "العربية",
    eyebrow: "GLOBAL COMMERCE & BUSINESS",
    title: "Your business world, connected.",
    subtitle: "Discover products, stores, and trade opportunities, and connect with the business community through WASLA.",
    explore: "Explore WASLA",
    shops: "Shops",
    business: "Businesses & suppliers",
    trade: "Trade opportunities",
    messages: "Messages",
    account: "One unified account",
    footer: "WASLA connects commerce and business.",
    setup: "The official store catalogue is connected to the WASLA API.",
    country: "Delivery country code (e.g. TR or US)",
    load: "Load products",
    loading: "Loading products...",
    empty: "No approved products are currently available for this country.",
    error: "Could not connect to the catalogue. Please try again.",
    price: "Price",
    available: "Available",
    limited: "Limited availability",
    email: "Email address",
    password: "Password",
    signIn: "Sign in",
    signOut: "Sign out",
    signedIn: "You are signed in",
    authError: "Sign-in failed. Check your email and password.",
    profile: "My profile",
    loadProfile: "Load profile",
    displayName: "Display name",
    avatar: "Profile image URL (HTTPS)",
    bio: "About you",
    website: "Website",
    saveProfile: "Save changes",
    profileSaved: "Your profile was saved.",
    profileError: "Could not load or save your profile.",
    profileHint: "Your profile details are available after sign-in."
  }
};

const modules = [
  { key: "shops", icon: "▦" },
  { key: "business", icon: "◈" },
  { key: "trade", icon: "⇄" },
  { key: "messages", icon: "✉" }
] as const;

export default function App() {
  const [language, setLanguage] = useState<Language>("ar");
  const t = useMemo(() => copy[language], [language]);
  const rtl = t.direction === "rtl";
  const [country, setCountry] = useState("TR");
  const [products, setProducts] = useState<OfficialStoreProduct[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueError, setCatalogueError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [profile, setProfile] = useState<WaslaProfile | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarReference, setAvatarReference] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const { data: session, isPending: sessionLoading } = authClient.useSession();

  async function handleSignIn() {
    if (!email.trim() || !password || authBusy) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) setAuthError(t.authError);
      else setPassword("");
    } catch {
      setAuthError(t.authError);
    } finally {
      setAuthBusy(false);
    }
  }


  async function loadProfile() {
    if (profileBusy) return;
    setProfileBusy(true);
    setProfileMessage("");
    try {
      const value = await getMyProfile();
      setProfile(value);
      setDisplayName(value.displayName);
      setAvatarReference(value.avatarReference ?? "");
      setBio(value.bio);
      setWebsite(value.website);
    } catch {
      setProfileMessage(t.profileError);
    } finally {
      setProfileBusy(false);
    }
  }

  async function saveProfile() {
    if (profileBusy || !profile) return;
    setProfileBusy(true);
    setProfileMessage("");
    try {
      await updateMyProfile({
        displayName: displayName.trim(),
        avatarReference: avatarReference.trim() || null,
        bio: bio.trim(),
        website: website.trim(),
        socialLinks: profile.socialLinks ?? {},
      });
      setProfile({ ...profile, displayName: displayName.trim(), avatarReference: avatarReference.trim() || null, bio: bio.trim(), website: website.trim() });
      setProfileMessage(t.profileSaved);
    } catch {
      setProfileMessage(t.profileError);
    } finally {
      setProfileBusy(false);
    }
  }

  useEffect(() => {
    if (session?.user && !profile && !profileBusy) void loadProfile();
    if (!session?.user) { setProfile(null); setProfileMessage(""); }
  }, [session?.user?.id]);

  async function loadCatalogue() {
    setCatalogueLoading(true);
    setCatalogueError("");
    try {
      const result = await getOfficialStoreProducts(country);
      setProducts(result);
    } catch (error) {
      setCatalogueError(error instanceof WaslaApiError && error.message === "INVALID_COUNTRY" ? t.country : t.error);
      setProducts([]);
    } finally {
      setCatalogueLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={[styles.header, rtl && styles.rowRtl]}>
          <View style={[styles.brand, rtl && styles.rowRtl]}>
            <View style={styles.logo}><Text style={styles.logoText}>W</Text></View>
            <Text style={styles.brandName}>WASLA</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.language}
            onPress={() => setLanguage(language === "ar" ? "en" : "ar")}
            style={styles.languageButton}
          >
            <Text style={styles.languageText}>{t.language}</Text>
          </Pressable>
        </View>

        <View style={[styles.hero, rtl && styles.alignEnd]}>
          <Text style={[styles.eyebrow, rtl && styles.textRight]}>{t.eyebrow}</Text>
          <Text style={[styles.title, rtl && styles.textRight]}>{t.title}</Text>
          <Text style={[styles.subtitle, rtl && styles.textRight]}>{t.subtitle}</Text>
          <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => void loadCatalogue()}>
            <Text style={styles.primaryButtonText}>{t.explore}</Text>
          </Pressable>
        </View>

        <View style={[styles.sectionHeader, rtl && styles.rowRtl]}>
          <Text style={[styles.sectionTitle, rtl && styles.textRight]}>{t.account}</Text>
          <View style={styles.goldLine} />
        </View>

        <View style={styles.grid}>
          {modules.map((item) => (
            <View key={item.key} style={styles.moduleCard}>
              <Text style={styles.moduleIcon}>{item.icon}</Text>
              <Text style={[styles.moduleTitle, rtl && styles.textRight]}>{t[item.key]}</Text>
            </View>
          ))}
        </View>

        <View style={styles.authCard}>
          {session?.user ? (
            <>
              <Text style={[styles.catalogueTitle, rtl && styles.textRight]}>{t.signedIn}: {session.user.name}</Text>
              <Pressable accessibilityRole="button" onPress={() => void authClient.signOut()} style={styles.catalogueButton}>
                <Text style={styles.primaryButtonText}>{t.signOut}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.catalogueTitle, rtl && styles.textRight]}>{t.profile}</Text>
              <Text style={[styles.noteText, rtl && styles.textRight]}>{t.profileHint}</Text>
              {profileBusy && !profile ? <ActivityIndicator color="#14283F" /> : null}
              {profile ? (
                <>
                  {avatarReference.startsWith("https://") ? <Image source={{ uri: avatarReference }} style={styles.avatarPreview} /> : null}
                  <Text style={[styles.noteText, rtl && styles.textRight]}>{profile.email}</Text>
                  <TextInput value={displayName} onChangeText={setDisplayName} placeholder={t.displayName} style={[styles.countryInput, rtl && styles.textRight]} />
                  <TextInput value={avatarReference} onChangeText={setAvatarReference} autoCapitalize="none" keyboardType="url" placeholder={t.avatar} style={styles.countryInput} />
                  <TextInput value={bio} onChangeText={setBio} multiline maxLength={500} placeholder={t.bio} style={[styles.countryInput, styles.multilineInput, rtl && styles.textRight]} />
                  <TextInput value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" placeholder={t.website} style={styles.countryInput} />
                  <Pressable accessibilityRole="button" onPress={() => void saveProfile()} disabled={profileBusy} style={styles.catalogueButton}>
                    {profileBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{t.saveProfile}</Text>}
                  </Pressable>
                </>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => void loadProfile()} disabled={profileBusy} style={styles.catalogueButton}>
                  {profileBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{t.loadProfile}</Text>}
                </Pressable>
              )}
              {!!profileMessage && <Text style={profileMessage === t.profileSaved ? styles.successText : styles.errorText}>{profileMessage}</Text>}
            </>
          ) : (
            <>
              <Text style={[styles.catalogueTitle, rtl && styles.textRight]}>{t.signIn}</Text>
              <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder={t.email} style={[styles.countryInput, rtl && styles.textRight]} />
              <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder={t.password} style={[styles.countryInput, rtl && styles.textRight]} />
              <Pressable accessibilityRole="button" onPress={() => void handleSignIn()} disabled={authBusy || sessionLoading} style={styles.catalogueButton}>
                {authBusy || sessionLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{t.signIn}</Text>}
              </Pressable>
              {!!authError && <Text style={styles.errorText}>{authError}</Text>}
            </>
          )}
        </View>

        <View style={styles.catalogue}>
          <Text style={[styles.catalogueTitle, rtl && styles.textRight]}>{t.shops}</Text>
          <TextInput value={country} onChangeText={setCountry} autoCapitalize="characters" maxLength={2} placeholder={t.country} style={[styles.countryInput, rtl && styles.textRight]} />
          <Pressable accessibilityRole="button" onPress={() => void loadCatalogue()} disabled={catalogueLoading} style={styles.catalogueButton}>
            {catalogueLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{t.load}</Text>}
          </Pressable>
          {!!catalogueError && <Text style={styles.errorText}>{catalogueError}</Text>}
          {products.map(product => (
            <View key={product.id} style={styles.productCard}>
              <Text style={[styles.productTitle, rtl && styles.textRight]}>{rtl ? product.title_ar : product.title_en}</Text>
              <Text style={[styles.productPrice, rtl && styles.textRight]}>{t.price}: {product.price} {product.currency}</Text>
              <Text style={[styles.productStatus, rtl && styles.textRight]}>{product.availability_status === "available" ? t.available : t.limited}</Text>
            </View>
          ))}
          {!catalogueLoading && !catalogueError && products.length === 0 && <Text style={[styles.noteText, rtl && styles.textRight]}>{t.empty}</Text>}
        </View>

        <View style={styles.note}>
          <Text style={[styles.noteText, rtl && styles.textRight]}>{t.setup}</Text>
        </View>
        <Text style={styles.footer}>{t.footer}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F4EC" },
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 16, paddingBottom: 32 },
  header: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowRtl: { flexDirection: "row-reverse" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#14283F", alignItems: "center", justifyContent: "center" },
  logoText: { color: "#D8B56D", fontSize: 22, fontWeight: "800" },
  brandName: { color: "#14283F", fontSize: 19, fontWeight: "900", letterSpacing: 1.8 },
  languageButton: { borderWidth: 1, borderColor: "#D8D1C2", borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8 },
  languageText: { color: "#14283F", fontSize: 13, fontWeight: "700" },
  hero: { marginTop: 42, alignItems: "flex-start" },
  alignEnd: { alignItems: "flex-end" },
  eyebrow: { color: "#A17B3D", fontSize: 12, fontWeight: "800", letterSpacing: 1.1 },
  title: { marginTop: 14, color: "#14283F", fontSize: 34, lineHeight: 43, fontWeight: "900", maxWidth: 340 },
  subtitle: { marginTop: 14, color: "#5E6873", fontSize: 16, lineHeight: 26, maxWidth: 360 },
  textRight: { textAlign: "right", writingDirection: "rtl" },
  primaryButton: { marginTop: 25, backgroundColor: "#14283F", paddingHorizontal: 22, paddingVertical: 15, borderRadius: 13 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  sectionHeader: { marginTop: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: "#14283F", fontSize: 18, fontWeight: "800" },
  goldLine: { width: 54, height: 3, borderRadius: 3, backgroundColor: "#C9A45D" },
  grid: { marginTop: 18, flexDirection: "row", flexWrap: "wrap", gap: 12 },
  moduleCard: { width: "48%", minHeight: 118, flexGrow: 1, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#ECE6D9", borderRadius: 16, padding: 16, justifyContent: "space-between" },
  moduleIcon: { color: "#B18A4A", fontSize: 25, fontWeight: "700" },
  moduleTitle: { color: "#14283F", fontSize: 15, fontWeight: "800" },
  authCard: { marginTop: 28, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#ECE6D9", padding: 16, gap: 12 },
  catalogue: { marginTop: 20, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#ECE6D9", padding: 16, gap: 12 },
  catalogueTitle: { color: "#14283F", fontSize: 19, fontWeight: "900" },
  avatarPreview: { width: 84, height: 84, borderRadius: 42, alignSelf: "center", backgroundColor: "#EEE9DD" },
  multilineInput: { minHeight: 92, textAlignVertical: "top" },
  successText: { color: "#18794E", fontSize: 13 },
  countryInput: { borderWidth: 1, borderColor: "#D8D1C2", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, color: "#14283F" },
  catalogueButton: { backgroundColor: "#14283F", padding: 14, borderRadius: 11, alignItems: "center" },
  productCard: { borderTopWidth: 1, borderTopColor: "#ECE6D9", paddingTop: 12, gap: 5 },
  productTitle: { color: "#14283F", fontSize: 15, fontWeight: "800" },
  productPrice: { color: "#5E6873", fontSize: 13 },
  productStatus: { color: "#A17B3D", fontSize: 12, fontWeight: "700" },
  errorText: { color: "#B42318", fontSize: 13 },
  note: { marginTop: 24, borderRadius: 14, backgroundColor: "#EEE9DD", padding: 15 },
  noteText: { color: "#626A72", fontSize: 12, lineHeight: 19 },
  footer: { marginTop: 28, textAlign: "center", color: "#899099", fontSize: 12 }
});
