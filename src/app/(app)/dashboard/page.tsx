import Link from "next/link";
import { getUser, createClient } from "@/lib/supabase/server";
import { BriefingService } from "@/lib/services/briefing";
import { CaptureBox } from "@/components/capture";
import { Empty } from "@/components/ui";
import { relTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const user = await getUser();
  const sb = await createClient();
  const briefing = await BriefingService.getForUser(user!.id).catch(() => null);
  const b = briefing ?? { date: "", today: [], dontForget: [], revisit: [], interesting: null };

  const [{ data: recent }, { data: upcomingRems }, { data: readingBooks }] = await Promise.all([
    sb.from("memories").select("id, original_text, created_at, memory_metadata(type, title)")
      .is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
    sb.from("reminders").select("id, remind_at, memory_id")
      .eq("status", "pending").gte("remind_at", new Date().toISOString())
      .order("remind_at").limit(4),
    // fail soft if the books migration (0002) has not been applied yet
    sb.from("books").select("id, title, author")
      .eq("status", "reading").order("updated_at", { ascending: false }).limit(3)
      .then((r: any) => r, () => ({ data: [] })),
  ]);

  // resolve reminder titles in a second, explicit query (no cross-table embed assumptions)
  const remIds = (upcomingRems ?? []).map((r: any) => r.memory_id).filter(Boolean) as string[];
  const { data: remMetas } = remIds.length
    ? await sb.from("memory_metadata").select("memory_id, title").in("memory_id", remIds)
    : { data: [] as { memory_id: string; title: string }[] | null };
  const titleFor = (id: string | null) =>
    remMetas?.find((m: any) => m.memory_id === id)?.title ?? "Reminder";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl md:text-3xl">
          {greeting()}, {user!.email?.split("@")[0]}.
        </h1>
        <p className="text-ink-2 text-sm mt-1">Tell Gonebia anything. It remembers what matters.</p>
      </header>

      <CaptureBox />

      {/* TODAY */}
      <Section title="Today">
        {b.today.length ? (
          <ul className="card divide-y divide-line">
            {b.today.map((t: any) => (
              <li key={t.id} className="p-4 text-sm flex justify-between gap-3">
                <span>{t.title || t.text}</span>
                {t.when && <span className="text-ink-2 whitespace-nowrap">{t.when}</span>}
              </li>
            ))}
          </ul>
        ) : <Empty icon="~" title="Nothing urgent today." hint="A quiet day is a good day." />}
      </Section>

      {/* READING NOW (books feature surfacing) */}
      {readingBooks && readingBooks.length > 0 && (
        <Section title="Reading now" href="/books">
          <div className="card p-4 flex flex-wrap gap-2 text-sm">
            {readingBooks.map((bk: any) => (
              <span key={bk.id} className="chip !text-sm !text-ink">
                {bk.title}{bk.author ? <span className="text-ink-2"> - {bk.author}</span> : null}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* DON'T FORGET */}
      {b.dontForget.length > 0 && (
        <Section title="Don't forget" href="/insights">
          <ul className="space-y-2">
            {b.dontForget.map((f: any) => (
              <li key={f.id} className="card p-4 text-sm border-ember/30">
                <p className="font-medium">{f.title}</p>
                <p className="text-ink-2 mt-1">{f.body}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* WORTH NOTICING (connect the dots) */}
      {b.interesting && (
        <Section title="Worth noticing" href="/insights">
          <div className="card p-4 text-sm border-ember/30">
            <p className="font-medium">{b.interesting.title}</p>
            <p className="text-ink-2 mt-1">{b.interesting.body}</p>
            <Link href="/insights" className="text-ember text-sm mt-2 inline-block">View connected memories</Link>
          </div>
        </Section>
      )}

      {/* REVISIT (incl. future memory) */}
      {b.revisit.length > 0 && (
        <Section title="Revisit">
          <ul className="space-y-2">
            {b.revisit.map((r: any) => (
              <li key={r.id + r.kind} className={`card p-4 text-sm ${r.kind === "future_note" ? "border-ember/40" : ""}`}>
                {r.kind === "future_note" && <p className="label text-ember mb-1">Future memory</p>}
                <p className="font-medium">{r.title}</p>
                <p className="text-ink-2 mt-1">"{r.text}"</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* UPCOMING REMINDERS */}
      {upcomingRems && upcomingRems.length > 0 && (
        <Section title="Upcoming reminders">
          <ul className="card divide-y divide-line">
            {upcomingRems.map((r: any) => (
              <li key={r.id} className="p-4 text-sm flex justify-between gap-3">
                <span>{titleFor(r.memory_id)}</span>
                <span className="text-ink-2 whitespace-nowrap">{relTime(r.remind_at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* RECENT MEMORIES */}
      <Section title="Recent memories" href="/timeline">
        {recent && recent.length > 0 ? (
          <ul className="space-y-2">
            {recent.map((m: any) => (
              <li key={m.id} className="card p-4 text-sm">
                <p>{m.original_text}</p>
                <p className="text-xs text-ink-2 mt-1">{relTime(m.created_at)} - {m.memory_metadata?.type ?? "thought"}</p>
              </li>
            ))}
          </ul>
        ) : <Empty icon="*" title="Your memory is empty." hint="Start by telling Gonebia something above." />}
      </Section>

      <Link href="/chat" className="card p-5 flex items-center justify-between group">
        <div>
          <p className="font-display text-lg">Ask my memory</p>
          <p className="text-sm text-ink-2">"What did I buy last month?" - "What books did I finish?"</p>
        </div>
        <span className="text-ember group-hover:translate-x-1 transition-transform">-&gt;</span>
      </Link>
    </div>
  );
}

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2.5">
        <h2 className="label">{title}</h2>
        {href && <Link href={href} className="text-xs text-ember">See all</Link>}
      </div>
      {children}
    </section>
  );
}
