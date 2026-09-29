/**
 * Sleep from ordinary notes.
 *
 * People rarely write "slept 7.5 hours". They write "going to bed" at
 * 23:40 and "woke up" at 07:10, or "went to bed at 1, up at 8" the next
 * morning. This turns those notes into nights:
 *
 *   1. every note becomes events - bedtime / wake-up at a moment in time
 *      (a clock time written in the note, else the moment the note was sent)
 *      - or a stated duration ("slept 6 hours");
 *   2. each wake-up is paired with the latest bedtime before it (1.5-16 h);
 *   3. a stated duration beats a computed one for the same night;
 *   4. nights are grouped by the local date they END on (the morning).
 *
 * All arithmetic is done here, in the user's timezone - the language model
 * only phrases the result, it never adds up hours itself.
 *
 * Pure functions, no I/O.
 */

export type SleepEventKind = "bedtime" | "wake";

export interface SleepNote {
  id: string;
  text: string;
  created_at: string;
  occurred_at?: string | null;
  sleep_hours?: number | string | null;
  sleep_event?: SleepEventKind | null;
  /** memory type - plans and to-dos ("remind me to wake up at 7") aren't sleep */
  type?: string | null;
}

export interface SleepEvent { kind: SleepEventKind; at: number; memoryId: string; fromMessageTime: boolean }

export interface Night {
  date: string;              // local YYYY-MM-DD the night ended on
  hours: number;
  source: "stated" | "computed";
  bed?: number;
  wake?: number;
  memoryIds: string[];
}

export interface SleepReport {
  from: string; to: string;  // local dates, inclusive
  days: number;
  nights: Night[];
  naps: { date: string; hours: number; memoryId: string }[];
  avg: number | null;
  total: number;
  shortest: Night | null;
  longest: Night | null;
  unpairedBedtimes: number;
  unpairedWakes: number;
  weeks: { weekOf: string; nights: number; avg: number }[];
}

/* ---------------- timezone helpers ---------------- */

function parts(instant: number, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(instant))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return { y: p.year, m: p.month, d: p.day, h: p.hour === 24 ? 0 : p.hour, min: p.minute, s: p.second };
}

