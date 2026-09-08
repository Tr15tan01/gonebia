"use client";
import Script from "next/script";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

declare global { interface Window { Paddle?: any } }

export type PaddleTier = "premium" | "pro";

/** Listens for "timelymemo:checkout" (dispatched by UpgradeButton with a
 *  `{ tier }` detail), opens the Paddle overlay with the user's identity
 *  attached. Renders nothing when billing isn't configured - no fake checkout.
 *
 *  IMPORTANT: Paddle's webhook is what actually writes `subscriptions.plan`
 *  in the DB (see /api/paddle/webhook) - it can land a second or two after
 *  the checkout overlay closes. Previously nothing here ever reacted to a
 *  completed checkout, so the DB row could be perfectly correct (visible in
 *  Supabase) while the app kept showing "Free" until the user happened to
 *  hit a full page reload some other way. eventCallback + a short poll of
 *  /api/account/plan closes that gap. */
export function PaddleBridge() {
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const premiumPriceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PREMIUM || process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;
  const proPriceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO;
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const startingPlanRef = useRef<string | null>(null);

  async function waitForPlanChangeThenRefresh() {
    const before = startingPlanRef.current;
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const res = await fetch("/api/account/plan", { cache: "no-store" });
        if (res.ok) {
          const { plan } = await res.json();
          if (plan && plan !== before && plan !== "free") {
            try { await updateSession?.(); } catch {}
            router.refresh();
            return;
          }
        }
      } catch {}
    }
    // Give up waiting but still refresh once - worst case the user sees the
    // same state and can retry; best case the webhook landed just after our
    // last poll and the refresh picks it up anyway.
    router.refresh();
  }

  useEffect(() => {
    if (!token) return;
    const handler = (e: Event) => {
      const tier: PaddleTier = (e as CustomEvent)?.detail?.tier === "pro" ? "pro" : "premium";
      const priceId = tier === "pro" ? proPriceId : premiumPriceId;
      if (!priceId) {
        alert("That plan isn't configured yet - add its Paddle price id to enable checkout.");
        return;
      }
      if (!window.Paddle) { alert("Billing is still loading - try again in a second."); return; }
      const customer = session?.user?.email ? { email: session.user.email } : {};
      const custom = (session?.user as any)?.id ? { user_id: (session!.user as any).id } : {};
      startingPlanRef.current = ((session?.user as any)?.plan as string) ?? "free";
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer,
        custom_data: custom,
      });
    };
    window.addEventListener("timelymemo:checkout", handler);
    return () => window.removeEventListener("timelymemo:checkout", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, premiumPriceId, proPriceId, session]);

  if (!token) return null;
  return (
    <Script
      src="https://cdn.paddle.com/paddle/v2/paddle.js"
      onLoad={() => {
        window.Paddle?.Environment.set(
          process.env.NEXT_PUBLIC_PADDLE_ENV === "sandbox" ? "sandbox" : "production"
        );
        window.Paddle?.Initialize({
          token,
          eventCallback: (event: any) => {
            const name = event?.name ?? event?.event_name;
            if (name === "checkout.completed") {
              // Don't block on this - let Paddle's own thank-you UI show,
              // and pick up the new plan in the background.
              waitForPlanChangeThenRefresh();
            }
          },
        });
      }}
    />
  );
}
