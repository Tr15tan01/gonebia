import Link from "next/link";
import { getUser, createClient } from "@/lib/supabase/server";
import { BriefingService } from "@/lib/services/briefing";
import { CaptureBox } from "@/components/capture";
import { Empty } from "@/components/ui";
import { MemoryOpener } from "@/components/memory-opener";
import { relTime, hourInTimezone } from "@/lib/dates";
import { TimeChip } from "@/components/time-chip";
import { LogoMark } from "@/components/logo";

export const dynamic = "force-dynamic";

const TYPE_CHIP: Record<string, string> = {
  task: "chip-c-task", book: "chip-c-book", purchase: "chip-c-buy", expense: "chip-c-buy",
  decision: "chip-c-decision", idea: "chip-c-idea", goal: "chip-c-goal", event: "chip-c-event",
  person: "chip-c-person", promise: "chip-c-promise", commitment: "chip-c-promise",
  question: "chip-c-ask", knowledge: "chip-c-know", place: "chip-c-place",
  project: "chip-c-know", habit: "chip-c-goal", reflection: "chip-c-know",
  observation: "chip-c-event", reminder: "chip-c-ask", thought: "",
};

const TYPE_COLOR: Record<string, string> = {
  task: "var(--c-task)", promise: "var(--c-promise)", commitment: "var(--c-promise)",
  book: "var(--c-book)", purchase: "var(--c-buy)", expense: "var(--c-buy)",
  decision: "var(--c-decision)", idea: "var(--c-idea)", goal: "var(--c-goal)",
  event: "var(--c-event)", person: "var(--c-person)", question: "var(--c-ask)",
  knowledge: "var(--c-know)", reminder: "var(--c-ask)", thought: "var(--ember)",
};

