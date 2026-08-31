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
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 500 });

  const raw = await req.text();
  if (!verify(raw, req.headers.get("paddle-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(raw);
  const name: string = event?.event_name ?? "";
  const data = event?.data ?? {};

  if (!name.startsWith("subscription.")) {
    return NextResponse.json({ ok: true, ignored: name }); // transactions, adjustments, etc.
  }

  const admin = createAdmin();
  const userId = await findUserId(admin, data);
  if (!userId) {
    console.error("[paddle] could not resolve user for", data?.id);
    return NextResponse.json({ ok: true, warning: "user not resolved" });
  }

  const priceId = data?.items?.[0]?.price?.id ?? null;
  const plan = priceId && priceId === process.env.NEXT_PUBLIC_PADDLE_PRICE_ID ? "pro" : "free";
  const periodEnd = data?.current_billing_period?.ends_at ?? null;

  await admin.from("subscriptions").upsert({
    user_id: userId,
    plan,
    status: data?.status ?? "none",
    paddle_customer_id: data?.customer_id ?? null,
    paddle_subscription_id: data?.id ?? null,
    price_id: priceId,
    current_period_end: periodEnd,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  console.log(`[paddle] ${name} -> user ${userId} plan=${plan} status=${data?.status}`);
  return NextResponse.json({ ok: true });
}
