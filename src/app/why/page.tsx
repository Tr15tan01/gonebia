import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";

export const metadata: Metadata = {
  title: "Why an external memory - TimelyMemo",
  description: "Three short essays on why keeping an external memory makes you calmer, clearer and better at follow-through.",
};

const ARTICLES = [
  {
    slug: "brain-for-ideas",
    title: "Your brain is for having ideas, not holding them",
    paragraphs: [
      "There's a familiar feeling: you remember that something needs doing, but not quite what, or for whom, or by when. So it loops. Psychologists have found that unfinished tasks tend to stay mentally active - humming in the background and consuming attention whether you want them to or not.",
      "An external memory takes the loop out of your head. 'My wife asked me to fix the cabinet' becomes a stored, dated, attributable task instead of a vague nagging obligation. Nothing is lost by writing it down - the opposite: it stops being a fog and becomes a thing you can act on, or deliberately schedule.",
      "The practical test is simple. If you can close your notes app and feel calmer rather than anxious, it's working. A memory you trust is the only kind that lets you stop rehearsing it.",
    ],
  },
  {
    slug: "remembering-vs-noticing",
    title: "Remembering is not the same as noticing",
    paragraphs: [
      "Most tools stop at storage. Searchable archives are genuinely useful - but they only answer questions you think to ask. The computer you bought is findable; the fact that you've now mentioned wanting to exercise three times this year is not, unless something connects the dots for you.",
      "That's the difference between remembering and noticing. Noticing is pattern work: this intention keeps returning, this purchase repeats every month, this person recommended two books you loved. It's what a good friend does that a filing cabinet can't.",
      "TimelyMemo is built around noticing: similar memories are linked, recurring intentions are surfaced without judgment, and reminders fire when they matter - not when you happen to look. Storage is the floor; noticing is the product.",
    ],
  },
  {
    slug: "writing-changes-thinking",
    title: "Writing things down changes how you think",
    paragraphs: [
      "A thought in your head can only be replayed. A thought written down becomes an object: it can be compared with what you believed last month, connected to a book you finished, or revisited when the decision it supported is questioned a year later.",
      "This is why decision memory matters. 'I chose PostgreSQL because I needed relational data' is trivial today and precious in a year, when you're asked why - or when you're about to undo it for reasons you've already considered and rejected.",
      "There's also a quieter benefit: honesty. An external memory shows you your own patterns without flattery - the intentions you repeat and never start, the projects that genuinely progressed. Presented gently, that's not an indictment; it's the most useful mirror you can own.",
    ],
  },
];

export default function WhyPage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <PublicHeader />
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 md:px-10 py-14 space-y-14">
        <header>
          <h1 className="font-display text-4xl">Why an external memory</h1>
          <p className="text-ink-2 mt-3 text-lg leading-relaxed">
            Three short essays on the case for keeping your life's details outside your head -
            and letting a system notice what you'd otherwise lose.
          </p>
        </header>

        {ARTICLES.map((a) => (
          <article key={a.slug} id={a.slug} className="scroll-mt-20 space-y-4">
            <h2 className="font-display text-2xl md:text-3xl">{a.title}</h2>
            {a.paragraphs.map((p, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-ink-2">{p}</p>
            ))}
          </article>
        ))}

        <div className="card p-6 soft-shadow" style={{ background: "var(--ember-soft)", borderColor: "color-mix(in srgb, var(--ember) 30%, transparent)" }}>
          <p className="font-display text-xl">Try it with one sentence</p>
          <p className="text-sm text-ink-2 mt-2">
            Tell it something you'd otherwise keep in your head. See what comes back.
          </p>
          <Link href="/login" className="btn-primary mt-4">Start remembering</Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
