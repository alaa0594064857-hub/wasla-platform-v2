import AuthForm from "@/components/auth-form";

export const metadata = {
  title: "إنشاء حساب | WASLA",
  description: "Create your WASLA account.",
};

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
