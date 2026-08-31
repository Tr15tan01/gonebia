"use client";
import { useState } from "react";
import { useToast } from "@/components/ui";

/** Upgrade CTA. If Paddle is configured (part 34) this opens real checkout;
 *  until then it says so honestly instead of faking a purchase. */
export function UpgradeButton({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const configured = !!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN && !!process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;

  return (
    <button
      onClick={() => {
        if (!configured) { toast("Billing isn't configured yet - add your Paddle keys to enable checkout."); return; }
        setBusy(true);
        window.dispatchEvent(new CustomEvent("timelymemo:checkout"));
        setTimeout(() => setBusy(false), 2000);
      }}
      disabled={busy}
      className={`btn-primary ${className}`}
    >
      {busy ? "Opening checkout..." : "Upgrade to Pro - $7.99/mo"}
    </button>
  );
}
