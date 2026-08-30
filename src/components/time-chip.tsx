import { relTime } from "@/lib/dates";

export type TimeTone = "past" | "soon" | "today" | "future" | "none";

/** Urgency classification for a deadline/reminder:
 *  past -> red, <15min -> red, later today -> orange, beyond today -> green. */
export function timeTone(iso?: string | null): TimeTone {
  if (!iso) return "none";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "none";
  const now = Date.now();
  if (t < now) return "past";
  if (t <= now + 15 * 60_000) return "soon";
  const endToday = new Date();
  endToday.setHours(23, 59, 59, 999);
  if (t <= endToday.getTime()) return "today";
  return "future";
}

const TONE_COLOR: Record<TimeTone, string> = {
  past: "var(--danger)",
  soon: "var(--danger)",
  today: "var(--ember)",
  future: "var(--success)",
  none: "var(--ink-2)",
};

/** Colored relative-time chip. Server-component safe (no hooks). */
export function TimeChip({ iso, prefix = "", className = "" }: {
  iso?: string | null; prefix?: string; className?: string;
}) {
  const color = TONE_COLOR[timeTone(iso)];
  return (
    <span
      className={`chip font-medium ${className}`}
      style={{ color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)` }}
    >
      {prefix}{relTime(iso)}
    </span>
  );
}
