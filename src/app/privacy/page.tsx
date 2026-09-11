import type { Metadata } from "next";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Privacy Policy - TimelyMemo",
};

const SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: "What we store",
    paragraphs: [
      "The exact text you submit (never altered by AI), AI-generated structure about it (type, dates, people, amounts), numeric embeddings for semantic search, derived records (tasks, books, purchases, decisions), insights computed from your own data, and account basics (email, timezone, preferences).",
    ],
  },
  {
    title: "Who can see your data",
    paragraphs: [
      "Only you, by default. Every database query the application makes for your data is automatically scoped to your account by the application's data-access layer, and reviewed application code is what enforces that boundary end to end - not a database setting alone.",
      "A small number of designated administrators can access limited account information - email, plan/subscription status, usage counts, and aggregate AI-cost figures - for support, billing, and abuse-prevention purposes. Administrators cannot read the text of your memories through the admin tools, and every administrative action is logged.",
      "Background jobs (reminders, weekly digests, price-tracking) operate on your data solely to provide those features to you and do not expose it elsewhere.",
    ],
  },
  {
    title: "Payments",
    paragraphs: [
      "Subscription payments are processed by Paddle, our merchant of record. We do not receive or store your full card number - Paddle handles payment collection and provides us only your subscription status, plan, and billing dates.",
    ],
  },
  {
    title: "AI providers",
    paragraphs: [
      "When you use AI features, your submitted content may be processed by our AI service provider to provide the requested functionality.",
      "This means: text you submit (or short summaries needed for structure) is sent to Google's Gemini API for classification, embeddings, and answering your questions over your own memories. Your data is not used to train models. Database hosting and authentication are provided by Supabase.",
    ],
  },
  {
    title: "Notifications",
    paragraphs: [
      "If you enable notifications, reminder titles and text are used to show alerts. Notification permission is managed per browser/device and can be turned off in Settings at any time.",
    ],
  },
  {
    title: "Your rights",
    paragraphs: [
      "Export: Settings -> 'Download all my data' produces a complete JSON copy of everything stored about you.",
      "Deletion: Settings -> 'Delete account & all data' removes your rows from every table (memories, metadata, embeddings, derived records, insights, notifications, preferences, profile) and then removes your account. The app shows a summary of exactly what was deleted.",
      "Cookies/local storage: used only for your session, theme and UI preferences - no advertising or tracking cookies exist in this app.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      "Questions about this policy: support@timelymemo.app",
    ],
  },
];

export default async function PrivacyPage() {
  const user = await getUser();
  return (
    <div className="min-h-dvh flex flex-col">
      <PublicHeader loggedIn={!!user} />
      <main className="flex-1 max-w-2xl mx-auto w-full px-6 md:px-10 py-14">
        <h1 className="font-display text-4xl">Privacy Policy</h1>
        <p className="text-xs text-ink-2 mt-2">Last updated: September 2026</p>
        <div className="mt-10 space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="font-display text-2xl">{s.title}</h2>
              {s.paragraphs.map((p, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-ink-2 mt-3">{p}</p>
              ))}
            </section>
          ))}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
