import Link from "next/link";
import { getUser, createClient } from "@/lib/supabase/server";
import { BriefingService } from "@/lib/services/briefing";
import { CaptureBox } from "@/components/capture";
import { Empty } from "@/components/ui";
import { relTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

const TYPE_CHIP: Record<string, string> = {
  task: "chip-c-task", book: "chip-c-book", purchase: "chip-c-buy", expense: "chip-c-buy",
  decision: "chip-c-decision", idea: "chip-c-idea", goal: "chip-c-goal", event: "chip-c-event",
  person: "chip-c-person", promise: "chip-c-promise", commitment: "chip-c-promise",
  question: "chip-c-ask", knowledge: "chip-c-know", place: "chip-c-place",
  project: "chip-c-know", habit: "chip-c-goal", reflection: "chip-c-know",
  observation: "chip-c-event", reminder: "chip-c-ask", thought: "",
};

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const user = await getUser();
  const sb = await createClient();
  const briefing = await BriefingService.getForUser(user!.id).catch(() => null);
  const b = briefing ?? { date: "", today: [], dontForget: [], revisit: [], interesting: null };

  const [{ data: recent }, { data: upcomingRems }, { data: readingBooks },
    { count: openTasks }, { count: totalMems }, { count: booksDone }, { count: peopleN }] =
    await Promise.all([
      sb.from("memories").select("id, original_text, created_at, memory_metadata(type, title)")
        .is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
      sb.from("reminders").select("id, remind_at, memory_id")
        .eq("status", "pending").gte("remind_at", new Date().toISOString())
        .order("remind_at").limit(4),
      sb.from("books").select("id, title, author")
        .eq("status", "reading").order("updated_at", { ascending: false }).limit(3),
      sb.from("memory_metadata").select("id", { count: "exact", head: true })
        .eq("user_id", user!.id).eq("status", "open").in("type", ["task", "promise", "commitment"]),
      sb.from("memories").select("id", { count: "exact", head: true })
        .eq("user_id", user!.id).is("deleted_at", null),
      sb.from("books").select("id", { count: "exact", head: true })
        .eq("user_id", user!.id).eq("status", "finished"),
      sb.from("people").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
    ]);

  // resolve reminder titles in a second, explicit query
  const remIds = (upcomingRems ?? []).map((r: any) => r.memory_id).filter(Boolean) as string[];
  const { data: remMetas } = remIds.length
    ? await sb.from("memory_metadata").select("memory_id, title").in("memory_id", remIds)
    : { data: [] as { memory_id: string; title: string }[] | null };
  const titleFor = (id: string | null) =>
    remMetas?.find((m: any) => m.memory_id === id)?.title ?? "Reminder";

  const stats = [
    { label: "open tasks", value: openTasks ?? 0, color: "var(--c-task)", href: "/tasks" },
    { label: "memories", value: totalMems ?? 0, color: "var(--ember)", href: "/timeline" },
    { label: "books finished", value: booksDone ?? 0, color: "var(--c-book)", href: "/books" },
    { label: "people", value: peopleN ?? 0, color: "var(--c-person)", href: "/people" },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl md:text-3xl">
          {greeting()}, <span style={{ color: "var(--ember)" }}>{user!.email?.split("@")[0]}</span>.
        </h1>
        <p className="text-ink-2 text-sm mt-1">Tell Gonebia anything. It remembers what matters.</p>
      </header>

      {/* stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}
            className="card p-3.5 hover:opacity-90 transition-opacity"
            style={{ borderLeft: `3px solid ${s.color}` }}>
            <p className="font-display text-2xl font-semibold leading-none" style={{ color: s.color }}>
              {s.value}
            </p>
            <p className="text-xs text-ink-2 mt-1.5">{s.label}</p>
          </Link>
        ))}
      </div>

      <CaptureBox />

      {/* TODAY */}
      <Section title="Today" color="var(--ember)">
        {b.today.length ? (
          <ul className="card divide-y divide-line">
            {b.today.map((t: any) => (
              <li key={t.id} className="p-4 text-sm flex justify-between gap-3">
                <span>{t.title || t.text}</span>
                {t.when && <span className="whitespace-nowrap" style={{ color: "var(--ember)" }}>{t.when}</span>}
              </li>
            ))}
          </ul>
        ) : <Empty icon="~" title="Nothing urgent today." hint="A quiet day is a good day." />}
      </Section>

      {/* READING NOW */}
      {readingBooks && readingBooks.length > 0 && (
        <Section title="Reading now" href="/books" color="var(--c-book)">
          <div className="card p-4 flex flex-wrap gap-2 text-sm">
            {readingBooks.map((bk: any) => (
              <span key={bk.id} className="chip chip-c-book !text-sm">
                {bk.title}{bk.author ? <span className="text-ink-2"> - {bk.author}</span> : null}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* DON'T FORGET */}
      {b.dontForget.length > 0 && (
        <Section title="Don't forget" href="/insights" color="var(--danger)">
          <ul className="space-y-2">
            {b.dontForget.map((f: any) => (
              <li key={f.id} className="card p-4 text-sm"
                style={{ borderLeft: "3px solid var(--danger)", background: "var(--danger-soft)" }}>
                <p className="font-medium" style={{ color: "var(--danger)" }}>{f.title}</p>
                <p className="text-ink-2 mt-1">{f.body}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* WORTH NOTICING */}
      {b.interesting && (
        <Section title="Worth noticing" href="/insights" color="var(--c-decision)">
          <div className="card p-4 text-sm" style={{ borderLeft: "3px solid var(--c-decision)" }}>
            <p className="font-medium">{b.interesting.title}</p>
            <p className="text-ink-2 mt-1">{b.interesting.body}</p>
            <Link href="/insights" className="text-sm mt-2 inline-block" style={{ color: "var(--c-decision)" }}>
              View connected memories
            </Link>
          </div>
        </Section>
      )}

      {/* REVISIT */}
      {b.revisit.length > 0 && (
        <Section title="Revisit" color="var(--c-know)">
          <ul className="space-y-2">
            {b.revisit.map((r: any) => (
              <li key={r.id + r.kind} className="card p-4 text-sm"
                style={r.kind === "future_note" ? { borderLeft: "3px solid var(--c-know)" } : undefined}>
                {r.kind === "future_note" && (
                  <p className="label mb-1" style={{ color: "var(--c-know)" }}>Future memory</p>
                )}
                <p className="font-medium">{r.title}</p>
                <p className="text-ink-2 mt-1">"{r.text}"</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* UPCOMING REMINDERS */}
      {upcomingRems && upcomingRems.length > 0 && (
        <Section title="Upcoming reminders" color="var(--c-task)">
          <ul className="card divide-y divide-line">
            {upcomingRems.map((r: any) => (
              <li key={r.id} className="p-4 text-sm flex justify-between gap-3">
                <span>{titleFor(r.memory_id)}</span>
                <span className="whitespace-nowrap" style={{ color: "var(--c-task)" }}>{relTime(r.remind_at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* RECENT MEMORIES */}
      <Section title="Recent memories" href="/timeline">
        {recent && recent.length > 0 ? (
          <ul className="space-y-2">
            {recent.map((m: any) => {
              const raw: unknown = m.memory_metadata;
              const meta = (Array.isArray(raw) ? raw[0] : raw) ?? {};
              return (
                <li key={m.id} className="card p-4 text-sm">
                  <p>{m.original_text}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-ink-2">
                    <span className={`chip ${TYPE_CHIP[meta.type] ?? ""}`}>{meta.type ?? "thought"}</span>
                    <span>{relTime(m.created_at)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <Empty icon="*" title="Your memory is empty." hint="Start by telling Gonebia something above." />}
      </Section>

      <Link href="/chat" className="card p-5 flex items-center justify-between group"
        style={{
          background: "var(--ember-soft)",
          borderColor: "color-mix(in srgb, var(--ember) 35%, transparent)",
        }}>
        <div>
          <p className="font-display text-lg" style={{ color: "var(--ember)" }}>Ask my memory</p>
          <p className="text-sm text-ink-2">"What did I buy last month?" - "What books did I finish?"</p>
        </div>
        <span className="text-ember group-hover:translate-x-1 transition-transform">→</span>
      </Link>
    </div>
  );
}

function Section({ title, href, color, children }: { title: string; href?: string; color?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2.5">
        <h2 className="label" style={color ? { color } : undefined}>{title}</h2>
        {href && <Link href={href} className="text-xs text-ember">See all</Link>}
      </div>
      {children}
    </section>
  );
}
