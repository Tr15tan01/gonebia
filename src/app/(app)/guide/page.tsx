import Link from "next/link";

function Tip({ title, children, href }: { title: string; children: React.ReactNode; href?: string }) {
  return (
    <div className="card p-5 space-y-1.5">
      <p className="font-display text-lg">{title}</p>
      <p className="text-sm text-ink-2 leading-relaxed">{children}</p>
      {href && <Link href={href} className="text-ember text-sm hover:underline inline-block mt-1">Try it →</Link>}
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">Getting the most from TimelyMemo</h1>
        <p className="text-ink-2 text-sm mt-1">A few things that make a real difference once you know them.</p>
      </header>

      <section className="space-y-3">
        <p className="label">Capturing</p>
        <Tip title="Just write like you're texting yourself" href="/dashboard">
          "Remind me to call the dentist tomorrow at 3pm", "Nico's cousin's name is Ana",
          "started reading Atomic Habits" - TimelyMemo figures out whether it's a task,
          a person, a book, or just a thought. You don't need to categorize anything yourself.
        </Tip>
        <Tip title="Mention people and books naturally">
          "My cousin Nico said the movie was great" links "Nico" as a person automatically.
          "Finished Sapiens, loved the ending" both marks the book finished AND connects
          that note to it - open the book later and you'll see it there.
        </Tip>
      </section>

      <section className="space-y-3">
        <p className="label">Staying on top of things</p>
        <Tip title="Tasks page vs. Timeline" href="/tasks">
          Tasks only shows things you still need to do, grouped by urgency. Timeline shows
          everything you've ever captured, in order - thoughts, ideas, and reflections included.
        </Tip>
        <Tip title="Duplicate people? Merge them" href="/people">
          If you mentioned someone two different ways (e.g. "Nico" once and "Nico - my
          cousin" another time), use "Merge duplicates" on the People page to combine
          them into one - every note moves over, nothing is lost.
        </Tip>
      </section>

      <section className="space-y-3">
        <p className="label">Asking questions</p>
        <Tip title="Ask my memory anything" href="/chat">
          "What did I say about the Johnson project?", "What books am I reading?", "When's
          my mom's birthday?" - it searches everything you've ever written down, not just
          recent captures.
        </Tip>
        <Tip title="Discover patterns you wouldn't spot yourself" href="/discover">
          Themes, recurring topics, and "on this day" callbacks across everything you've
          captured - worth checking every so often, not just when you're looking for something specific.
        </Tip>
      </section>

      <section className="space-y-3">
        <p className="label">Agents</p>
        <Tip title="Research, buying, and problem-solving agents" href="/agents">
          The research agent answers questions with real web sources. The buying agent finds
          specific real products (with photos and prices) and can track a price drop for you.
          Both remember your past runs so you can revisit them later.
        </Tip>
      </section>

      <section className="space-y-3">
        <p className="label">Making it yours</p>
        <Tip title="Tune how sensitive insights are" href="/settings">
          If daily insights feel like they're stating the obvious, or missing things you'd
          actually want flagged, adjust the sensitivity slider in Settings.
        </Tip>
      </section>
    </div>
  );
}
