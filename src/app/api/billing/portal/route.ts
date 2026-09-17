import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { paddleConfigured, paddleFetch } from "@/lib/paddle";

export const dynamic = "force-dynamic";

/** Creates a Paddle customer-portal session (cancel, update card, invoices).
 *  Returns deep links for the user's subscription when Paddle provides them. */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!paddleConfigured()) {
    return NextResponse.json({ error: "Billing portal isn't configured yet (PADDLE_API_KEY is missing on the server)." }, { status: 501 });
  }

  const sb = await createClient();
  const { data: sub } = await sb.from("subscriptions")
    .select("paddle_customer_id, paddle_subscription_id").maybeSingle();
  if (!sub?.paddle_customer_id) {
    return NextResponse.json({ error: "No billing profile found for this account yet. If you just subscribed, wait a minute and try again." }, { status: 404 });
  }

  const body = sub.paddle_subscription_id ? { subscription_ids: [sub.paddle_subscription_id] } : {};
  const r = await paddleFetch(`/customers/${sub.paddle_customer_id}/portal-sessions`, {
    method: "POST", body: JSON.stringify(body),
  });
  if (!r.ok) {
    const detail = r.json?.error?.detail ?? r.json?.error?.code;
    return NextResponse.json({
      error: r.status === 403 || r.status === 401
        ? "The billing API key was rejected - check PADDLE_API_KEY and NEXT_PUBLIC_PADDLE_ENV (sandbox vs live)."
        : `Couldn't open the billing portal${detail ? ` (${detail})` : ""}.`,
    }, { status: 502 });
  }
  const urls = r.json?.data?.urls ?? {};
  const general = typeof urls.general === "string" ? urls.general : urls.general?.overview;
  const subLinks = Array.isArray(urls.subscriptions) ? urls.subscriptions[0] : null;
  return NextResponse.json({
    url: general ?? null,
    cancelUrl: subLinks?.cancel_subscription ?? null,
    updatePaymentUrl: subLinks?.update_subscription_payment_method ?? null,
  });
}
