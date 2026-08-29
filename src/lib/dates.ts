export function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Human relative time.
 *  - sub-hour: "in 30 min", "5 min ago"
 *  - same calendar day: "in 3h", "2h ago"
 *  - calendar-day based: "tomorrow", "yesterday", "in 4 days"
 *  (Uses calendar days, NOT floor of elapsed time - so a due time later
 *   today never shows as "tomorrow".) */
export function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const diffMs = Date.now() - t.getTime();
  const future = diffMs < 0;
  const mins = Math.round(Math.abs(diffMs) / 60_000);

  if (mins < 1) return future ? "any moment now" : "just now";
  if (mins < 60) return future ? `in ${mins} min` : `${mins} min ago`;

  const hours = Math.round(mins / 60);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayStart = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const dayDiff = Math.round((dayStart - todayStart) / 86_400_000);

  if (dayDiff === 0) return future ? `in ${hours}h` : `${hours}h ago`;
  if (dayDiff === 1) return "tomorrow";
  if (dayDiff === -1) return "yesterday";
  const days = Math.abs(dayDiff);
  return future ? `in ${days} days` : `${days} days ago`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function localISO(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