function greeting(timezone?: string | null) {
  const h = hourInTimezone(timezone);
  return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function remindColor(iso: string): string {
  const t = new Date(iso).getTime();
  if (t < Date.now()) return "var(--danger)";
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  if (t <= endToday.getTime()) return "var(--ember)";
  return "var(--c-task)";
}

export default async function Dashboard() {
  const user = await getUser();
  const sb = await createClient();
  const briefing = await BriefingService.getForUser(user!.id).catch(() => null);
  const b = briefing ?? { date: "", today: [], dontForget: [], revisit: [], interesting: null };

  const [{ data: profile }, { data: recent }, { data: upcomingRems }, { data: readingBooks },
    { count: openTasks }, { count: totalMems }, { count: booksDone }, { count: peopleN }, { count: booksWant }, { data: wantBooks }] =
    await Promise.all([
      sb.from("profiles").select("timezone").maybeSingle(),
      sb.from("memories").select("id, original_text, created_at, memory_metadata(type, title)")
        .is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
      sb.from("reminders").select("id, remind_at, memory_id")
        .eq("status", "pending").gte("remind_at", new Date().toISOString())
        .order("remind_at").limit(4),
      sb.from("books").select("id, title, author")
        .eq("status", "reading").order("updated_at", { ascending: false }).limit(3),
      sb.from("memory_metadata").select("memory_id", { count: "exact", head: true })
        .eq("user_id", user!.id).eq("status", "open").in("type", ["task", "promise", "commitment"]),
      sb.from("memories").select("id", { count: "exact", head: true })
        .eq("user_id", user!.id).is("deleted_at", null),
      sb.from("books").select("id", { count: "exact", head: true })
        .eq("user_id", user!.id).eq("status", "finished"),
      sb.from("people").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
      sb.from("books").select("id", { count: "exact", head: true })
        .eq("user_id", user!.id).eq("status", "want_to_read"),
      sb.from("books").select("id, title, author")
        .eq("user_id", user!.id).eq("status", "want_to_read")
        .order("updated_at", { ascending: false }).limit(3),
    ]);

  const remIds = (upcomingRems ?? []).map((r: any) => r.memory_id).filter(Boolean) as string[];
  const { data: remMetas } = remIds.length
    ? await sb.from("memory_metadata").select("memory_id, title").in("memory_id", remIds)
    : { data: [] as { memory_id: string; title: string }[] | null };
  const titleFor = (id: string | null) =>
    remMetas?.find((m: any) => m.memory_id === id)?.title ?? "Reminder";

  const stats = [
    { label: "open tasks", value: openTasks ?? 0, color: "var(--c-task)", href: "/tasks" },
    { label: "memories", value: totalMems ?? 0, color: "var(--ember)", href: "/timeline" },
    { label: "books finished", value: booksDone ?? 0, color: "var(--success)", href: "/books" },
    { label: "people", value: peopleN ?? 0, color: "var(--c-decision)", href: "/people" },
  ];

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <LogoMark size={34} />
          <h1 className="font-display text-2xl md:text-3xl">
            {greeting(profile?.timezone)}, <span style={{ color: "var(--ember)" }}>{user!.name?.trim().split(" ")[0] || user!.email?.split("@")[0]}</span>.
          </h1>
        </div>
        <p className="text-ink-2 text-sm mt-1">Tell TimelyMemo anything. It remembers what matters.</p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}
            className="card p-3.5 hover:opacity-90 transition-opacity soft-shadow"
            style={{ borderLeft: `3px solid ${s.color}` }}>
            <p className="font-display text-2xl font-semibold leading-none" style={{ color: s.color }}>
              {s.value}
            </p>
            <p className="text-xs text-ink-2 mt-1.5">{s.label}</p>
          </Link>
        ))}
      </div>

      <CaptureBox />

      {/* TODAY - clickable */}
      <Section title="Today" color="var(--ember)">
        {b.today.length ? (
          <div className="space-y-2">
            {b.today.map((t: any) => (
              <MemoryOpener key={t.id} id={t.id}>
                <div className="card p-4 text-sm flex justify-between gap-3 hover:border-ember/60 soft-shadow"
                  style={{ borderLeft: `3px solid ${TYPE_COLOR[(t as any).type] ?? "var(--ember)"}` }}>
                  <span className="font-medium">{t.title || t.text}</span>
                  {t.iso
                  ? <TimeChip iso={t.iso} />
                  : t.when
                    ? <span className="whitespace-nowrap font-medium" style={{ color: "var(--ember)" }}>{t.when}</span>
                    : null}
                </div>
              </MemoryOpener>
            ))}
          </div>
        ) : <Empty icon="~" title="Nothing urgent today." hint="A quiet day is a good day." />}
      </Section>

      {((readingBooks && readingBooks.length > 0) || (booksWant ?? 0) > 0) && (
        <Section title="Books" href="/books" color="var(--success)">
          <div className="card p-4 space-y-2.5 text-sm soft-shadow">
            <p className="text-xs text-ink-2">
              <span className="font-semibold" style={{ color: "var(--success)" }}>{booksDone ?? 0} finished</span>
              {" - "}{readingBooks?.length ?? 0} reading now
              {" - "}{booksWant ?? 0} not finished yet
            </p>
            <div className="flex flex-wrap gap-2">
              {(readingBooks ?? []).map((bk: any) => (
                <span key={bk.id} className="chip chip-c-buy !text-sm">
                  {bk.title}{bk.author ? <span className="text-ink-2"> - {bk.author}</span> : null}
                </span>
              ))}
              {(wantBooks ?? []).map((bk: any) => (
                <span key={bk.id} className="chip !text-sm">
                  up next: {bk.title}
                </span>
              ))}
            </div>
          </div>
        </Section>
      )}

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

      {/* UPCOMING REMINDERS - colored, prominent, clickable */}
      {upcomingRems && upcomingRems.length > 0 && (
        <Section title="Upcoming reminders" color="var(--c-task)">
          <div className="space-y-2">
            {upcomingRems.map((r: any) => {
              const color = remindColor(r.remind_at);
              const urgent = new Date(r.remind_at).getTime() <= endOfTodayMs();
              const inner = (
                <div className="card p-4 text-sm flex justify-between gap-3 hover:border-ember/60 soft-shadow"
                  style={{ borderLeft: `3px solid ${color}` }}>
                  <span className={urgent ? "font-semibold" : ""}>{titleFor(r.memory_id)}</span>
                  <TimeChip iso={r.remind_at} />
                </div>
              );
              return r.memory_id
                ? <MemoryOpener key={r.id} id={r.memory_id}>{inner}</MemoryOpener>
                : <div key={r.id}>{inner}</div>;
            })}
          </div>
        </Section>
      )}

      {/* RECENT MEMORIES - clickable */}
      <Section title="Recent memories" href="/timeline">
        {recent && recent.length > 0 ? (
          <div className="space-y-2">
            {recent.map((m: any) => {
              const raw: unknown = m.memory_metadata;
              const meta = (Array.isArray(raw) ? raw[0] : raw) ?? {};
              return (
                <MemoryOpener key={m.id} id={m.id}>
                  <div className="card p-4 text-sm hover:border-ember/60 soft-shadow">
                    <p>{m.original_text}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-ink-2">
                      <span className={`chip ${(TYPE_CHIP as any)[meta.type] ?? ""}`}>{meta.type ?? "thought"}</span>
                      <span>{relTime(m.created_at)}</span>
                    </div>
                  </div>
                </MemoryOpener>
              );
            })}
          </div>
        ) : <Empty icon="*" title="Your memory is empty." hint="Start by telling TimelyMemo something above." />}
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

function endOfTodayMs() {
  const d = new Date(); d.setHours(23, 59, 59, 999);
  return d.getTime();
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
