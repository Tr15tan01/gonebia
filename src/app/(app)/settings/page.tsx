import { getUser, createClient } from "@/lib/supabase/server";
import { SettingsClient } from "@/components/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getUser();
  const sb = await createClient();
  const [{ data: prefs }, { data: profile }] = await Promise.all([
    sb.from("user_preferences").select("*").eq("user_id", user!.id).single(),
    sb.from("profiles").select("email, timezone").eq("id", user!.id).single(),
  ]);
  return (
    <SettingsClient
      email={profile?.email ?? user!.email!}
      prefs={prefs}
      timezone={profile?.timezone ?? "UTC"}
    />
  );
}
