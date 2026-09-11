import { redirect } from "next/navigation";
import { getUser, createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { getPlan } from "@/lib/limits";
import { accentInitScript } from "@/lib/accent-colors";
import { AppNav } from "@/components/nav";
import { ToastProvider } from "@/components/ui";
import { ForegroundNotifier } from "@/components/notifications";
import { UrgentPopup } from "@/components/urgent-popup";
import { InstallPrompt } from "@/components/install-prompt";
import { AutoRefresh } from "@/components/auto-refresh";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const sb = await createClient();
  const admin = createAdmin();
  const [plan, { data: prefs }, { data: account }] = await Promise.all([
    getPlan(sb, user.id),
    sb.from("user_preferences").select("accent_color").eq("user_id", user.id).single(),
    admin.from("users").select("disabled_at").eq("id", user.id).maybeSingle(),
  ]);
  // A session JWT can outlive an admin disabling the account mid-session -
  // this is the enforcement point for that case (login-time blocking in
  // auth.ts only stops a NEW session from starting). Piggybacks on a DB
  // round-trip this layout already makes, so no extra query cost.
  if (account?.disabled_at) redirect("/account-disabled");
  // Free users never get a script here beyond the default - a lapsed
  // subscription shouldn't keep painting a color the plan no longer allows,
  // even for the split second before the client-side gate in useAccent()
  // would otherwise reset it.
  const accent = plan === "free" ? "amber" : (prefs?.accent_color ?? "amber");
  return (
    <ToastProvider>
      <script dangerouslySetInnerHTML={{ __html: accentInitScript(accent) }} />
      <ForegroundNotifier />
      <UrgentPopup />
      <InstallPrompt />
      <AutoRefresh />
      <AppNav plan={plan}>{children}</AppNav>
    </ToastProvider>
  );
}
