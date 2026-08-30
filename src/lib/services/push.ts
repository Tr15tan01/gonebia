import webpush from "web-push";
import { createAdmin } from "@/lib/supabase/admin";

let configured = false;
function ensure() {
  if (configured) return true;
  const pub = process.env.WEB_PUSH_PUBLIC_KEY, priv = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:support@timelymemo.app", pub, priv);
  configured = true;
  return true;
}

export const PushService = {
  async pushToUser(userId: string, payload: { title: string; body: string; url?: string }) {
    if (!ensure()) return;
    const admin = createAdmin();
    const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", userId);
    await Promise.allSettled((subs ?? []).map((s: any) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload))
        .catch((err: any) => {
          // clean up dead subscriptions (uninstalled PWA, expired endpoint)
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            return admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        })
    ));
  },
};