function offsetAt(instant: number, tz: string): number {
  const p = parts(instant, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(instant / 1000) * 1000;
}

/** Local wall-clock time in `tz` -> UTC instant (DST-safe to the minute). */
export function zonedToInstant(y: number, m: number, d: number, h: number, min: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const first = guess - offsetAt(guess, tz);
  return guess - offsetAt(first, tz);
}

export function localDate(instant: number, tz: string): string {
  const p = parts(instant, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function localClock(instant: number, tz: string): string {
  const p = parts(instant, tz);
  return `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
}

function addDays(date: string, n: number): string {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/* ---------------- reading notes ---------------- */

// a greeting only counts at the very start of a note ("good night!"), not
// inside one ("had a good night with friends")
const BED = /\b(?:go(?:ing)?|went|gone|head(?:ing|ed)?|off|get(?:ting)?|got)\s+(?:to\s+)?(?:bed|sleep)\b|\bbed\s*time\b|\bfell\s+asleep\b|\bfalling\s+asleep\b|^\s*good\s*nigh?te?\b|\bsleeping\s+now\b|\blights\s+out\b|\b(?:in\s+)?bed(?=\s+(?:at|by|around)\s+\d)|\basleep(?=\s+(?:at|by|around)\s+\d)/gi;
const WAKE = /\b(?:woke|waking|woken)(?:\s+up)?\b|\bwake\s+up\b|\b(?:got|getting)\s+(?:up|out\s+of\s+bed)\b|\bup(?=\s+at\s+\d)|^\s*good\s+morning\b|\bawake\s+(?:now|since)\b/gi;
// "went to bed" / "woke up" with no clock time: only trust the message time
// when the note is clearly about right now
const BED_NOW = /\b(?:going|heading|off)\s+(?:to\s+)?(?:bed|sleep)\b|^\s*good\s*nigh?te?\b|\bsleeping\s+now\b|\bbed\s*time\b|\blights\s+out\b/i;
const WAKE_NOW = /\bjust\s+(?:woke|got\s+up)\b|\b(?:woke|got)\s+up\b|\bgood\s+morning\b|\bawake\s+now\b|\bwaking\s+up\b/i;
// plans and wishes aren't nights that happened
const INTENT = /\b(?:will|won'?t|gonna|plan(?:ning)?\s+to|wants?\s+to|should|must|need\s+to|have\s+to|try(?:ing)?\s+to|remind\s+me|alarm|every\s+day|habit)\b/i;
const NOT_SLEEP_TYPES = new Set(["task", "reminder", "promise", "commitment", "goal", "habit", "event", "project"]);
const NAP = /\bnap|\bsiesta|\bdoz(?:e|ed|ing)\b|\bpower\s*nap/i;

interface Clock { h: number; min: number; meridiem: "am" | "pm" | null }

const TIME_PATTERNS: RegExp[] = [
  /\b(midnight|noon)\b/i,
  /\b(?:at|around|about|by|till|until|@|~)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?(?!\s*(?:hours?|hrs?|h\b|minutes?|mins?|%|\/|th\b|st\b|nd\b|rd\b))/i,
  /\b(\d{1,2})[:.](\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/i,
  /\b(\d{1,2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?![a-z])/i,
];

function findClock(segment: string): Clock | null {
  const special = segment.match(TIME_PATTERNS[0]);
  let best: { idx: number; clock: Clock } | null = special
    ? { idx: special.index!, clock: { h: special[1].toLowerCase() === "noon" ? 12 : 0, min: 0, meridiem: null } }
    : null;
  for (const re of TIME_PATTERNS.slice(1)) {
    const m = segment.match(re);
    if (!m) continue;
    let h: number, min: number, mer: string | undefined;
    if (re === TIME_PATTERNS[3]) { h = Number(m[1]); min = 0; mer = m[2]; }
    else { h = Number(m[1]); min = m[2] ? Number(m[2]) : 0; mer = m[3]; }
    if (h > 24 || min > 59) continue;
    const meridiem = mer ? (mer.toLowerCase().startsWith("p") ? "pm" : "am") : null;
    if (!best || m.index! < best.idx) best = { idx: m.index!, clock: { h, min, meridiem } };
  }
  return best?.clock ?? null;
}

/** 24h hour for a clock reading, using what the event makes plausible
 *  when there's no am/pm ("bed at 11" = 23:00, "up at 7" = 07:00). */
function hour24(c: Clock, kind: SleepEventKind): number {
  if (c.meridiem === "am") return c.h % 12;
  if (c.meridiem === "pm") return (c.h % 12) + 12;
  if (c.h >= 13 || c.h === 0) return c.h % 24;
  if (kind === "bedtime") {
    if (c.h === 12) return 0;        // "bed at 12" = midnight
    if (c.h >= 6) return c.h + 12;   // "bed at 10" = 22:00
    return c.h;                      // "bed at 2" = 02:00
  }
  return c.h;                        // "up at 7" = 07:00, "up at 12" = noon
}

/** Places a clock time on the right calendar day relative to the moment
 *  the note was written ("went to bed at 23:40", written 07:30 = last night). */
function anchor(kind: SleepEventKind, clock: Clock, written: number, tz: string): number {
  const p = parts(written, tz);
  let at = zonedToInstant(p.y, p.m, p.d, hour24(clock, kind), clock.min, tz);
  const H = 3_600_000;
  const [ahead, behind] = kind === "bedtime" ? [2 * H, 14 * H] : [2 * H, 20 * H];
  if (at > written + ahead) at -= 24 * H;
  else if (at < written - behind) at += 24 * H;
  return at;
}

/** All bedtime / wake-up events a note describes (a note can hold both:
 *  "went to bed at 11 and woke up at 7"). */
export function eventsFromNote(n: SleepNote, tz: string): SleepEvent[] {
  const written = new Date(n.created_at).getTime();
  const text = n.text ?? "";
  const wordingUsable = !(n.type && NOT_SLEEP_TYPES.has(n.type)) && !INTENT.test(text);
  const hits: { kind: SleepEventKind; start: number; end: number }[] = [];
  for (const [kind, re] of [["bedtime", BED], ["wake", WAKE]] as const) {
    re.lastIndex = 0;
    for (let m; (m = re.exec(text));) hits.push({ kind, start: m.index, end: m.index + m[0].length });
  }
  hits.sort((a, b) => a.start - b.start);
  // collapse consecutive hits of the same kind ("going to bed, good night")
  const clauses = hits.filter((h, i) => i === 0 || hits[i - 1].kind !== h.kind);

  const events: SleepEvent[] = [];
  if (wordingUsable) clauses.forEach((c, i) => {
    const next = clauses[i + 1];
    const windowEnd = Math.min(next ? next.start : text.length, c.end + 60);
    const clock = findClock(text.slice(c.end, windowEnd)) ?? findClock(text.slice(Math.max(0, c.start - 20), c.start));
    if (clock) {
      events.push({ kind: c.kind, at: anchor(c.kind, clock, written, tz), memoryId: n.id, fromMessageTime: false });
    } else if (clauses.length === 1 && (c.kind === "bedtime" ? BED_NOW : WAKE_NOW).test(text)) {
      // "going to bed" / "just woke up" - the note's own timestamp is the moment
      events.push({ kind: c.kind, at: written, memoryId: n.id, fromMessageTime: true });
    }
  });

  // tagged at capture by the AI (any language) but no English wording found
  if (!events.length && n.sleep_event) {
    const occurred = n.occurred_at ? new Date(n.occurred_at).getTime() : NaN;
    const useOccurred = Number.isFinite(occurred) && Math.abs(occurred - written) > 5 * 60_000;
    events.push({ kind: n.sleep_event, at: useOccurred ? occurred : written, memoryId: n.id, fromMessageTime: !useOccurred });
  }
  return events;
}

/* ---------------- nights ---------------- */

export function buildReport(notes: SleepNote[], tz: string, from: string, to: string): SleepReport {
  const H = 3_600_000;
  const sorted = [...notes].sort((a, b) => a.created_at.localeCompare(b.created_at));

  // stated durations - later notes correct earlier ones for the same night
  const stated = new Map<string, Night>();
  const naps: SleepReport["naps"] = [];
  const statedIds = new Set<string>();
  for (const n of sorted) {
    const hours = n.sleep_hours == null || n.sleep_hours === "" ? NaN : Number(n.sleep_hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 20) continue;
    const when = new Date(n.occurred_at ?? n.created_at).getTime();
    const date = localDate(when, tz);
    statedIds.add(n.id);
    if (NAP.test(n.text)) { naps.push({ date, hours, memoryId: n.id }); continue; }
    stated.set(date, { date, hours, source: "stated", memoryIds: [n.id] });
  }

  // computed from bedtime -> wake-up pairs (notes that stated a duration
  // already describe their whole night)
  const events = sorted.filter((n) => !statedIds.has(n.id))
    .flatMap((n) => eventsFromNote(n, tz))
    .sort((a, b) => a.at - b.at);
  const computed = new Map<string, Night>();
  let lastBed: SleepEvent | null = null;
  let lastNight: Night | null = null;
  let unpairedBedtimes = 0, unpairedWakes = 0;
  for (const ev of events) {
    if (ev.kind === "bedtime") {
      if (lastBed) unpairedBedtimes++;   // an earlier bedtime is superseded
      lastBed = ev;
      lastNight = null;
      continue;
    }
    if (lastBed && ev.at - lastBed.at >= 1.5 * H && ev.at - lastBed.at <= 16 * H) {
      const night: Night = {
        date: localDate(ev.at, tz), hours: (ev.at - lastBed.at) / H, source: "computed",
        bed: lastBed.at, wake: ev.at, memoryIds: [lastBed.memoryId, ev.memoryId],
      };
      computed.set(night.date, night);
      lastNight = night;
      lastBed = null;
    } else if (lastNight && ev.at - (lastNight.wake ?? 0) <= 4 * H && ev.at > (lastNight.wake ?? 0)) {
      // "woke at 5 ... got up at 7" - the night ends at the final wake-up
      lastNight.wake = ev.at;
      lastNight.hours = (ev.at - (lastNight.bed ?? ev.at)) / H;
      lastNight.memoryIds.push(ev.memoryId);
    } else {
      unpairedWakes++;
    }
  }
  if (lastBed) unpairedBedtimes++;

  const all = new Map<string, Night>(computed);
  for (const [date, n] of stated) all.set(date, n); // the user's own number wins

  const nights = [...all.values()]
    .filter((n) => n.date >= from && n.date <= to)
    .map((n) => ({ ...n, hours: Math.round(n.hours * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = nights.reduce((s, n) => s + n.hours, 0);
  const byHours = [...nights].sort((a, b) => a.hours - b.hours);

  const weekMap = new Map<string, number[]>();
  for (const n of nights) {
    const d = new Date(`${n.date}T12:00:00Z`);
    const monday = addDays(n.date, -((d.getUTCDay() + 6) % 7));
    const list = weekMap.get(monday) ?? [];
    list.push(n.hours);
    weekMap.set(monday, list);
  }

  const days = Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000) + 1;
  return {
    from, to, days,
    nights,
    naps: naps.filter((x) => x.date >= from && x.date <= to),
    avg: nights.length ? total / nights.length : null,
    total,
    shortest: byHours[0] ?? null,
    longest: byHours[byHours.length - 1] ?? null,
    unpairedBedtimes,
    unpairedWakes,
    weeks: [...weekMap.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([weekOf, hs]) => ({ weekOf, nights: hs.length, avg: hs.reduce((a, b) => a + b, 0) / hs.length })),
  };
}

/* ---------------- words ---------------- */

export function fmtHours(h: number): string {
  const whole = Math.floor(h + 1e-9);
  const mins = Math.round((h - whole) * 60);
  if (mins === 60) return `${whole + 1}h`;
  return mins ? `${whole}h ${String(mins).padStart(2, "0")}m` : `${whole}h`;
}

function fmtDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** Plain-text summary. Used as the answer's source of truth AND as the
 *  fallback answer when the language model is unavailable. */
export function describeReport(r: SleepReport, tz: string, refFor: (memoryId: string) => number | null = () => null): string {
  if (!r.nights.length) {
    return r.unpairedBedtimes || r.unpairedWakes
      ? `I found ${r.unpairedBedtimes} bedtime and ${r.unpairedWakes} wake-up note(s) between ${fmtDay(r.from)} and ${fmtDay(r.to)}, but none that pair into a full night.`
      : `No sleep notes between ${fmtDay(r.from)} and ${fmtDay(r.to)}.`;
  }
  const cite = (ids: string[]) => {
    const ns = [...new Set(ids.map(refFor).filter((n): n is number => n != null))];
    return ns.length ? " " + ns.map((n) => `[${n}]`).join("") : "";
  };
  const lines = r.nights.map((n) => {
    const how = n.source === "stated"
      ? "as you noted"
      : `bed ${localClock(n.bed!, tz)} → up ${localClock(n.wake!, tz)}`;
    return `- ${fmtDay(n.date)}: ${fmtHours(n.hours)} (${how})${cite(n.memoryIds)}`;
  });
  const out = [
    `Sleep ${fmtDay(r.from)} – ${fmtDay(r.to)} (${r.nights.length} night${r.nights.length === 1 ? "" : "s"} recorded out of ${r.days} days):`,
    ...lines,
    `Average: ${fmtHours(r.avg!)} per night · Total: ${fmtHours(r.total)}`,
  ];
  if (r.nights.length > 1) out.push(`Shortest: ${fmtDay(r.shortest!.date)} (${fmtHours(r.shortest!.hours)}) · Longest: ${fmtDay(r.longest!.date)} (${fmtHours(r.longest!.hours)})`);
  if (r.weeks.length > 1) out.push("By week: " + r.weeks.map((w) => `week of ${fmtDay(w.weekOf)}: ${fmtHours(w.avg)} avg over ${w.nights}`).join(" · "));
  if (r.naps.length) out.push(`Naps: ${r.naps.length} (${fmtHours(r.naps.reduce((s, n) => s + n.hours, 0))} in total, not counted in nights)`);
  const gaps = r.unpairedBedtimes + r.unpairedWakes;
  if (gaps) out.push(`${gaps} bedtime/wake-up note${gaps === 1 ? "" : "s"} had no matching partner, so ${gaps === 1 ? "it isn't" : "they aren't"} counted.`);
  return out.join("\n");
}

/* ---------------- question handling ---------------- */

export const SLEEP_QUESTION = /\b(sleep|slept|sleeping|bed\s*time|went to bed|go to bed|woke|wake|waking|get up|got up|insomnia|nap|naps|rest(?:ed)?)\b/i;

/** The date range a sleep question is about, as local dates. */
export function sleepWindow(question: string, tz: string, now = Date.now(), planFrom?: string | null, planTo?: string | null): { from: string; to: string } {
  const today = localDate(now, tz);
  if (planFrom) {
    return { from: localDate(new Date(planFrom).getTime(), tz), to: planTo ? localDate(new Date(planTo).getTime(), tz) : today };
  }
  const q = question.toLowerCase();
  const n = q.match(/\b(?:last|past)\s+(\d{1,3})\s+(day|night|week|month)s?\b/);
  if (n) {
    const k = Number(n[1]) * (n[2] === "week" ? 7 : n[2] === "month" ? 30 : 1);
    return { from: addDays(today, -(Math.min(k, 120) - 1)), to: today };
  }
  if (/\blast night|yesterday\b/.test(q)) return { from: addDays(today, -1), to: today };
  if (/\bthis week\b/.test(q)) {
    const d = new Date(`${today}T12:00:00Z`);
    return { from: addDays(today, -((d.getUTCDay() + 6) % 7)), to: today };
  }
  if (/\bmonth\b/.test(q)) return { from: addDays(today, -29), to: today };
  if (/\bweek\b/.test(q)) return { from: addDays(today, -6), to: today };
  return { from: addDays(today, -13), to: today };
}
