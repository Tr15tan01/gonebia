"use client";
import Script from "next/script";
import { useEffect } from "react";
import { useSession } from "next-auth/react";

declare global { interface Window { Paddle?: any } }

/** Listens for "timelymemo:checkout" (dispatched by UpgradeButton), opens the
 *  Paddle overlay with the user's identity attached. Renders nothing when
 *  billing isn't configured - no fake checkout. */
export function PaddleBridge() {
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const priceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;
  const { data: session } = useSession();

  useEffect(() => {
    if (!token || !priceId) return;
    const handler = () => {
      if (!window.Paddle) { alert("Billing is still loading - try again in a second."); return; }
      const customer = session?.user?.email ? { email: session.user.email } : {};
      const custom = (session?.user as any)?.id ? { user_id: (session!.user as any).id } : {};
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer,
        custom_data: custom,
      });
    };
    window.addEventListener("timelymemo:checkout", handler);
    return () => window.removeEventListener("timelymemo:checkout", handler);
  }, [token, priceId, session]);

  if (!token) return null;
  return (
    <Script
      src="https://cdn.paddle.com/paddle/v2/paddle.js"
      onLoad={() => {
        window.Paddle?.Environment.set(
          process.env.NEXT_PUBLIC_PADDLE_ENV === "sandbox" ? "sandbox" : "production"
        );
        window.Paddle?.Initialize({ token });
      }}
    />
  );
}
