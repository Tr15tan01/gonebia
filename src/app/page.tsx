import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { LandingVisual } from "@/components/landing-visual";
import { sortedPosts } from "@/lib/blog";

const EXAMPLES = [
  { text: "I bought a computer from Alta for 2300 GEL.", result: "Filed as a purchase - store, amount and date extracted. Ask 'where did I buy my computer?' months later.", chip: "chip-c-buy", type: "purchase" },
  { text: "My wife asked me to fix the kitchen cabinet.", result: "Becomes a task, linked to your wife - and resurfaces before the weekend.", chip: "chip-c-task", type: "task" },
  { text: "I finished reading Atomic Habits by James Clear.", result: "Your book shelf updates itself - author, status, and the memory behind it.", chip: "chip-c-book", type: "book" },
  { text: "I decided to use PostgreSQL because I need relational data.", result: "Saved as a decision with its reason - retrievable the day you ask 'why did I choose this?'", chip: "chip-c-decision", type: "decision" },
  { text: "Remind me to check the oven in 30 minutes.", result: "A precise reminder - a notification and a red due-now card, exactly on time.", chip: "chip-c-ask", type: "reminder" },
  { text: "I should start exercising regularly.", result: "Matched with what you said in January and March: a recurring intention, honestly surfaced.", chip: "chip-c-goal", type: "goal" },
];

const WHY_TEASERS = [
  {
    slug: "brain-for-ideas",
    title: "Your brain is for having ideas, not holding them",
    short: "Every open loop you try to remember occupies attention. Writing it down isn't forgetting - it's freeing working memory for actual thinking.",
  },
  {
    slug: "remembering-vs-noticing",
    title: "Remembering is not the same as noticing",
    short: "Storage is easy; surfacing is the hard part. A memory that speaks at the right moment beats one that's merely searchable.",
  },
  {
    slug: "writing-changes-thinking",
    title: "Writing things down changes how you think",
    short: "Captured thoughts become objects you can connect, question and revisit - and unfinished tasks finally stop humming in the background.",
  },
];

export default async function Landing() {
  const user = await getUser();
  const cta = user ? "/dashboard" : "/login";
  const latest = sortedPosts().slice(0, 2);

  return (
    <div className="min-h-dvh flex flex-col">
      <PublicHeader cta={user ? "Open TimelyMemo" : undefined} />

      <main className="flex-1">
        {/* HERO */}
        <section className="max-w-5xl mx-auto px-6 md:px-10 grid md:grid-cols-2 gap-10 items-center py-14 md:py-20">
          <div>
            <h1 className="font-display text-4xl md:text-6xl leading-[1.05]">
              Remember things<br />
              <span className="text-ember">at the right time.</span>
            </h1>
            <p className="mt-6 text-ink-2 max-w-xl text-lg leading-relaxed">
              Your external memory for everyday life. Type or say anything - a purchase,
              a promise, a book, a stray idea at midnight - and TimelyMemo understands it,
              connects it, and brings it back exactly when it's useful.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={cta} className="btn-primary !px-6 !py-3 !text-base">
                {user ? "Open TimelyMemo" : "Start remembering"}
              </Link>
              <Link href="/why" className="btn-ghost !px-6 !py-3 !text-base">Why it works</Link>
            </div>
          </div>
          <LandingVisual />
        </section>

        {/* EXAMPLES */}
        <section id="examples" className="max-w-5xl mx-auto px-6 md:px-10 py-14 border-t border-line">
          <h2 className="font-display text-3xl">What people tell it</h2>
          <p className="text-ink-2 mt-2">Plain sentences in - structure, connections and timely reminders out. You never fill in forms.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
            {EXAMPLES.map((e) => (
              <div key={e.text} className="card p-5 soft-shadow hover:border-ember/50 transition-colors">
                <span className={`chip ${e.chip}`}>{e.type}</span>
                <p className="text-[15px] mt-3 leading-snug">"{e.text}"</p>
                <p className="text-sm text-ink-2 mt-3 leading-relaxed">{e.result}</p>
              </div>
            ))}
          </div>
        </section>

        {/* WHY TEASER */}
        <section className="max-w-5xl mx-auto px-6 md:px-10 py-14 border-t border-line">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-3xl">Why an external memory</h2>
            <Link href="/why" className="text-sm text-ember">All articles</Link>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-8">
            {WHY_TEASERS.map((a) => (
              <Link key={a.slug} href={`/why#${a.slug}`} className="card p-5 soft-shadow hover:border-ember/50 transition-colors">
                <p className="font-display text-lg leading-snug">{a.title}</p>
                <p className="text-sm text-ink-2 mt-2 leading-relaxed">{a.short}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* BLOG TEASER */}
        <section className="max-w-5xl mx-auto px-6 md:px-10 py-14 border-t border-line">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-3xl">From the blog</h2>
            <Link href="/blog" className="text-sm text-ember">All posts</Link>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-8">
            {latest.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="card p-5 soft-shadow hover:border-ember/50 transition-colors">
                <div className="flex items-center gap-2 text-xs text-ink-2">
                  <span className="chip">{p.tag}</span>
                  <span>{new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                  <span>· {p.minutes} min</span>
                </div>
                <p className="font-display text-lg mt-3 leading-snug">{p.title}</p>
                <p className="text-sm text-ink-2 mt-2 leading-relaxed">{p.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
