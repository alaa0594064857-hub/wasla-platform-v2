import React, { useMemo, useState } from "react";
import {
  I18nManager,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
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
    setup: "نسخة تأسيسية — سيتم ربط الخدمات تدريجياً بواجهة WASLA API."
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
    setup: "Foundation build — services will be connected to the WASLA API in stages."
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

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F4EC" />
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
          <Pressable accessibilityRole="button" style={styles.primaryButton}>
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
  note: { marginTop: 24, borderRadius: 14, backgroundColor: "#EEE9DD", padding: 15 },
  noteText: { color: "#626A72", fontSize: 12, lineHeight: 19 },
  footer: { marginTop: 28, textAlign: "center", color: "#899099", fontSize: 12 }
});
