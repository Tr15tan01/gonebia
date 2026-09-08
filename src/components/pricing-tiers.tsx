import Link from "next/link";
import { UpgradeButton } from "@/components/upgrade-button";

export interface TierCard {
  id: "free" | "premium" | "pro";
  name: string;
  tagline: string;
  price: string;
  cadence: string;
  recommended?: boolean;
  accentVar: string; // CSS var name, e.g. "--premium"
  bullets: string[];
}

export const TIER_CARDS: TierCard[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Try it",
    price: "$0",
    cadence: "",
    accentVar: "--ink-2",
    bullets: [
      "100 memories / month",
      "Semantic search + Timeline",
      "20 AI questions / month",
      "20 active reminders",
      "Connect the Dots - 3/mo",
      "What am I forgetting - 1/week",
      "3 Discover analyses / month",
      "Basic Life Radar",
      "Export and delete anytime",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "For people who want an AI external brain",
    price: "$7.99",
    cadence: "/mo",
    recommended: true,
    accentVar: "--premium",
    bullets: [
      "1,000 memories / month",
      "Memory Graph unlocked",
      "500 AI questions / month",
      "Unlimited reminders",
      "Unlimited Connect the Dots + What am I forgetting",
      "30 Discover analyses / month",
      "Daily briefing + weekly reflection",
      "Research Agent + Problem Solver",
      "Google Calendar + Gmail context",
      "More color choices for your memories",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For people who want AI agents working for them",
    price: "$19.99",
    cadence: "/mo",
    accentVar: "--pro",
    bullets: [
      "5,000 memories / month",
      "1,000 AI questions / month",
      "Unlimited Discover analyses",
      "Advanced Research + Buying + Problem-Solving Agents",
      "200 agent runs / month",
      "Advanced price tracking",
      "Long-running cases",
      "Unlimited watches",
      "Advanced Life Radar + cross-source intelligence",
    ],
  },
];

/** 3-card summary. Used on the landing page teaser and at the top of the
 *  dedicated /pricing page. Premium is visually the recommended default -
 *  not Pro - per product direction: most people want the "AI external
 *  brain", Pro is the power-user upsell for people who want agents running
 *  on their behalf. */
export function PricingCards({ showBenefitsLinks = false }: { showBenefitsLinks?: boolean }) {
  return (
    <div className="grid md:grid-cols-3 gap-4 mt-8">
      {TIER_CARDS.map((tier) => (
        <div
          key={tier.id}
          className={`card p-6 flex flex-col ${tier.recommended ? "soft-shadow md:-my-2 md:py-8" : ""}`}
          style={tier.recommended ? { borderColor: "color-mix(in srgb, var(--premium) 50%, transparent)", borderWidth: 2 } : undefined}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-xl">{tier.name}</p>
            {tier.recommended && (
              <span className="chip font-semibold" style={{ color: "var(--premium)", borderColor: "color-mix(in srgb, var(--premium) 50%, transparent)" }}>
                ⭐ Recommended
              </span>
            )}
          </div>
          <p className="text-sm text-ink-2 mt-1 leading-snug">{tier.tagline}</p>
          <p className="font-display text-4xl mt-3">
            {tier.price}<span className="text-base text-ink-2">{tier.cadence}</span>
          </p>
          <ul className="mt-5 space-y-2 text-sm flex-1">
            {tier.bullets.map((b) => (
              <li key={b} className="flex gap-2">
                <span aria-hidden style={{ color: `var(${tier.accentVar})` }}>✓</span>
                <span className={tier.id === "free" ? "text-ink-2" : ""}>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5">
            {tier.id === "free" ? (
              <Link href="/login" className="btn-ghost w-full text-center block">Try it free</Link>
            ) : (
              <UpgradeButton className="w-full" tier={tier.id as "premium" | "pro"} showBenefitsLink={showBenefitsLinks} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

interface FeatureRow { label: string; free: string; premium: string; pro: string }

const FEATURE_ROWS: FeatureRow[] = [
  { label: "Memories", free: "100/mo", premium: "1,000/mo", pro: "5,000/mo" },
  { label: "Semantic search", free: "✓", premium: "✓", pro: "✓" },
  { label: "Timeline", free: "✓", premium: "✓", pro: "✓" },
  { label: "Memory Graph", free: "—", premium: "✓", pro: "✓" },
  { label: "AI questions", free: "20", premium: "500", pro: "1,000" },
  { label: "Reminders", free: "20", premium: "Unlimited", pro: "Unlimited" },
  { label: "Connect the Dots", free: "3/mo", premium: "Unlimited", pro: "Unlimited" },
  { label: "What am I forgetting?", free: "1/week", premium: "Unlimited", pro: "Unlimited" },
  { label: "Discover", free: "3/mo", premium: "30/mo", pro: "Unlimited" },
  { label: "Daily briefing", free: "—", premium: "✓", pro: "✓" },
  { label: "Weekly reflection", free: "—", premium: "✓", pro: "✓" },
  { label: "Research Agent", free: "Limited", premium: "✓", pro: "Advanced" },
  { label: "Buying Agent", free: "—", premium: "—", pro: "Advanced" },
  { label: "Problem Solver", free: "Limited", premium: "✓", pro: "Advanced" },
  { label: "Agent runs", free: "2", premium: "50", pro: "200" },
  { label: "Price tracking", free: "—", premium: "✓", pro: "Advanced" },
  { label: "Google Calendar", free: "—", premium: "✓", pro: "✓" },
  { label: "Gmail context", free: "—", premium: "✓", pro: "✓" },
  { label: "Long-running cases", free: "—", premium: "—", pro: "✓" },
  { label: "Watches", free: "—", premium: "Limited", pro: "Unlimited" },
  { label: "Life Radar", free: "Basic", premium: "✓", pro: "Advanced" },
  { label: "Cross-source intelligence", free: "—", premium: "✓", pro: "Advanced" },
  { label: "Color choices for memories", free: "1", premium: "Full palette", pro: "Full palette" },
  { label: "Export / delete", free: "✓", premium: "✓", pro: "✓" },
];

/** Full row-by-row comparison table - the dedicated /pricing page only. */
export function PricingTable() {
  return (
    <div className="overflow-x-auto mt-4">
      <table className="w-full text-sm border-collapse min-w-[560px]">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="py-2.5 pr-3 font-medium text-ink-2">Feature</th>
            <th className="py-2.5 px-3 font-medium">Free</th>
            <th className="py-2.5 px-3 font-medium" style={{ color: "var(--premium)" }}>Premium ⭐</th>
            <th className="py-2.5 px-3 font-medium" style={{ color: "var(--pro)" }}>Pro</th>
          </tr>
        </thead>
        <tbody>
          {FEATURE_ROWS.map((row) => (
            <tr key={row.label} className="border-b border-line/60">
              <td className="py-2 pr-3 text-ink-2">{row.label}</td>
              <td className="py-2 px-3">{row.free}</td>
              <td className="py-2 px-3">{row.premium}</td>
              <td className="py-2 px-3">{row.pro}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
