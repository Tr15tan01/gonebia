import type { Metadata } from "next";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";

export const metadata: Metadata = {
  title: "Terms of Service - TimelyMemo",
};

const SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: "The service",
    paragraphs: [
      "TimelyMemo is a personal memory assistant. You submit notes in your own words; the service structures, stores and resurfaces them for you. You remain the sole owner of everything you submit.",
      "An account is required to store memories. You are responsible for keeping your credentials secure and for the content you submit.",
    ],
  },
  {
    title: "AI processing",
    paragraphs: [
      "When you use AI features, your submitted content may be processed by our AI service provider to provide the requested functionality.",
      "Concretely: text you submit may be sent to Google's Gemini service for classification (type, dates, people, amounts), semantic search, and question answering over your own memories. Embeddings - numeric representations of your text - are stored so related memories can be found later.",
      "Your submitted content is not used to train AI models.",
    ],
  },
  {
    title: "Acceptable use",
    paragraphs: [
      "Don't use the service to store unlawful content or to process other people's data without a lawful basis. Automated abuse of the API endpoints may be rate-limited or blocked.",
    ],
  },
  {
    title: "Your data and account",
    paragraphs: [
      "You can export everything you've stored as JSON at any time from Settings, and delete your account and all associated data from Settings. Deletion removes your memories, derived structure, insights, notifications and profile from the database.",
      "We may suspend accounts that endanger the service or other users. You can stop using the service at any time; deletion is self-service.",
    ],
  },
  {
    title: "No warranty; changes",
    paragraphs: [
      "The service is provided as-is. AI-generated structure and insights are suggestions, not facts - your original text is always the source of truth and is never altered by AI.",
      "These terms may change; material changes will be reflected on this page.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <PublicHeader />
      <main className="flex-1 max-w-2xl mx-auto w-full px-6 md:px-10 py-14">
        <h1 className="font-display text-4xl">Terms of Service</h1>
        <p className="text-xs text-ink-2 mt-2">Last updated: February 2026</p>
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
