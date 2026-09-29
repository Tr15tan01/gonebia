import { buildReport, localDate, sleepWindow, zonedToInstant, type SleepNote, type SleepReport } from "@/lib/sleep";

/** Words that make a note worth reading for sleep, besides type = "sleep". */
const SLEEP_WORDS = ["sleep", "slept", "bed", "woke", "wake", "got up", "get up", "good night", "good morning", "nap", "asleep", "awake"];

export interface SleepNoteRow extends SleepNote { title: string }

function safeTz(tz: string | null | undefined): string {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC" }); return tz || "UTC"; } catch { return "UTC"; }
}

function toRow(m: any): SleepNoteRow {
  const meta = (Array.isArray(m.memory_metadata) ? m.memory_metadata[0] : m.memory_metadata) ?? {};
  return {
    id: m.id, text: m.original_text, created_at: m.created_at, title: meta.title ?? "",
    occurred_at: meta.occurred_at ?? null, sleep_hours: meta.sleep_hours ?? null,
    sleep_event: meta.sleep_event ?? null, type: meta.type ?? null,
  };
}

export const SleepService = {
  /** Every note that could describe sleep between two instants: anything the
   *  AI typed as "sleep" (any language) plus anything whose wording mentions
   *  bed, waking or sleeping. */
  async notesBetween(sb: any, fromIso: string, toIso: string): Promise<SleepNoteRow[]> {
    const run = async (withEventCol: boolean) => {
      const cols = `type, title, occurred_at, sleep_hours${withEventCol ? ", sleep_event" : ""}`;
      return Promise.all([
        sb.from("memories").select(`id, original_text, created_at, memory_metadata!inner(${cols})`)
          .is("deleted_at", null).gte("created_at", fromIso).lte("created_at", toIso)
          .eq("memory_metadata.type", "sleep").order("created_at", { ascending: true }).limit(400),
        sb.from("memories").select(`id, original_text, created_at, memory_metadata(${cols})`)
          .is("deleted_at", null).gte("created_at", fromIso).lte("created_at", toIso)
          .or(SLEEP_WORDS.map((w) => `original_text.ilike."%${w}%"`).join(","))
          .order("created_at", { ascending: true }).limit(400),
      ]);
    };
    let [typed, worded] = await run(true);
    if (typed.error || worded.error) [typed, worded] = await run(false); // migration 0025 not run yet
    const byId = new Map<string, SleepNoteRow>();
    for (const m of [...(typed.data ?? []), ...(worded.data ?? [])]) byId.set(m.id, toRow(m));
    return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
  },

  /** Nights, totals and averages for the period a question is about. */
  async reportFor(
    sb: any, question: string, timezone: string, planFrom?: string | null, planTo?: string | null,
  ): Promise<{ report: SleepReport; notes: SleepNoteRow[]; tz: string }> {
    const tz = safeTz(timezone);
    const { from, to } = sleepWindow(question, tz, Date.now(), planFrom, planTo);
    // read a day either side: a night ending on `from` starts the evening before
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const fromIso = new Date(zonedToInstant(fy, fm, fd, 0, 0, tz) - 86_400_000).toISOString();
    const toIso = new Date(zonedToInstant(ty, tm, td, 23, 59, tz) + 86_400_000).toISOString();
    const notes = await this.notesBetween(sb, fromIso, toIso);
    return { report: buildReport(notes, tz, from, to > localDate(Date.now(), tz) ? localDate(Date.now(), tz) : to), notes, tz };
  },
};
