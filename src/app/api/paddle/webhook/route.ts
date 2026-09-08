import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Paddle Billing webhook. Signature: paddle-signature = "ts=...;h1=..."
 *  where h1 = HMAC-SHA256("${ts}:${rawBody}", WEBHOOK_SECRET). Verified with
 *  timing-safe compare. Subscription state is the ONLY writer of `subscriptions`. */
function verify(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(";").map((kv) => kv.split("=") as [string, string])
  );
  if (!parts.ts || !parts.h1) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.ts}:${raw}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.h1));
  } catch { return false; }
}

/** Maps a Paddle price id to our plan tiers, or null if unrecognized.
 *  Pure lookup only - callers decide what "unrecognized" means for them
 *  (the subscription path falls back to the user's existing plan rather
 *  than guessing; the one-time transaction path just logs and ignores). */
function resolvePlan(priceId: string | null): "premium" | "pro" | null {
  const premiumPriceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PREMIUM || process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;
  const proPriceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO;
  if (priceId && proPriceId && priceId === proPriceId) return "pro";
  if (priceId && premiumPriceId && priceId === premiumPriceId) return "premium";
  return null;
}

async function findUserId(admin: any, data: any): Promise<string | null> {
  if (data?.custom_data?.user_id) return data.custom_data.user_id;
  // fallback: resolve by customer email via Paddle API (needs PADDLE_API_KEY)
  const apiKey = process.env.PADDLE_API_KEY;
  const customerId = data?.customer_id;
  if (apiKey && customerId) {
    const res = await fetch(`https://api.paddle.com/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const email = (await res.json())?.data?.email;
      if (email) {
        const { data: prof } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
        if (prof) return prof.id;
      }
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[paddle] PADDLE_WEBHOOK_SECRET is not set - every webhook delivery will be rejected.");
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }

  const raw = await req.text();
  const sigHeader = req.headers.get("paddle-signature");
  if (!verify(raw, sigHeader, secret)) {
    // If you're testing in Paddle Sandbox: sandbox and production each have
    // their OWN webhook destination and secret in the Paddle dashboard - a
    // secret copied from the wrong one will fail verification for every
    // single sandbox event, which looks exactly like "nothing happens".
    console.error(`[paddle] signature verification FAILED. header present=${!!sigHeader}. Check that PADDLE_WEBHOOK_SECRET matches the destination (sandbox vs live) Paddle is actually sending from.`);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(raw);
  const name: string = event?.event_name ?? "";
  const data = event?.data ?? {};
  // Log EVERY verified delivery, even ones we're about to ignore - if you
  // pay in sandbox and see nothing in these logs at all, Paddle isn't
  // reaching this endpoint (wrong webhook URL, app not publicly reachable,
  // or the notification destination is disabled) - that's a Paddle
  // dashboard config problem, not something in this code.
  console.log(`[paddle] received ${name} (id=${data?.id ?? "?"})`);

  const admin = createAdmin();

  if (name.startsWith("transaction.") && (name === "transaction.completed" || name === "transaction.paid")) {
    // Covers a one-time (non-recurring) price: Paddle never sends a single
    // subscription.* event for those, only transaction.* - if your Premium/
    // Pro price was ever created as "one-time" instead of "recurring" in
    // the Paddle dashboard, this is the only event you'll ever get for it.
    const userId = await findUserId(admin, data);
    if (!userId) {
      console.error("[paddle] transaction event but could not resolve user for", data?.id);
      return NextResponse.json({ ok: true, warning: "user not resolved" });
    }
    const priceId = data?.items?.[0]?.price?.id ?? null;
    const plan = resolvePlan(priceId);
    if (!plan) {
      console.error(`[paddle] transaction ${data?.id} has no recognized price id (${priceId}) - ignoring, nothing written.`);
      return NextResponse.json({ ok: true, warning: "unrecognized price" });
    }
    const { error } = await admin.from("subscriptions").upsert({
      user_id: userId,
      plan,
      status: "active",
      paddle_customer_id: data?.customer_id ?? null,
      price_id: priceId,
      current_period_end: null, // one-time purchase, not a recurring period
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) {
      console.error(`[paddle] subscriptions upsert FAILED (transaction path) for user ${userId}:`, error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    console.log(`[paddle] ${name} -> user ${userId} plan=${plan} (one-time)`);
    return NextResponse.json({ ok: true });
  }

  if (!name.startsWith("subscription.")) {
    return NextResponse.json({ ok: true, ignored: name }); // adjustments, customer.*, etc.
  }
  const userId = await findUserId(admin, data);
  if (!userId) {
    console.error("[paddle] could not resolve user for", data?.id);
    return NextResponse.json({ ok: true, warning: "user not resolved" });
  }

  const priceId = data?.items?.[0]?.price?.id ?? null;
  let plan: "free" | "premium" | "pro" = resolvePlan(priceId) ?? "free";
  if (priceId && !resolvePlan(priceId)) {
    // Unrecognized price id on an active subscription - this is a config
    // problem (a new/changed Paddle price that isn't in our env vars yet),
    // NOT proof the user should be downgraded. Defaulting to "free" here is
    // exactly the bug that made real, paid subscriptions never switch a user
    // over to premium/pro in the app: the row would land in the DB (so it's
    // visible from Supabase) but every getPlan() check would still read
    // "free". Keep whatever plan the user already had instead of overwriting
    // it with a guess, and log loudly so it gets noticed.
    const { data: existing } = await admin.from("subscriptions").select("plan").eq("user_id", userId).maybeSingle();
    plan = (existing?.plan === "pro" || existing?.plan === "premium") ? existing.plan : "premium";
    console.error(`[paddle] unrecognized price id ${priceId} for user ${userId} - check NEXT_PUBLIC_PADDLE_PRICE_ID_PREMIUM/_PRO env vars. Falling back to plan=${plan}.`);
  }
  const periodEnd = data?.current_billing_period?.ends_at ?? null;

  const { error: upsertError } = await admin.from("subscriptions").upsert({
    user_id: userId,
    plan,
    status: data?.status ?? "none",
    paddle_customer_id: data?.customer_id ?? null,
    paddle_subscription_id: data?.id ?? null,
    price_id: priceId,
    current_period_end: periodEnd,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (upsertError) {
    // This is the other half of "I see the payment in the database but not
    // in the app": if this upsert fails, Paddle still shows the payment as
    // successful and nothing here throws, but the app's plan check never
    // sees it. Surface it loudly instead of returning ok:true silently.
    console.error(`[paddle] subscriptions upsert FAILED for user ${userId}:`, upsertError);
    return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 });
  }

  console.log(`[paddle] ${name} -> user ${userId} plan=${plan} status=${data?.status} price=${priceId}`);
  return NextResponse.json({ ok: true });
}
