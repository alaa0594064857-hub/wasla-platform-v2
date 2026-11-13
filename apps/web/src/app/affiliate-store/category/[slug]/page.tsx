import { redirect } from "next/navigation";

const allowed = new Set(["electronics", "drinkware"]);

export default async function StoreCategoryPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ country?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const country = query.country === "US" ? "US" : "TR";
  const category = allowed.has(slug) ? slug : null;
  const destination = new URLSearchParams({ country });
  if (category) destination.set("category", category);
  redirect(`/affiliate-store?${destination.toString()}`);
}
