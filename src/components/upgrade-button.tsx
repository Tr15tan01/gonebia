"use client";
import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui";
import posthog from "posthog-js";
import type { PaddleTier } from "@/components/paddle-bridge";

const TIER_INFO: Record<PaddleTier, { label: string; price: string }> = {
  premium: { label: "Premium", price: "$7.99/mo" },
  pro: { label: "Pro", price: "$19.99/mo" },
};

/** Upgrade CTA. If Paddle is configured (part 34) this opens real checkout;
 *  until then it says so honestly instead of faking a purchase.
 *  `tier` picks which plan's checkout to open - defaults to Premium, the
 *  recommended plan. Pass `showBenefitsLink` to also render a small
 *  secondary link to the full pricing/benefits page next to the button -
 *  useful anywhere the button appears without its own feature list nearby. */
export function UpgradeButton({
  className = "",
  tier = "premium",
  label,
  showBenefitsLink = false,
}: {
  className?: string;
  tier?: PaddleTier;
  label?: string;
  showBenefitsLink?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const configured = !!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN && (
    tier === "pro"
      ? !!process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO
      : !!(process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PREMIUM || process.env.NEXT_PUBLIC_PADDLE_PRICE_ID)
  );
  const info = TIER_INFO[tier];

  return (
    <div className="flex flex-col items-stretch gap-2">
      <button
        onClick={() => {
          posthog.capture("upgrade_clicked", { billing_configured: configured, tier });
          if (!configured) { toast("Billing isn't configured yet - add your Paddle keys to enable checkout."); return; }
          setBusy(true);
          window.dispatchEvent(new CustomEvent("timelymemo:checkout", { detail: { tier } }));
          setTimeout(() => setBusy(false), 2000);
        }}
        disabled={busy}
        className={`btn-primary ${className}`}
      >
        {busy ? "Opening checkout..." : label ?? `Upgrade to ${info.label} - ${info.price}`}
      </button>
      {showBenefitsLink && (
        <Link
          href="/pricing"
          onClick={() => posthog.capture("upgrade_benefits_clicked", { tier })}
          className="text-center text-xs text-ink-2 hover:text-ink underline underline-offset-2"
        >
          See what {info.label} includes
        </Link>
      )}
    </div>
  );
}
