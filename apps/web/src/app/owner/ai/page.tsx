import { redirect } from "next/navigation";

// The AI entry point opens the executive headquarters directly so the owner
// always lands on the General Manager's command desk without searching menus.
export default function OwnerAiEntryPage(): never {
  redirect("/owner/ai/headquarters");
}
