import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { getPlan } from "@/lib/limits";
import { paddleConfigured, paddleFetch, priceIdFor } from "@/lib/paddle";

export const dynamic = "force-dynamic";

/** GET: preview what switching would cost now. POST: switch.
 *  Existing subscribers are moved between Premium and Pro on their CURRENT
 *  subscription (prorated) - opening a fresh checkout would create a second,
 *  parallel subscription and double-bill them. */
async function load(target: unknown) {
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: "Please sign in again." }, { status: 401 }) };
  if (target !== "premium" && target !== "pro") return { error: NextResponse.json({ error: "Unknown plan." }, { status: 400 }) };
  if (!paddleConfigured()) return { error: NextResponse.json({ error: "Plan changes aren't configured yet (PADDLE_API_KEY missing)." }, { status: 501 }) };
  const priceId = priceIdFor(target);
  if (!priceId) return { error: NextResponse.json({ error: `The ${target} price isn't configured on the server.` }, { status: 501 }) };
  const sb = await createClient();
  const [plan, { data: sub }] = await Promise.all([
    getPlan(sb, user.id),
    sb.from("subscriptions").select("paddle_subscription_id, status").maybeSingle(),
  ]);
  if (plan === target) return { error: NextResponse.json({ error: "You're already on this plan." }, { status: 409 }) };
  if (!sub?.paddle_subscription_id || plan === "free") {
    // no live subscription - the client should open checkout instead
    return { error: NextResponse.json({ error: "no_subscription", checkout: true }, { status: 409 }) };
  }
  return { user, target: target as "premium" | "pro", priceId, subId: sub.paddle_subscription_id as string, plan };
}

const bodyFor = (priceId: string, upgrade: boolean) => ({
  items: [{ price_id: priceId, quantity: 1 }],
  // upgrades take effect and bill the difference now; downgrades credit the
  // unused time toward the next bill
  proration_billing_mode: upgrade ? "prorated_immediately" : "prorated_next_billing_period",
});

export async function GET(req: NextRequest) {
  const ctx = await load(req.nextUrl.searchParams.get("to"));
  if ("error" in ctx) return ctx.error;
  const upgrade = ctx.target === "pro";
  const r = await paddleFetch(`/subscriptions/${ctx.subId}/preview`, {
    method: "PATCH", body: JSON.stringify(bodyFor(ctx.priceId, upgrade)),
  });
  if (!r.ok) return NextResponse.json({ preview: null });
  const imm = r.json?.data?.immediate_transaction;
  const next = r.json?.data?.next_transaction;
  return NextResponse.json({
    preview: {
      upgrade,
      currency: r.json?.data?.currency_code ?? "USD",
      dueNow: imm?.details?.totals?.grand_total ?? null,
      nextAmount: next?.details?.totals?.grand_total ?? null,
      nextDate: next?.billing_period?.starts_at ?? r.json?.data?.next_billed_at ?? null,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ctx = await load(body.to);
  if ("error" in ctx) return ctx.error;
  const upgrade = ctx.target === "pro";
  const r = await paddleFetch(`/subscriptions/${ctx.subId}`, {
    method: "PATCH", body: JSON.stringify(bodyFor(ctx.priceId, upgrade)),
  });
  if (!r.ok) {
    const detail = r.json?.error?.detail ?? r.json?.error?.code ?? `HTTP ${r.status}`;
    return NextResponse.json({ error: `Paddle couldn't change the plan: ${detail}` }, { status: 502 });
  }
  // The webhook remains the source of truth, but write the new tier now so
  // the app reflects it instantly instead of after the webhook lands.
  const admin = createAdmin();
  await admin.from("subscriptions").update({
    plan: ctx.target, price_id: ctx.priceId, status: r.json?.data?.status ?? "active", updated_at: new Date().toISOString(),
  }).eq("user_id", ctx.user.id);
  return NextResponse.json({ ok: true, plan: ctx.target });
}
