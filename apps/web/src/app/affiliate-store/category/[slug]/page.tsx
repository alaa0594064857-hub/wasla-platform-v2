import { redirect } from "next/navigation";

const allowed = new Set(["electronics", "drinkware"]);

export default async function StoreCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(allowed.has(slug) ? `/affiliate-store?category=${slug}` : "/affiliate-store");
}
