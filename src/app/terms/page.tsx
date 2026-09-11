import type { Metadata } from "next";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Terms of Service - TimelyMemo",
};

const SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: "The service",
    paragraphs: [
      "TimelyMemo is a personal memory assistant. You submit notes in your own words; the service structures, stores and resurfaces them for you. You remain the sole owner of everything you submit.",
      "An account is required to store memories. You are responsible for keeping your credentials secure and for the content you submit.",
      "TimelyMemo is an AI-assisted memory and productivity tool. It is not a medical, legal, financial, or professional advisory service, and it is not an emergency service. Do not rely on it for emergency communication, medical or legal decisions, or any situation where a delayed, missed, or inaccurate reminder or response could cause serious harm.",
    ],
  },
  {
    title: "AI processing and accuracy",
    paragraphs: [
      "When you use AI features, your submitted content may be processed by our AI service provider to provide the requested functionality.",
      "Concretely: text you submit may be sent to Google's Gemini service for classification (type, dates, people, amounts), semantic search, and question answering over your own memories. Embeddings - numeric representations of your text - are stored so related memories can be found later.",
      "Your submitted content is not used to train AI models.",
      "AI-generated structure, answers, insights, and agent output may be incorrect, incomplete, or misleading. They are suggestions, not verified facts - your original submitted text is always the source of truth and is never altered by AI. You are responsible for independently verifying anything important (dates, amounts, factual claims, purchase or research recommendations) before relying on it.",
    ],
  },
  {
    title: "Acceptable use",
    paragraphs: [
      "You must not use the service for any unlawful purpose, or to store, generate, or act on content intended to facilitate violence, self-harm, abuse, harassment, or other harmful activity toward yourself or others.",
      "The service includes automated safeguards intended to prevent AI features (tasks, reminders, and agents) from acting on content describing genuine harmful intent; these safeguards are heuristic and may not catch every case, and are not a substitute for appropriate professional help or emergency services if you or someone else is at risk.",
      "Don't use the service to process other people's personal data without a lawful basis to do so. Automated abuse of the API endpoints may be rate-limited or blocked.",
      "We may suspend or terminate accounts that violate these terms, attempt to circumvent usage limits or security controls, or endanger the service or other users.",
    ],
  },
  {
    title: "Your data and account",
    paragraphs: [
      "You can export everything you've stored as JSON at any time from Settings, and delete your account and all associated data from Settings. Deletion removes your memories, derived structure, insights, notifications and profile from the database.",
      "You can stop using the service at any time; deletion is self-service.",
    ],
  },
  {
    title: "Availability and reminders",
    paragraphs: [
      "We aim for reliable service but do not guarantee uninterrupted availability, error-free operation, perfectly accurate AI output, or that every reminder or notification will be delivered on time or at all - delivery depends on third-party push/notification infrastructure, your device and browser settings, and network conditions outside our control.",
    ],
  },
  {
    title: "Third-party integrations",
    paragraphs: [
      "Optional integrations (for example Google Calendar or Gmail context for agents, or Paddle for billing) are provided by third parties under their own terms and privacy practices, which we don't control. We treat content imported from these integrations as reference data for producing your results, not as instructions - but we can't guarantee the accuracy or availability of third-party services themselves.",
    ],
  },
  {
    title: "Limitation of liability",
    paragraphs: [
      "To the maximum extent permitted by applicable law, TimelyMemo and its operators are not liable for indirect, incidental, special, or consequential damages arising from your use of the service, including but not limited to lost data, missed reminders, or reliance on AI-generated content. Nothing in these terms excludes liability that cannot be excluded under applicable law.",
      "[Placeholder: jurisdiction-specific liability caps, consumer-protection carve-outs, and governing-law/venue language should be reviewed and finalized by a qualified lawyer for each market TimelyMemo operates in before this is treated as final legal language.]",
    ],
  },
  {
    title: "No warranty; changes",
    paragraphs: [
      "Except as expressly stated, the service is provided \"as is\" and \"as available,\" without warranties of any kind, to the maximum extent permitted by applicable law.",
      "These terms may change; material changes will be reflected on this page. Continued use of the service after a change constitutes acceptance of the updated terms.",
    ],
  },
];

export default async function TermsPage() {
  const user = await getUser();
  return (
    <div className="min-h-dvh flex flex-col">
      <PublicHeader loggedIn={!!user} />
      <main className="flex-1 max-w-2xl mx-auto w-full px-6 md:px-10 py-14">
        <h1 className="font-display text-4xl">Terms of Service</h1>
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
