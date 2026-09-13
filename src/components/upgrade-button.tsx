"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
  const router = useRouter();
  const { data: session, status } = useSession();
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
          posthog.capture("upgrade_clicked", { billing_configured: configured, tier, logged_in: status === "authenticated" });
          if (status !== "authenticated") {
            // No account to attribute payment to - Paddle would still take
            // real money, but the webhook has no user_id to credit it to
            // (see paddle-bridge.tsx's customData), so the account would
            // never actually switch plans. Send them to log in first,
            // then straight back here to finish upgrading.
            router.push(`/login?next=${encodeURIComponent("/pricing")}`);
            return;
          }
          if (!configured) { toast("Billing isn't configured yet - add your Paddle keys to enable checkout."); return; }
          setBusy(true);
          window.dispatchEvent(new CustomEvent("timelymemo:checkout", { detail: { tier } }));
          setTimeout(() => setBusy(false), 2000);
        }}
        disabled={busy || status === "loading"}
        className={`btn-primary ${className}`}
      >
        {busy ? "Opening checkout..." : status === "authenticated" ? (label ?? `Upgrade to ${info.label} - ${info.price}`) : "Log in to upgrade"}
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
