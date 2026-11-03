import AuthForm from "@/components/auth-form";

export const metadata = {
  title: "تسجيل الدخول | WASLA",
  description: "Sign in to your WASLA account.",
};

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
