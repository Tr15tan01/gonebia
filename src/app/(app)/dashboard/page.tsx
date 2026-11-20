import Link from "next/link";
import { Fragment, Suspense } from "react";
import { getUser, createClient } from "@/lib/supabase/server";
import { BriefingService } from "@/lib/services/briefing";
import { CaptureBox } from "@/components/capture";
import { AnimatedStatValue } from "@/components/stats-refresh-wrapper";
import { Empty } from "@/components/ui";
import { MemoryOpener } from "@/components/memory-opener";
import { relTime, hourInTimezone } from "@/lib/dates";
import { TimeChip } from "@/components/time-chip";
import { TYPE_COLOR, typeIcon } from "@/lib/type-style";

export const dynamic = "force-dynamic";


function todayLabel(timezone?: string | null) {
  try {
    return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: timezone || undefined }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  }
}

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

function endOfTodayMs() {
  const d = new Date(); d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function Section({ title, icon, href, color, count, children }: {
  title: string; icon: string; href?: string; color?: string; count?: number; children: React.ReactNode;
}) {
  return (
    <section className="fade-up">
      <div className="section-head">
        <h2 className="flex items-center gap-2.5 min-w-0">
          <span className="icon-tile sm" style={{ "--tile": color ?? "var(--ink-2)" } as React.CSSProperties} aria-hidden>{icon}</span>
          <span className="font-display text-[1.05rem] font-semibold truncate">{title}</span>
          {!!count && <span className="count-pill">{count}</span>}
        </h2>
        {href && <Link href={href} className="section-link">See all <span aria-hidden>→</span></Link>}
      </div>
      {children}
    </section>
  );
}

/** Skeleton shown per-section while ITS OWN data is still loading - other
 *  sections (and the header/capture box, which need no data at all) don't
 *  wait for this one. This is the "load some resource on top and later on
 *  bottom" streaming the dashboard was missing: previously the whole page
 *  was one big server component that awaited EVERY query (briefing, stats,
 *  recent memories, reminders, books) before sending any HTML at all, so the
 *  page's total load time was gated by whichever single query was slowest -
 *  now each section streams in independently as soon as its own data (and
 *  only its own data) is ready. */
function SectionSkeleton({ title, rows = 2 }: { title: string; rows?: number }) {
  return (
    <section aria-busy="true">
      <div className="section-head">
        <h2 className="flex items-center gap-2.5">
          <span className="skeleton size-7 !rounded-[.55rem]" aria-hidden />
          <span className="font-display text-[1.05rem] font-semibold text-ink-2">{title}</span>
        </h2>
      </div>
      <div className="panel">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="panel-row">
            <span className="skeleton size-[2.1rem] !rounded-[.7rem] shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="skeleton h-3 w-2/3 !rounded-full" />
              <div className="skeleton h-2.5 w-1/3 !rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const ASK_EXAMPLES = ["What did I buy last month?", "What books did I finish?", "What did I promise to do?"];

/** Entry point to Ask my memory: opens the chat, or asks an example right away. */
function AskCard() {
  return (
    <section className="ask-card fade-up">
      <Link href="/chat" className="ask-main flex items-center gap-4">
        <span className="ask-icon" aria-hidden>✦</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg md:text-xl font-bold leading-tight">Ask my memory</span>
          <span className="block text-sm text-ink-2 mt-0.5">Answers from your notes and Knowledge base, with sources.</span>
        </span>
        <span className="ask-go" aria-hidden>→</span>
      </Link>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {ASK_EXAMPLES.map((q) => (
          <Link key={q} href={`/chat?q=${encodeURIComponent(q)}`} className="ask-chip">
            <span aria-hidden className="opacity-60">↳</span>{q}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function Dashboard() {
  const user = await getUser();
  const sb = await createClient();
  // Only the greeting needs data before first paint, and it's one cheap
  // indexed lookup - everything heavier streams in below via Suspense.
  const { data: profile } = await sb.from("profiles").select("timezone").maybeSingle();

  return (
    <div className="space-y-8">
      <section className="hero-dusk space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="hero-sub text-sm font-medium">{todayLabel(profile?.timezone)}</p>
            <h1 className="font-display text-[1.9rem] md:text-[2.4rem] font-bold leading-[1.05] mt-1">
              {greeting(profile?.timezone)}, {user!.name?.trim().split(" ")[0] || user!.email?.split("@")[0]}
            </h1>
            <p className="hero-sub text-sm mt-2 max-w-md">Say it once. TimelyMemo brings it back when it matters.</p>
          </div>
          <Link href="/guide" className="hero-chip shrink-0">💡 Tips for getting more out of it</Link>
        </div>
        <CaptureBox />
      </section>

      <Suspense fallback={
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-[96px] !rounded-2xl" />)}
        </div>
      }>
        <StatsRow sb={sb} userId={user!.id} timezone={profile?.timezone} />
      </Suspense>

      <AskCard />

      <Suspense fallback={<SectionSkeleton title="Today" />}>
        <BriefingSections userId={user!.id} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Books" rows={1} />}>
        <BooksSection sb={sb} userId={user!.id} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Upcoming reminders" />}>
        <RemindersSection sb={sb} userId={user!.id} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Recent memories" rows={3} />}>
        <RecentSection sb={sb} userId={user!.id} />
      </Suspense>

    </div>
  );
}

async function StatsRow({ sb, userId, timezone }: { sb: any; userId: string; timezone?: string | null }) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const count = (r: { count: number | null; error?: unknown }) => (r?.error ? 0 : r?.count ?? 0);
  const [openTasks, totalMems, booksDone, booksInProcess, movies, peopleN, researchRuns, deepRuns, kbItems, watch, watchChanges, recentRes] = await Promise.all([
    sb.from("memory_metadata").select("memory_id", { count: "exact", head: true })
      .eq("status", "open").in("type", ["task", "promise", "commitment"]),
    sb.from("memories").select("id", { count: "exact", head: true }).is("deleted_at", null),
    sb.from("books").select("id", { count: "exact", head: true }).eq("status", "finished"),
    sb.from("books").select("id", { count: "exact", head: true }).in("status", ["reading", "want_to_read"]),
    sb.from("memory_metadata").select("memory_id", { count: "exact", head: true }).eq("type", "movie"),
    sb.from("people").select("id", { count: "exact", head: true }),
    sb.from("agent_runs").select("id", { count: "exact", head: true }).eq("kind", "research").eq("status", "done"),
    sb.from("agent_runs").select("id", { count: "exact", head: true }).eq("kind", "deep_research").eq("status", "done"),
    sb.from("knowledge_items").select("id", { count: "exact", head: true }),
    unseenWatchChanges(sb),
    sb.from("watch_events").select("id", { count: "exact", head: true })
      .not("kind", "in", "(baseline,error)").gte("created_at", weekAgo),
    sb.from("memories").select("created_at, memory_metadata(type)").is("deleted_at", null)
      .gte("created_at", twoWeeksAgo).order("created_at", { ascending: false }).limit(600),
  ]);

  // Momentum: this week's captures against the week before, and what they
  // were mostly about.
  const weekMs = 7 * 86_400_000;
  const recent = recentRes?.error ? [] : (recentRes?.data ?? []);
  let thisWeek = 0, lastWeek = 0;
  const typeCount = new Map<string, number>();
  for (const m of recent as any[]) {
    const age = Date.now() - new Date(m.created_at).getTime();
    if (age < weekMs) {
      thisWeek++;
      const meta = Array.isArray(m.memory_metadata) ? m.memory_metadata[0] : m.memory_metadata;
      const t = meta?.type ?? "thought";
      typeCount.set(t, (typeCount.get(t) ?? 0) + 1);
    } else lastWeek++;
  }
  const topType = [...typeCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const delta = thisWeek - lastWeek;

  const knowledge = count(researchRuns) + count(deepRuns) + count(kbItems);

  const unseen = watch.unseen;
  const stats: { label: string; icon: string; value: number | string; sub: React.ReactNode; color: string; href: string; alert?: number }[] = [
    { label: "Open tasks", icon: "☑️", value: count(openTasks), sub: "promises included", color: "var(--c-task)", href: "/tasks" },
    { label: "Memories", icon: "💭", value: count(totalMems), sub: "everything you've said", color: "var(--ember)", href: "/timeline" },
    {
      label: "Books", icon: "📚", value: count(booksDone), color: "var(--c-book)", href: "/books",
      sub: (
        <>
          finished · <span className="font-semibold text-ink">{count(booksInProcess)}</span> in process
        </>
      ),
    },
    { label: "Movies", icon: "🎬", value: count(movies), sub: "watched & noted", color: "var(--c-movie)", href: "/timeline?type=movie" },
    { label: "People", icon: "👥", value: count(peopleN), sub: "in your circle", color: "var(--c-decision)", href: "/people" },
    { label: "Knowledge", icon: "🧠", value: knowledge, sub: count(deepRuns) ? `${count(deepRuns)} deep report${count(deepRuns) === 1 ? "" : "s"}` : "researched topics", color: "var(--c-know)", href: "/knowledge" },
    {
      label: "Watching", icon: "👁️", value: watch.active, color: "var(--c-ask)", href: "/agents?tab=watch", alert: unseen,
      sub: unseen
        ? <span className="font-semibold" style={{ color: "var(--c-ask)" }}>{unseen} new change{unseen === 1 ? "" : "s"} · review</span>
        : count(watchChanges) ? `${count(watchChanges)} change${count(watchChanges) === 1 ? "" : "s"} this week` : "pages & prices",
    },
    {
      label: "This week", icon: "📈", color: "var(--c-idea)",
      href: topType ? `/timeline?type=${topType}` : "/timeline",
      value: thisWeek,
      sub: thisWeek === 0 && lastWeek === 0
        ? <>new memories show up here</>
        : <>
            <span className="font-semibold" style={{ color: delta > 0 ? "var(--success)" : delta < 0 ? "var(--danger)" : "var(--ink-2)" }}>
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {Math.abs(delta)}
            </span>{" "}vs last week{topType ? <> · mostly {topType}</> : null}
          </>,
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 stagger">
      {stats.map((s) => (
        <Link key={s.label} href={s.href} className={`stat-tile ${s.alert ? "has-alert" : ""}`}
          aria-label={s.alert ? `${s.label}: ${s.alert} new` : undefined}
          style={{ "--tile": s.color } as React.CSSProperties}>
          {!!s.alert && <span className="stat-alert-badge" aria-hidden>{s.alert}</span>}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink-2">{s.label}</span>
            <span className="stat-icon" aria-hidden>{s.icon}</span>
          </div>
          <div>
            <p className="stat-value"><AnimatedStatValue value={s.value} color={s.color} /></p>
            <p className="text-[11px] text-ink-2 mt-1 truncate">{s.sub}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Active watch count, plus how many watches changed since the user last
 *  opened the Watch tab (migration 0027). Never throws: without the
 *  migration it degrades to "nothing unseen". */
async function unseenWatchChanges(sb: any): Promise<{ active: number; unseen: number }> {
  const cols = "id, status, created_at, last_changed_at";
  let { data, error } = await sb.from("watches").select(`${cols}, seen_at`).limit(100);
  if (error) ({ data, error } = await sb.from("watches").select(cols).limit(100));
  if (error || !data) return { active: 0, unseen: 0 };
  const rows = data as any[];
  return {
    active: rows.filter((w) => w.status === "active").length,
    unseen: rows.filter((w) => w.last_changed_at && w.seen_at !== undefined
      && new Date(w.last_changed_at).getTime() > new Date(w.seen_at ?? w.created_at).getTime()).length,
  };
}

/** The quiet second line under a dashboard item: what kind of thing it is,
 *  how urgent you said it was, who it involves and when you captured it. */
function ItemMeta({ type, importance, createdAt, people }: {
  type?: string | null; importance?: number | null; createdAt?: string | null; people?: string[] | null;
}) {
  const bits: React.ReactNode[] = [];
  if (type) bits.push(<span key="t" className="capitalize font-medium" style={{ color: TYPE_COLOR[type] ?? "var(--ink-2)" }}>{type}</span>);
  if ((importance ?? 0) >= 4) bits.push(<span key="p" className="font-medium" style={{ color: "var(--ember)" }}>★ high priority</span>);
  if (people?.length) bits.push(<span key="w">with {people.slice(0, 2).join(", ")}</span>);
  if (createdAt) bits.push(<span key="c">noted {relTime(createdAt)}</span>);
  if (!bits.length) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-ink-2">
      {bits.map((b, i) => <Fragment key={i}>{i > 0 && <span aria-hidden className="opacity-50">·</span>}{b}</Fragment>)}
    </span>
  );
}

/** One line in a dashboard panel: icon tile, title + details, optional
 *  right-hand time or status. */
function Row({ icon, color, title, children, trailing, strong = true }: {
  icon: React.ReactNode; color?: string; title: React.ReactNode; children?: React.ReactNode;
  trailing?: React.ReactNode; strong?: boolean;
}) {
  return (
    <div className="panel-row">
      <span className="icon-tile" style={{ "--tile": color ?? "var(--ember)" } as React.CSSProperties} aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1 pt-px">
        <p className={strong ? "row-title" : "text-[0.9rem] leading-snug text-ink"}>{title}</p>
        {children}
      </div>
      {trailing && <div className="shrink-0 pt-0.5">{trailing}</div>}
    </div>
  );
}

async function BriefingSections({ userId }: { userId: string }) {
  const briefing = await BriefingService.getForUser(userId).catch(() => null);
  const b = briefing ?? { date: "", today: [], dontForget: [], revisit: [], interesting: null };

  return (
    <>
      <Section title="Today" icon="☀️" color="var(--ember)" count={b.today.length}>
        <div className="panel">
          {b.today.length ? b.today.map((t: any) => (
            <MemoryOpener key={t.id} id={t.id} className="panel-click block">
              <Row icon={typeIcon(t.type)} color={TYPE_COLOR[t.type] ?? "var(--ember)"} title={t.title || t.text}
                trailing={t.iso
                  ? <TimeChip iso={t.iso} />
                  : t.when ? <span className="chip font-medium whitespace-nowrap" style={{ color: "var(--ember)" }}>{t.when}</span> : null}>
                <ItemMeta type={t.type} importance={t.importance} createdAt={t.created_at} people={t.people} />
              </Row>
            </MemoryOpener>
          )) : (
            <Row icon="✓" color="var(--success)" title="Nothing urgent today.">
              <p className="row-body">A quiet day is a good day.</p>
            </Row>
          )}
        </div>
      </Section>

      {b.dontForget.length > 0 && (
        <Section title="Don't forget" icon="⚑" color="var(--danger)" href="/insights" count={b.dontForget.length}>
          <ul className="panel panel-tone" style={{ "--tile": "var(--danger)" } as React.CSSProperties}>
            {b.dontForget.map((f: any) => (
              <li key={f.id}>
                <Row icon="!" color="var(--danger)" title={f.title}>
                  <p className="row-body">{f.body}</p>
                </Row>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {b.interesting && (
        <Section title="Worth noticing" icon="🧩" color="var(--c-decision)" href="/insights">
          <div className="panel panel-tone" style={{ "--tile": "var(--c-decision)" } as React.CSSProperties}>
            <Row icon="✦" color="var(--c-decision)" title={b.interesting.title}>
              <p className="row-body">{b.interesting.body}</p>
              <Link href="/insights" className="btn-tint !py-1 !px-2.5 !text-xs mt-2.5"
                style={{ "--tint": "var(--c-decision)" } as React.CSSProperties}>
                View connected memories <span aria-hidden>→</span>
              </Link>
            </Row>
          </div>
        </Section>
      )}

      {b.revisit.length > 0 && (
        <Section title="Revisit" icon="🕰️" color="var(--c-know)" count={b.revisit.length}>
          <ul className="panel">
            {b.revisit.map((r: any) => (
              <li key={r.id + r.kind}>
                <Row icon={r.kind === "future_note" ? "✉️" : typeIcon(r.type)} color={r.kind === "future_note" ? "var(--c-know)" : TYPE_COLOR[r.type] ?? "var(--c-know)"}
                  title={<>{r.kind === "future_note" && <span className="chip !py-0 !text-[10.5px] font-semibold mr-1.5 align-[1px]" style={{ color: "var(--c-know)" }}>Future memory</span>}{r.title}</>}>
                  <p className="row-body italic line-clamp-2">&ldquo;{r.text}&rdquo;</p>
                  <ItemMeta type={r.type} importance={r.importance} createdAt={r.created_at} />
                </Row>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

async function BooksSection({ sb, userId }: { sb: any; userId: string }) {
  const [{ data: readingBooks }, { count: booksDone }, { count: booksWant }, { data: wantBooks }] = await Promise.all([
    sb.from("books").select("id, title, author")
      .eq("user_id", userId).eq("status", "reading").order("updated_at", { ascending: false }).limit(3),
    sb.from("books").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "finished"),
    sb.from("books").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "want_to_read"),
    sb.from("books").select("id, title, author")
      .eq("user_id", userId).eq("status", "want_to_read")
      .order("updated_at", { ascending: false }).limit(3),
  ]);

  if (!((readingBooks && readingBooks.length > 0) || (booksWant ?? 0) > 0)) return null;

  const stats = [
    { label: "Finished", value: booksDone ?? 0, color: "var(--success)" },
    { label: "Reading", value: readingBooks?.length ?? 0, color: "var(--c-book)" },
    { label: "On the list", value: booksWant ?? 0, color: "var(--ink-2)" },
  ];
  return (
    <Section title="Books" icon="📚" color="var(--c-book)" href="/books">
      <div className="panel">
        <div className="grid grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="mini-stat">
              <p className="mini-stat-value" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[11.5px] font-medium text-ink-2 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
        {(readingBooks ?? []).map((bk: any) => (
          <Row key={bk.id} icon="📖" color="var(--c-book)" title={bk.title}
            trailing={<span className="chip font-semibold" style={{ color: "var(--c-book)" }}>Reading</span>}>
            {bk.author && <p className="row-body">{bk.author}</p>}
          </Row>
        ))}
        {(wantBooks ?? []).map((bk: any) => (
          <Row key={bk.id} icon="🔖" color="var(--ink-2)" title={bk.title} strong={false}
            trailing={<span className="chip text-ink-2">Up next</span>}>
            {bk.author && <p className="row-body">{bk.author}</p>}
          </Row>
        ))}
      </div>
    </Section>
  );
}

async function RemindersSection({ sb, userId }: { sb: any; userId: string }) {
  const { data: upcomingRems } = await sb.from("reminders").select("id, remind_at, memory_id")
    .eq("user_id", userId).eq("status", "pending").gte("remind_at", new Date().toISOString())
    .order("remind_at").limit(4);

  if (!upcomingRems || upcomingRems.length === 0) return null;

  const remIds = upcomingRems.map((r: any) => r.memory_id).filter(Boolean) as string[];
  const { data: remMetas } = remIds.length
    ? await sb.from("memory_metadata").select("memory_id, title").in("memory_id", remIds)
    : { data: [] as { memory_id: string; title: string }[] | null };
  const titleFor = (id: string | null) =>
    remMetas?.find((m: any) => m.memory_id === id)?.title ?? "Reminder";

  return (
    <Section title="Upcoming reminders" icon="⏰" color="var(--c-task)" count={upcomingRems.length}>
      <div className="panel">
        {upcomingRems.map((r: any) => {
          const urgent = new Date(r.remind_at).getTime() <= endOfTodayMs();
          const inner = (
            <Row icon="⏰" color={remindColor(r.remind_at)} title={titleFor(r.memory_id)} strong={urgent}
              trailing={<TimeChip iso={r.remind_at} />} />
          );
          return r.memory_id
            ? <MemoryOpener key={r.id} id={r.memory_id} className="panel-click block">{inner}</MemoryOpener>
            : <div key={r.id}>{inner}</div>;
        })}
      </div>
    </Section>
  );
}

async function RecentSection({ sb, userId }: { sb: any; userId: string }) {
  const { data: recent } = await sb.from("memories").select("id, original_text, created_at, memory_metadata(type, title)")
    .eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false }).limit(5);

  return (
    <Section title="Recent memories" icon="🕘" color="var(--ember)" href="/timeline">
      {recent && recent.length > 0 ? (
        <div className="panel">
          {recent.map((m: any) => {
            const raw: unknown = m.memory_metadata;
            const meta = (Array.isArray(raw) ? raw[0] : raw) ?? {};
            const type = meta.type ?? "thought";
            return (
              <MemoryOpener key={m.id} id={m.id} className="panel-click block">
                <Row icon={typeIcon(type)} color={TYPE_COLOR[type] ?? "var(--ink-2)"} strong={false}
                  title={<span className="line-clamp-2">{m.original_text}</span>}>
                  <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-2">
                    <span className="capitalize font-medium" style={{ color: TYPE_COLOR[type] ?? "var(--ink-2)" }}>{type}</span>
                    <span aria-hidden className="opacity-50">·</span>
                    <span>{relTime(m.created_at)}</span>
                  </span>
                </Row>
              </MemoryOpener>
            );
          })}
        </div>
      ) : <Empty icon="*" title="Your memory is empty." hint="Start by telling TimelyMemo something above." />}
    </Section>
  );
}
