import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { UpgradeButton } from "@/components/upgrade-button";

export const metadata: Metadata = {
  title: "Pricing - TimelyMemo",
  description: "Start free. Upgrade when your memory becomes essential. $7.99/month, cancel anytime.",
};

const FAQ = [
  { q: "What counts as an AI question?", a: "Every Ask-my-memory question you send. Discover analyses and agent runs have their own monthly budgets, shown on your Settings page." },
  { q: "Do unused questions roll over?", a: "No - both daily and monthly counters reset. The Settings page shows exactly where you stand at any time." },
  { q: "What happens if I hit a limit?", a: "Features keep working for reading and editing everything you've stored - only new AI work pauses, with a clear message and the upgrade option. Your memory is never held hostage." },
  { q: "Can I cancel anytime?", a: "Yes - from Settings, 'Manage billing' opens the Paddle customer portal. You keep Pro until the end of the paid period, then drop to Free with everything intact." },
  { q: "What happens to my data if I downgrade?", a: "Nothing is deleted. You keep all memories, books, people and insights - Free-plan monthly caps just apply to new captures and new AI work." },
];

export default function PricingPage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 md:px-10 py-14">
        <h1 className="font-display text-4xl">Simple pricing</h1>
        <p className="text-ink-2 mt-3 text-lg leading-relaxed">
          Start free. Upgrade when your memory becomes essential. Cancel anytime.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mt-10">
          <div className="card p-6">
            <p className="font-display text-xl">Free</p>
            <p className="font-display text-4xl mt-2">$0</p>
            <ul className="mt-5 space-y-2 text-sm text-ink-2">
              <li>100 text memories / month</li>
              <li>Basic search and timeline</li>
              <li>20 AI questions / month (max 10/day)</li>
              <li>20 active reminders</li>
              <li>Connect the Dots - 3/month</li>
              <li>What am I forgetting - 1/week</li>
              <li>3 Discover analyses / month</li>
              <li>2 agent runs / month</li>
              <li>Export and delete anytime</li>
            </ul>
          </div>
          <div className="card p-6 soft-shadow" style={{ borderColor: "color-mix(in srgb, var(--ember) 45%, transparent)" }}>
            <div className="flex items-center justify-between">
              <p className="font-display text-xl">Pro</p>
              <span className="chip !text-ember !border-ember/50 font-semibold">Most popular</span>
            </div>
            <p className="font-display text-4xl mt-2">$7.99<span className="text-base text-ink-2">/mo</span></p>
            <ul className="mt-5 space-y-2 text-sm">
              <li>1,000 memories / month</li>
              <li>Semantic search + memory graph</li>
              <li>500 AI questions / month</li>
              <li>Unlimited reminders</li>
              <li>All insights: Dots, Intentions, Patterns</li>
              <li>Daily briefing + weekly reflection</li>
              <li>200 Discover analyses / month</li>
              <li>50 agent runs / month + price tracking</li>
              <li>Google Calendar + Gmail context for agents</li>
            </ul>
            <UpgradeButton className="mt-5 w-full" />
            <p className="text-xs text-ink-2 mt-3 text-center">Secure payments by Paddle. Prices in USD.</p>
          </div>
        </div>

        <section className="mt-14">
          <h2 className="font-display text-2xl">Questions</h2>
          <div className="space-y-3 mt-5">
            {FAQ.map((f) => (
              <div key={f.q} className="card p-4">
                <p className="font-medium text-sm">{f.q}</p>
                <p className="text-sm text-ink-2 mt-1.5 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="text-center text-sm text-ink-2 mt-12">
          Not sure yet? <Link href="/why" className="text-ember hover:underline">Read why an external memory works</Link>.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
