import webpush from "web-push";
import { createAdmin } from "@/lib/supabase/admin";

let configured = false;
function ensure() {
  if (configured) return true;
  // New names (VAPID_*) with graceful fallback to the old WEB_PUSH_*
  const pub = process.env.VAPID_PUBLIC_KEY ?? process.env.WEB_PUSH_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY ?? process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:support@timelymemo.app";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
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
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            return admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        })
    ));
  },
};
