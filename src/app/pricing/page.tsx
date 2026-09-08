import type { Metadata } from "next";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { getUser } from "@/lib/supabase/server";
import { PricingCards, PricingTable } from "@/components/pricing-tiers";

export const metadata: Metadata = {
  title: "Pricing - TimelyMemo",
  description: "Start free. Upgrade to Premium for an AI external brain, or Pro for AI agents working for you. $7.99 or $19.99/month, cancel anytime.",
};

const FAQ = [
  { q: "What counts as an AI question?", a: "Every Ask-my-memory question you send. Discover analyses and agent runs have their own monthly budgets, shown on your Settings page." },
  { q: "Do unused questions roll over?", a: "No - both daily and monthly counters reset. The Settings page shows exactly where you stand at any time." },
  { q: "What happens if I hit a limit?", a: "Features keep working for reading and editing everything you've stored - only new AI work pauses, with a clear message and the upgrade option. Your memory is never held hostage." },
  { q: "Can I cancel anytime?", a: "Yes - from Settings, 'Manage billing' opens the Paddle customer portal. You keep your plan until the end of the paid period, then drop to Free with everything intact." },
  { q: "What happens to my data if I downgrade?", a: "Nothing is deleted. You keep all memories, books, people and insights - Free-plan monthly caps just apply to new captures and new AI work." },
  { q: "Premium or Pro - which one is for me?", a: "Premium is the pick for most people: it's your AI external brain - unlimited reminders, unlimited Connect the Dots, daily briefings, and the memory graph. Pro is for people who want AI agents actively working on their behalf - the Buying Agent, long-running cases, and advanced versions of every agent." },
];

export default async function PricingPage() {
  const user = await getUser();
  return (
    <div className="min-h-dvh flex flex-col">
      <PublicHeader loggedIn={!!user} />
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 md:px-10 py-14">
        <h1 className="font-display text-4xl">Simple pricing</h1>
        <p className="text-ink-2 mt-3 text-lg leading-relaxed">
          Start free. Upgrade when your memory becomes essential. Cancel anytime.
        </p>

        <PricingCards />
        <p className="text-xs text-ink-2 mt-4 text-center">Secure payments by Paddle. Prices in USD.</p>

        <section className="mt-16">
          <h2 className="font-display text-2xl">Compare every feature</h2>
          <PricingTable />
        </section>

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
      </main>
      <PublicFooter />
    </div>
  );
}
